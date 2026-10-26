import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import type { NoteView } from "../types";
import { countWords } from "../lib/text";
import { fullTime, headingForView, relativeTime } from "../lib/time";
import { modLabel } from "../hooks/useTheme";
import { useClickOutside } from "../hooks/useClickOutside";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { Icon } from "./Icon";

const MarkdownPreview = lazy(() =>
  import("./MarkdownPreview").then((module) => ({ default: module.MarkdownPreview })),
);

const saveLabels = {
  saved: "已保存",
  dirty: "未保存",
  saving: "保存中…",
  error: "保存失败",
  conflict: "存在冲突",
} as const;

export function EditorPane({ isDark }: { isDark: boolean }) {
  const note = useAppStore((state) => state.note);
  const activeId = useAppStore((state) => state.activeId);
  const title = useAppStore((state) => state.title);
  const content = useAppStore((state) => state.content);
  const dirty = useAppStore((state) => state.dirty);
  const saveState = useAppStore((state) => state.saveState);
  const savedAt = useAppStore((state) => state.savedAt);
  const preview = useAppStore((state) => state.preview);
  const focusMode = useAppStore((state) => state.focusMode);
  const view = useAppStore((state) => state.view as NoteView);
  const focusTitleToken = useAppStore((state) => state.focusTitleToken);
  const draftPrompt = useAppStore((state) => state.draftPrompt);
  const conflict = useAppStore((state) => state.conflict);
  const setTitle = useAppStore((state) => state.setTitle);
  const setContent = useAppStore((state) => state.setContent);
  const saveActive = useAppStore((state) => state.saveActive);
  const toggleFavorite = useAppStore((state) => state.toggleFavorite);
  const setPreview = useAppStore((state) => state.setPreview);
  const setFocusMode = useAppStore((state) => state.setFocusMode);
  const setHistoryOpen = useAppStore((state) => state.setHistoryOpen);
  const trashActive = useAppStore((state) => state.trashActive);
  const restoreDraft = useAppStore((state) => state.restoreDraft);
  const discardDraft = useAppStore((state) => state.discardDraft);
  const resolveConflict = useAppStore((state) => state.resolveConflict);
  const restoreNote = useAppStore((state) => state.restoreNote);
  const purgeNote = useAppStore((state) => state.purgeNote);
  const setTagFilter = useAppStore((state) => state.setTagFilter);
  const setMobileBrowse = useAppStore((state) => state.setMobileBrowse);
  const addToast = useAppStore((state) => state.addToast);

  const [menuOpen, setMenuOpen] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<CodeEditorHandle>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const words = useMemo(() => countWords(content), [content]);

  useEffect(() => {
    if (!focusTitleToken) return;
    window.setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    }, 30);
  }, [focusTitleToken]);

  useEffect(() => {
    setCursor({ line: 1, column: 1 });
    setMenuOpen(false);
  }, [activeId]);

  useEffect(() => {
    if (!focusMode) return;
    const timer = window.setTimeout(() => {
      editorRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [focusMode]);

  useEffect(() => {
    const onFind = () => editorRef.current?.openFind();
    const onTitle = () => {
      titleRef.current?.focus();
      titleRef.current?.select();
    };
    window.addEventListener("inknote:find", onFind);
    window.addEventListener("inknote:focus-title", onTitle);
    return () => {
      window.removeEventListener("inknote:find", onFind);
      window.removeEventListener("inknote:focus-title", onTitle);
    };
  }, []);

  useEffect(() => {
    const label = note ? `${note.title || "无标题笔记"} — InkNote` : "InkNote";
    document.title = label;
  }, [note]);

  if (!activeId || !note) {
    return <EditorEmpty />;
  }

  const saveTime = savedAt ? relativeTime(savedAt) : "";
  const isTrash = Boolean(note.deletedAt);

  return (
    <section className="editor-pane" aria-label="笔记编辑区">
      <header className="editor-toolbar">
        <div className="editor-toolbar-left">
          <button
            className="icon-button mobile-back"
            onClick={() => setMobileBrowse(true)}
            aria-label="返回笔记列表"
          >
            <Icon name="arrow-left" size={18} />
          </button>
          <div className="editor-breadcrumb">
            <span className="crumb-view">{headingForView(isTrash ? "trash" : view)}</span>
            <Icon name="chevron-right" size={11} />
            <span className="crumb-title">{note.title || "无标题笔记"}</span>
          </div>
        </div>

        <div className="editor-toolbar-actions">
          {!isTrash && (
            <>
              <button
                className="icon-button"
                data-active={note.favorite}
                onClick={() => void toggleFavorite()}
                title={note.favorite ? "取消收藏" : "加入收藏"}
                aria-label={note.favorite ? "取消收藏" : "加入收藏"}
              >
                <Icon name="star" size={17} filled={note.favorite} />
              </button>
              <button
                className="icon-button"
                onClick={() => setHistoryOpen(true)}
                title={`版本历史 (${modLabel()}+Shift+H)`}
                aria-label="版本历史"
              >
                <Icon name="history" size={17} />
              </button>
              <button
                className="icon-button preview-toggle"
                data-active={preview}
                onClick={() => setPreview(!preview)}
                title={`${preview ? "返回编辑" : "预览 Markdown"} (${modLabel()}+Shift+V)`}
                aria-label={preview ? "返回编辑" : "预览 Markdown"}
              >
                <Icon name={preview ? "edit" : "eye"} size={17} />
              </button>
              <button
                className="icon-button"
                data-active={focusMode}
                onClick={() => setFocusMode(!focusMode)}
                title={`${focusMode ? "退出专注模式" : "进入专注模式"} (${modLabel()}+Shift+Enter)`}
                aria-label={focusMode ? "退出专注模式" : "进入专注模式"}
              >
                <Icon name={focusMode ? "minimize" : "maximize"} size={17} />
              </button>
              <div className="more-wrap" ref={menuRef}>
                <button
                  className="icon-button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  data-active={menuOpen}
                  title="更多"
                  aria-label="更多操作"
                  aria-expanded={menuOpen}
                >
                  <Icon name="more" size={18} />
                </button>
                {menuOpen && (
                  <div className="context-menu editor-menu" role="menu">
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        void useAppStore.getState().exportActive();
                      }}
                    >
                      <Icon name="download" size={15} />
                      <span>导出 Markdown</span>
                    </button>
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setHistoryOpen(true);
                      }}
                    >
                      <Icon name="history" size={15} />
                      <span>版本历史</span>
                    </button>
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={async () => {
                        setMenuOpen(false);
                        try {
                          await navigator.clipboard.writeText(note.filePath);
                          addToast("文件路径已复制。", { duration: 2400 });
                        } catch {
                          addToast(note.filePath, { duration: 5000 });
                        }
                      }}
                    >
                      <Icon name="file" size={15} />
                      <span>复制文件路径</span>
                    </button>
                    <div className="menu-separator" />
                    <button
                      className="menu-item"
                      data-danger
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        void trashActive();
                      }}
                    >
                      <Icon name="trash" size={15} />
                      <span>移到回收站</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {isTrash && (
        <div className="banner banner-trash" role="status">
          <Icon name="trash" size={16} />
          <div className="banner-copy">
            <strong>这篇笔记在回收站</strong>
            <span>恢复后即可继续编辑。回收站中的内容会在 30 天后自动清理。</span>
          </div>
          <div className="banner-actions">
            <button
              className="button subtle"
              onClick={() => {
                if (window.confirm(`永久删除「${note.title}」？这个操作无法撤销。`)) {
                  void purgeNote(note.id);
                }
              }}
            >
              永久删除
            </button>
            <button className="button solid" onClick={() => void restoreNote(note.id)}>
              <Icon name="restore" size={14} />
              恢复笔记
            </button>
          </div>
        </div>
      )}

      {conflict && conflict.noteId === note.id && (
        <div className="banner banner-warning" role="alert">
          <Icon name="alert" size={16} />
          <div className="banner-copy">
            <strong>文件已在磁盘上被修改</strong>
            <span>这里还有未保存的内容。选择保留哪一份，不会自动覆盖。</span>
          </div>
          <div className="banner-actions">
            <button className="button subtle" onClick={() => void resolveConflict("reload")}>
              重新载入
            </button>
            <button className="button solid" onClick={() => void resolveConflict("keep")}>
              保留我的版本
            </button>
          </div>
        </div>
      )}

      {!conflict && draftPrompt && (
        <div className="banner banner-draft" role="status">
          <Icon name="history" size={16} />
          <div className="banner-copy">
            <strong>发现未保存的草稿</strong>
            <span>来自 {relativeTime(draftPrompt.savedAt)}，比磁盘上的文件更新。</span>
          </div>
          <div className="banner-actions">
            <button className="button subtle" onClick={() => void discardDraft()}>
              丢弃
            </button>
            <button className="button solid" onClick={() => void restoreDraft()}>
              恢复草稿
            </button>
          </div>
        </div>
      )}

      <div className="editor-title-block">
        <input
          ref={titleRef}
          className="title-input"
          value={title}
          readOnly={isTrash}
          onChange={(event) => {
            if (!isTrash) setTitle(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              editorRef.current?.focus();
            }
            if (event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          placeholder="无标题笔记"
          aria-label="笔记标题"
          spellCheck={false}
        />
        <div className="title-meta">
          <span>创建于 {fullTime(note.createdAt)}</span>
          <span className="meta-dot" />
          <span>{words.toLocaleString("zh-CN")} 字</span>
          {note.tags.length > 0 && (
            <>
              <span className="meta-dot" />
              <span className="title-tags">
                {note.tags.map((tag) => (
                  <button
                    key={tag}
                    className="title-tag"
                    onClick={() => {
                      useAppStore.getState().setView("all");
                      setTagFilter(tag);
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </span>
            </>
          )}
          {isTrash && <span className="trash-flag">已删除</span>}
        </div>
      </div>

      <div className="editor-body">
        {preview ? (
          <Suspense
            fallback={
              <div className="preview-loading">
                <span className="search-spinner" />
                正在排版…
              </div>
            }
          >
            <MarkdownPreview content={content} />
          </Suspense>
        ) : (
          <CodeEditor
            ref={editorRef}
            noteId={note.id}
            content={content}
            isDark={isDark}
            readOnly={isTrash}
            onChange={setContent}
            onCursor={setCursor}
            onBlur={() => {
              if (dirty && !isTrash) void saveActive(false);
            }}
          />
        )}
      </div>

      <footer className="editor-status">
        <div className="status-left">
          <span>{words.toLocaleString("zh-CN")} 字</span>
          <span className="status-divider" />
          <span>
            第 {cursor.line} 行，第 {cursor.column} 列
          </span>
          <span className="status-divider" />
          <span>Markdown</span>
        </div>
        <div className="status-right">
          {saveState === "error" && (
            <button
              className="save-retry"
              onClick={() => void saveActive(false)}
              title="再次保存当前内容"
            >
              重试保存
            </button>
          )}
          <span className="save-state" data-state={saveState} title={savedAt ? fullTime(savedAt) : undefined}>
            <span className="save-dot" />
            {saveLabels[saveState]}
            {saveState === "saved" && saveTime ? ` · ${saveTime}` : ""}
          </span>
        </div>
      </footer>
    </section>
  );
}

function EditorEmpty() {
  const notes = useAppStore((state) => state.notes);
  const view = useAppStore((state) => state.view);
  const newNote = useAppStore((state) => state.newNote);
  const setMobileBrowse = useAppStore((state) => state.setMobileBrowse);
  const hasNotes = notes.some((note) => !note.deletedAt);

  return (
    <section className="editor-pane editor-empty-pane" aria-label="空白编辑区">
      <div className="editor-empty">
        <div className="empty-ink" aria-hidden="true">
          <span className="empty-ring" />
          <Icon name="leaf" size={26} />
        </div>
        <p className="empty-eyebrow">{view === "trash" ? "回收站" : "InkNote"}</p>
        <h1>{hasNotes ? "选择一篇笔记，继续写下去" : "把想法留在本机"}</h1>
        <p className="empty-lede">
          {hasNotes
            ? "左侧是全部笔记。按「命令面板」可以搜索、跳转或执行任何操作。"
            : "没有账号，没有同步，没有等待。第一句话落下，InkNote 就会替你安静地保存。"}
        </p>
        {!hasNotes && view !== "trash" && (
          <button className="primary-button" onClick={() => void newNote()}>
            <Icon name="plus" size={16} />
            新建第一篇笔记
          </button>
        )}
        <div className="empty-shortcuts">
          <button className="mobile-only text-button" onClick={() => setMobileBrowse(true)}>
            <Icon name="arrow-left" size={14} />
            返回列表
          </button>
          <span>
            <kbd>{modLabel()}</kbd>
            <kbd>N</kbd>
            新建
          </span>
          <span>
            <kbd>{modLabel()}</kbd>
            <kbd>P</kbd>
            命令面板
          </span>
          <span>
            <kbd>{modLabel()}</kbd>
            <kbd>Shift</kbd>
            <kbd>F</kbd>
            全局搜索
          </span>
        </div>
      </div>
    </section>
  );
}
