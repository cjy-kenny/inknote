# InkNote 架构说明

## 1. 进程边界

```text
┌──────────────────────────────┐
│ React / TypeScript           │
│  UI · Zustand · CodeMirror 6 │
└──────────────┬───────────────┘
               │ Tauri invoke（白名单命令）
┌──────────────▼───────────────┐
│ Rust Core                    │
│  文件原子写 / 版本 / 草稿     │
│  rusqlite + FTS5             │
│  reconcile / 外部修改检测     │
└──────────────┬───────────────┘
               │
        ~/Documents/InkNote
```

前端不持有任意文件系统权限。文件选择、导入、导出通过 Tauri Dialog 插件取得用户明确选择的路径，再由 Rust 命令执行读写。数据目录之外没有后台扫描。

默认数据目录是 `~/Documents/InkNote`；设置环境变量 `INKNOTE_DATA_DIR` 可以覆盖它，Windows 便携启动器即通过该变量把数据留在程序同目录的 `InkNoteData/`。

## 2. 数据所有权

- **正文归文件系统**：`notes/*.md` 是唯一事实来源。
- **SQLite 是可重建的派生索引**：标题、时间、收藏、标签、字数、摘要、FTS。
- **快照与草稿是辅助副本**：分别位于 `.history/` 与 `.drafts/`。
- **回收站是软删除**：文件实际移动到 `.trash/`，30 天后启动时清理。

`reconcile()` 的存在使索引损坏或迁移后仍能从文件恢复：数据库打开失败时，原 DB 会被重命名为 `notes.db.broken-<timestamp>`，然后重新建库并扫描正文。

## 3. 保存与冲突

```text
change ──650ms──▶ save_note
                    │
                    ├─ stat(mtime) != baseMtime? ──▶ structured conflict
                    │
                    ├─ temp file write + sync
                    ├─ rename over target
                    ├─ SQLite update + FTS + tags
                    ├─ remove draft
                    └─ maybe snapshot (manual or >5min)
```

- 原子替换避免半写文件。
- 保存时重新计算 slug；标题改变会改名，旧文件删除。
- 返回新的 `fileMtime`，前端将它作为下一次保存的 base。
- 冲突不会静默覆盖：界面提供「重新载入」与「保留我的版本」。
- 切换笔记、窗口失焦、`visibilitychange`、关闭窗口前都会 flush。

## 4. 搜索策略

FTS5 表：

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  content,
  tokenize='trigram'
);
```

- 查询字符数 ≥ 3：`"<query>"` phrase（空格分词时使用 `AND`），按 `bm25()` 排序。
- 查询字符数 < 3：`LIKE '%query%'`，覆盖中文两字与单字。
- trigram 不可用时：初始化回退到默认 `unicode61`，查询仍可走 `LIKE`。
- 片段：FTS `snippet()` 或 Rust `make_snippet()`，统一输出 `<mark>`；前端 DOMPurify 只保留 `mark`。

索引在每次保存时同步重建；外部修改检测也会重建。列表不加载正文，正文在打开笔记时按需读取。

## 5. 快照与草稿

- **快照**：手动保存必留；自动保存距上次快照 ≥ 5 分钟时留。命名带时间戳，按文件名排序，最多 20 份。
- **草稿**：编辑期间每 3 秒写 `.drafts/{id}.draft`（JSON 含内容、保存时间、base mtime）。启动时 `get_draft()` 与正文 mtime 比较，较新才提示恢复。
- **恢复**：恢复草稿只改编辑器内容并标记 dirty；恢复快照前先为当前内容创建快照，避免不可逆覆盖。

## 6. 软删除与恢复

- 回收站状态：`deleted_at` 非空，文件移动到 `.trash/{id}-{timestamp}.md`，DB 的 `file_path` 指向回收站文件。
- 恢复：按原标题 / 创建时间生成规范文件名，移回 `notes/`，重新索引标签和字数。
- 永久删除：删除正文、DB 行、FTS 行和 `.history/{id}/`。
- 启动清理：`deleted_at < now - 30d` 的记录自动永久删除。

## 7. 权限与 CSP

`src-tauri/capabilities/default.json` 只声明：

- `core:default`
- `core:window:allow-close` / `allow-destroy`（关闭前 flush）
- `dialog:default`
- `opener:default`

Tauri 命令是唯一文件访问入口。CSP 限制脚本、样式、连接与对象加载；生产环境不加载远程资源，不发起网络请求。

## 8. 性能取舍

- 启动只读 SQLite 元数据；正文按需读取。
- 列表使用 `@tanstack/react-virtual` 按行测量，万条笔记仍只渲染可视区域。
- CodeMirror 只加载 Markdown 语言包；预览按需标记渲染。
- 搜索输入防抖 100ms；结果上限 80。
- 保存不阻塞输入：编辑器只更新内存，异步落盘，状态栏给出安静反馈。

## 9. 验证清单

前端：

- `pnpm test`：文本清理、字数、片段、时间格式化。
- `node scripts/e2e.mjs`：浏览器演示后端上的保存、搜索、主题、历史、回收站、草稿、移动端布局。

Rust：

- `text.rs` / `storage.rs` 内含单元测试：标签提取、frontmatter、片段、原子写、快照轮转、草稿往返。
- CI 的 `cargo test` 在 Ubuntu 上编译并运行。

手工验收：

1. 三平台安装包可启动，断网可用。
2. 新建 → 输入 → 强制结束进程 → 重启提示草稿。
3. 复制 `notes/` 到另一台机器，启动后全部出现。
4. 中文两字 / 多字搜索均有结果。
5. 外部编辑器修改文件后切回窗口，出现冲突或重新载入提示。
6. 1 万条元数据下列表滚动与搜索响应。
