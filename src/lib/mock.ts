import type {
  Bootstrap,
  DraftInfo,
  DraftPayload,
  ImportResult,
  NoteMeta,
  NotePayload,
  SaveResult,
  SearchHit,
  Settings,
  SnapshotInfo,
  SnapshotPayload,
  TagCount,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { excerptOf, escapeHtml, countWords } from "./text";
import { dateStamp } from "./time";

const STORAGE_KEY = "inknote.demo.v3";

let cachedState: DemoState | null = null;
let searchCache = new Map<string, string>();

if (typeof window !== "undefined") {
  window.addEventListener("inknote:demo-invalidate", () => {
    cachedState = null;
    searchCache = new Map();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedState = null;
      searchCache = new Map();
    }
  });
}

interface DemoNote {
  meta: NoteMeta;
  content: string;
}

interface SnapshotRecord {
  name: string;
  savedAt: number;
  content: string;
}

interface DemoState {
  notes: Record<string, DemoNote>;
  settings: Settings;
  drafts: Record<string, DraftPayload>;
  snapshots: Record<string, SnapshotRecord[]>;
  seq: number;
}

export class ApiError extends Error {
  code: string;
  detail?: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function seed(): DemoState {
  const now = Date.now();
  const definitions: Array<{
    id: string;
    title: string;
    content: string;
    tags: string[];
    created: number;
    updated: number;
    favorite?: boolean;
  }> = [
    {
      id: "a1b2c3d4",
      title: "欢迎来到 InkNote",
      tags: ["开始"],
      created: now - 6 * DAY,
      updated: now - 12 * MINUTE,
      favorite: true,
      content: `这里没有账号，没有同步，也没有任何需要联网的步骤。你的每一笔，都只是一个普通的 Markdown 文件。

## 从这三件事开始

- 按 \`Ctrl / Cmd + N\` 新建一页。
- 按 \`Ctrl / Cmd + P\` 打开命令面板，搜索笔记、执行操作。
- 内容会在停笔 0.6 秒后自动保存到本地。

> 写作不需要被打断。InkNote 把工具栏收起来，把纸留给你。

## 数据在哪里

默认位于 \`~/Documents/InkNote/notes/\`。可以直接用 Finder、资源管理器或任何编辑器打开；把整个 \`notes/\` 文件夹拷走，就带走了全部正文。

## 一点小提示

侧边栏可以按 \`Ctrl / Cmd + \\\` 收起。喜欢更安静的界面，就去设置里换一种编辑字体，或者切换到墨绿强调色。

祝你写得顺手。`,
    },
    {
      id: "b7c1d2e3",
      title: "周五产品评审 · 会议记录",
      tags: ["工作", "产品"],
      created: now - 2 * DAY,
      updated: now - 3 * HOUR,
      content: `**时间**：10 月 24 日 14:00–15:20
**参与**：林晚、周野、陈默、我
**结论**：先做「足够好」的本地版本，不为想象中的用户提前复杂化。

## 已确认

1. 首版不做账号体系，所有数据留在本机。
2. 正文继续使用 Markdown，索引单独放在 SQLite，二者互不绑架。
3. 自动保存的反馈必须克制：一个安静的状态词，而不是弹窗。
4. 中文搜索以 trigram 为主，短词回退到 LIKE。

## 待办

- [x] 确认文件命名规则：日期-标题-id
- [x] 画出三栏布局与空状态
- [ ] 补一轮 1 万条笔记的滚动测试
- [ ] 在 macOS 上检查菜单栏与快捷键映射

> 周野：宁可少一个功能，也不要多一次解释。`,
    },
    {
      id: "c3d4e5f6",
      title: "读《山茶文具店》",
      tags: ["阅读"],
      created: now - 11 * DAY,
      updated: now - DAY - 2 * HOUR,
      favorite: true,
      content: `代笔人鸠子替人写信，也替人整理那些说不出口的情绪。读完想记下几句。

## 摘记

> 书信，就是把当时的心情封存起来，寄给未来的某个人。

> 重要的不是字漂不漂亮，而是有没有把心放进去。

## 读后感

这本书很慢，但不闷。它相信日常的秩序：磨墨、选纸、挑笔、写信、投递。每一个动作都有重量。

我们做工具也是一样。不是把所有能力堆到用户面前，而是让每一个动作都清楚、可预期。`,
    },
    {
      id: "d4e5f6a7",
      title: "京都 · 十一月清单",
      tags: ["旅行"],
      created: now - 20 * DAY,
      updated: now - 4 * DAY,
      content: `- [ ] 预约苔寺（提前两周）
- [ ] 带一双好走的鞋
- [ ] 去惠文社一乘寺店
- [ ] 在鸭川边坐一个下午
- [ ] 买一本空白手帐

**住宿**：靠近出町柳，晚上安静。
**想去**：恵文社、茂庵、efish、六曜社。

> 不赶行程。每天只安排一件事，其余时间用来走路。`,
    },
    {
      id: "e5f6a7b8",
      title: "灵感收集",
      tags: ["随想"],
      created: now - 3 * DAY,
      updated: now - 5 * HOUR,
      content: `- 笔记软件的「保存」应该像呼吸，而不是像提交表单。
- 好的空状态不是告诉你功能，而是让你想写第一句话。
- 中文排版里，行距比字号更重要。
- 搜索不是列表的附属品，它应该是进入笔记的另一扇门。`,
    },
  ];

  const notes: Record<string, DemoNote> = {};
  for (const item of definitions) {
    notes[item.id] = {
      meta: {
        id: item.id,
        title: item.title,
        filePath: `notes/${dateStamp(item.created)}-demo-${item.id}.md`,
        createdAt: item.created,
        updatedAt: item.updated,
        fileMtime: item.updated,
        favorite: Boolean(item.favorite),
        deletedAt: null,
        wordCount: countWords(item.content),
        excerpt: excerptOf(item.content),
        tags: item.tags,
      },
      content: item.content,
    };
  }

  const previousWelcome = `这里没有账号，没有同步，也没有任何需要联网的步骤。你的每一笔，都只是一个普通的 Markdown 文件。

## 开始

- 新建一页，直接写。
- 内容会自动保存。
- 数据在本地，随时可以带走。

> 把纸留给你。`;

  return {
    notes,
    settings: { ...DEFAULT_SETTINGS, lastNoteId: "a1b2c3d4" },
    drafts: {},
    snapshots: {
      a1b2c3d4: [
        { name: "20261019T101500.md", savedAt: now - 2 * DAY, content: previousWelcome },
        {
          name: "20261024T084200.md",
          savedAt: now - DAY,
          content: `${previousWelcome}\n\n## 数据在哪里\n\n默认位于 \`~/Documents/InkNote/notes/\`。`,
        },
      ],
    },
    seq: 1,
  };
}

function load(): DemoState {
  if (cachedState) return cachedState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed && parsed.notes && parsed.settings) {
        parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        cachedState = parsed;
        return parsed;
      }
    }
  } catch {
    // A corrupt demo store should never block the app.
  }
  const fresh = seed();
  persist(fresh);
  return fresh;
}

function persist(state: DemoState) {
  cachedState = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota is irrelevant for the demo; keep the in-memory state usable.
  }
}

function invalidateSearch(id: string) {
  searchCache.delete(id);
}

function searchTextFor(note: DemoNote): string {
  const cached = searchCache.get(note.meta.id);
  if (cached !== undefined) return cached;
  const text = `${note.meta.title}\n${note.content}\n${note.meta.tags.join(" ")}`.toLocaleLowerCase();
  searchCache.set(note.meta.id, text);
  return text;
}

function primeSearchIndex(state: DemoState) {
  for (const note of Object.values(state.notes)) {
    if (!note.meta.deletedAt) searchTextFor(note);
  }
}

function tagsFor(state: DemoState): TagCount[] {
  const counts = new Map<string, number>();
  for (const { meta } of Object.values(state.notes)) {
    if (meta.deletedAt) continue;
    for (const tag of meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function toMeta(note: DemoNote): NoteMeta {
  return { ...note.meta, tags: [...note.meta.tags] };
}

function sortedNotes(state: DemoState): NoteMeta[] {
  return Object.values(state.notes)
    .map((note) => toMeta(note))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function sleep(ms = 16): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function snippet(content: string, query: string): string {
  const lower = content.toLocaleLowerCase();
  const q = query.toLocaleLowerCase();
  const idx = lower.indexOf(q);
  const start = Math.max(0, idx - 52);
  const end = Math.min(content.length, (idx < 0 ? 0 : idx) + q.length + 96);
  const raw = (start > 0 ? "…" : "") + content.slice(start, end) + (end < content.length ? "…" : "");
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!q) return escapeHtml(clean);
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return escapeHtml(clean);
  return escapeHtml(clean).replace(new RegExp(`(${terms.join("|")})`, "gi"), "<mark>$1</mark>");
}

export async function mockInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  await sleep();
  const state = load();

  const requireNote = (id: string): DemoNote => {
    const note = state.notes[id];
    if (!note) throw new ApiError("not_found", "这篇笔记已经不存在了。");
    return note;
  };

  let result: unknown;

  switch (command) {
    case "bootstrap": {
      primeSearchIndex(state);
      const payload: Bootstrap = {
        notes: sortedNotes(state),
        settings: state.settings,
        dataDir: "~/Documents/InkNote",
        drafts: Object.values(state.drafts)
          .map<DraftInfo>((draft) => ({
            noteId: draft.noteId,
            savedAt: draft.savedAt,
            preview: excerptOf(draft.content, 80),
          }))
          .sort((a, b) => b.savedAt - a.savedAt),
        tags: tagsFor(state),
        version: "0.1.0-demo",
      };
      result = payload;
      break;
    }

    case "create_note": {
      const title = String(args.title ?? "").trim() || "无标题笔记";
      const content = String(args.content ?? "");
      const id = (Date.now().toString(16) + Math.random().toString(16).slice(2, 6)).slice(-8);
      const now = Date.now();
      const note: DemoNote = {
        meta: {
          id,
          title,
          filePath: `notes/${dateStamp(now)}-${id}.md`,
          createdAt: now,
          updatedAt: now,
          fileMtime: now,
          favorite: false,
          deletedAt: null,
          wordCount: countWords(content),
          excerpt: excerptOf(content),
          tags: [],
        },
        content,
      };
      state.notes[id] = note;
      state.settings.lastNoteId = id;
      persist(state);
      result = { note: toMeta(note), content } satisfies NotePayload;
      break;
    }

    case "get_note": {
      const note = requireNote(String(args.id));
      result = { note: toMeta(note), content: note.content } satisfies NotePayload;
      break;
    }

    case "save_note": {
      const note = requireNote(String(args.id));
      const baseMtime = Number(args.baseMtime ?? 0);
      const force = Boolean(args.force);
      if (!force && baseMtime > 0 && Math.abs(note.meta.fileMtime - baseMtime) > 3) {
        throw new ApiError("external_conflict", "文件在磁盘上被其他程序修改过。", {
          diskMtime: note.meta.fileMtime,
        });
      }
      const title = String(args.title ?? "").trim() || "无标题笔记";
      const content = String(args.content ?? "");
      const now = Date.now();
      note.meta.title = title;
      note.meta.updatedAt = now;
      note.meta.fileMtime = now;
      note.meta.wordCount = countWords(content);
      note.meta.excerpt = excerptOf(content);
      note.content = content;
      invalidateSearch(note.meta.id);
      state.settings.lastNoteId = note.meta.id;
      delete state.drafts[note.meta.id];
      let snapshotCreated = false;
      if (args.manual || !state.snapshots[note.meta.id]?.length) {
        const list = state.snapshots[note.meta.id] ?? [];
        const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
        list.push({ name: `${stamp}.md`, savedAt: now, content });
        state.snapshots[note.meta.id] = list.slice(-20);
        snapshotCreated = true;
      }
      persist(state);
      result = { note: toMeta(note), savedAt: now, snapshotCreated } satisfies SaveResult;
      break;
    }

    case "set_favorite": {
      const note = requireNote(String(args.id));
      note.meta.favorite = Boolean(args.favorite);
      persist(state);
      result = toMeta(note);
      break;
    }

    case "trash_note": {
      const note = requireNote(String(args.id));
      note.meta.deletedAt = Date.now();
      if (state.settings.lastNoteId === note.meta.id) state.settings.lastNoteId = null;
      persist(state);
      result = toMeta(note);
      break;
    }

    case "restore_note": {
      const note = requireNote(String(args.id));
      note.meta.deletedAt = null;
      invalidateSearch(note.meta.id);
      persist(state);
      result = toMeta(note);
      break;
    }

    case "purge_note": {
      const id = String(args.id);
      delete state.notes[id];
      delete state.drafts[id];
      delete state.snapshots[id];
      invalidateSearch(id);
      persist(state);
      result = null;
      break;
    }

    case "empty_trash": {
      for (const [id, note] of Object.entries(state.notes)) {
        if (note.meta.deletedAt) {
          delete state.notes[id];
          invalidateSearch(id);
        }
      }
      persist(state);
      result = null;
      break;
    }

    case "search_notes": {
      const query = String(args.query ?? "").trim();
      const limit = Number(args.limit ?? 80);
      if (!query) {
        result = [] satisfies SearchHit[];
        break;
      }
      const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const hits: SearchHit[] = [];
      for (const note of Object.values(state.notes)) {
        if (note.meta.deletedAt) continue;
        const haystack = searchTextFor(note);
        if (!terms.every((term) => haystack.includes(term))) continue;
        hits.push({ note: toMeta(note), snippet: snippet(note.content, query) });
      }
      hits.sort((a, b) => b.note.updatedAt - a.note.updatedAt);
      result = hits.slice(0, limit);
      break;
    }

    case "save_draft": {
      const note = requireNote(String(args.noteId));
      state.drafts[note.meta.id] = {
        noteId: note.meta.id,
        content: String(args.content ?? ""),
        savedAt: Date.now(),
        baseMtime: Number(args.baseMtime ?? note.meta.fileMtime),
      };
      persist(state);
      result = null;
      break;
    }

    case "get_draft": {
      const draft = state.drafts[String(args.noteId)];
      result = draft ? ({ ...draft } satisfies DraftPayload) : null;
      break;
    }

    case "discard_draft": {
      delete state.drafts[String(args.noteId)];
      persist(state);
      result = null;
      break;
    }

    case "list_drafts": {
      result = Object.values(state.drafts)
        .map<DraftInfo>((draft) => ({
          noteId: draft.noteId,
          savedAt: draft.savedAt,
          preview: excerptOf(draft.content, 80),
        }))
        .sort((a, b) => b.savedAt - a.savedAt);
      break;
    }

    case "list_snapshots": {
      const list = state.snapshots[String(args.noteId)] ?? [];
      result = list
        .map<SnapshotInfo>((snapshot) => ({
          name: snapshot.name,
          savedAt: snapshot.savedAt,
          size: snapshot.content.length,
        }))
        .sort((a, b) => b.savedAt - a.savedAt);
      break;
    }

    case "read_snapshot": {
      const name = String(args.name);
      const snapshot = (state.snapshots[String(args.noteId)] ?? []).find((item) => item.name === name);
      if (!snapshot) throw new ApiError("not_found", "这个版本已经不在了。");
      result = {
        info: { name: snapshot.name, savedAt: snapshot.savedAt, size: snapshot.content.length },
        content: snapshot.content,
      } satisfies SnapshotPayload;
      break;
    }

    case "restore_snapshot": {
      const note = requireNote(String(args.noteId));
      const snapshot = (state.snapshots[note.meta.id] ?? []).find(
        (item) => item.name === String(args.name),
      );
      if (!snapshot) throw new ApiError("not_found", "这个版本已经不在了。");
      note.content = snapshot.content;
      note.meta.updatedAt = Date.now();
      note.meta.fileMtime = Date.now();
      note.meta.wordCount = countWords(snapshot.content);
      note.meta.excerpt = excerptOf(snapshot.content);
      invalidateSearch(note.meta.id);
      persist(state);
      result = { note: toMeta(note), content: snapshot.content } satisfies NotePayload;
      break;
    }

    case "check_external_changes":
      result = [];
      break;

    case "update_settings": {
      state.settings = { ...state.settings, ...(args.settings as Partial<Settings>) };
      persist(state);
      result = state.settings;
      break;
    }

    case "refresh_notes":
      result = sortedNotes(state);
      break;

    case "import_texts": {
      const files = (args.files ?? []) as Array<{ name: string; content: string }>;
      const created: NoteMeta[] = [];
      for (const file of files) {
        const id = (Date.now().toString(16) + Math.random().toString(16).slice(2, 6)).slice(-8);
        const title =
          file.name.replace(/\.(md|markdown|txt)$/i, "").trim() ||
          file.content.match(/^#\s+(.+)$/m)?.[1] ||
          "导入的笔记";
        const now = Date.now();
        const note: DemoNote = {
          meta: {
            id,
            title,
            filePath: `notes/${dateStamp(now)}-import-${id}.md`,
            createdAt: now,
            updatedAt: now,
            fileMtime: now,
            favorite: false,
            deletedAt: null,
            wordCount: countWords(file.content),
            excerpt: excerptOf(file.content),
            tags: [],
          },
          content: file.content,
        };
        state.notes[id] = note;
        created.push(toMeta(note));
      }
      persist(state);
      result = { imported: created.length, skipped: 0, notes: created } satisfies ImportResult;
      break;
    }

    case "open_data_dir":
      throw new ApiError(
        "demo_mode",
        "浏览器演示模式没有本地目录。桌面版会打开 ~/Documents/InkNote。",
      );

    default:
      throw new ApiError("unknown_command", `未知命令：${command}`);
  }

  return result as T;
}
