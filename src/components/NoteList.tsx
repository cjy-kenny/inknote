import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useShallow } from "zustand/react/shallow";
import {
  selectVisibleNotes,
  useAppStore,
} from "../store/useAppStore";
import type { NoteMeta, SortMode } from "../types";
import { headingForView, listTime } from "../lib/time";
import { api } from "../lib/api";
import { Icon } from "./Icon";
import { NoteContextMenu } from "./NoteContextMenu";

const sortLabels: Record<SortMode, string> = {
  updated: "最近修改",
  created: "创建时间",
  title: "标题排序",
};

export const NoteList = memo(function NoteList() {
  const view = useAppStore((state) => state.view);
  const tagFilter = useAppStore((state) => state.tagFilter);
  const sort = useAppStore((state) => state.sort);
  const activeId = useAppStore((state) => state.activeId);
  const notes = useAppStore(useShallow(selectVisibleNotes));
  const totalNotes = useAppStore((state) => state.notes);
  const setSort = useAppStore((state) => state.setSort);
  const newNote = useAppStore((state) => state.newNote);
  const openNote = useAppStore((state) => state.openNote);
  const emptyTrash = useAppStore((state) => state.emptyTrash);
  const addToast = useAppStore((state) => state.addToast);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const listWidth = useAppStore((state) => state.listWidth);
  const setListWidth = useAppStore((state) => state.setListWidth);

  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{ note: NoteMeta; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const filtered = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return notes;
    return notes.filter((note) => {
      const haystack = `${note.title}\n${note.excerpt}\n${note.tags.join(" ")}`.toLocaleLowerCase();
      return query.split(/\s+/).every((term) => haystack.includes(term));
    });
  }, [filter, notes]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  useEffect(() => {
    setFilter("");
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view, tagFilter]);

  useEffect(() => {
    const clearResize = () => {
      dragRef.current = null;
      document.body.classList.remove("is-resizing");
    };
    window.addEventListener("blur", clearResize);
    return () => {
      window.removeEventListener("blur", clearResize);
      clearResize();
    };
  }, []);

  useEffect(() => {
    const index = filtered.findIndex((note) => note.id === activeId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
    // Only react to note selection, not to every list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const onFocusFilter = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        filterRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onFocusFilter);
    return () => window.removeEventListener("keydown", onFocusFilter);
  }, []);

  const cycleSort = () => {
    const order: SortMode[] = ["updated", "created", "title"];
    setSort(order[(order.indexOf(sort) + 1) % order.length]);
  };

  const openMenu = (note: NoteMeta, x: number, y: number) => {
    setMenu({ note, x, y });
  };

  const wordTotal = useMemo(
    () => filtered.reduce((sum, note) => sum + note.wordCount, 0),
    [filtered],
  );

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || window.innerWidth < 760) return;
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startWidth: panelRef.current?.getBoundingClientRect().width ?? listWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing");
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setListWidth(drag.startWidth + event.clientX - drag.startX);
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.classList.remove("is-resizing");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const emptyTitle =
    view === "trash"
      ? "回收站是空的"
      : filter
        ? "没有匹配的笔记"
        : view === "recent"
          ? "还没有最近打开"
          : view === "favorites"
            ? "还没有收藏"
            : tagFilter
              ? `没有「${tagFilter}」标签的笔记`
              : "从第一句话开始";

  return (
    <section ref={panelRef} className="note-list-panel" aria-label="笔记列表">
      <header className="list-header">
        <div className="list-heading-row">
          <button
            className="icon-button mobile-menu"
            onClick={toggleSidebar}
            aria-label="打开导航"
          >
            <Icon name="panel-left" size={18} />
          </button>
          <div className="list-heading">
            <h2>{tagFilter ? `#${tagFilter}` : headingForView(view)}</h2>
            <span className="list-count">{filtered.length}</span>
          </div>
          <div className="list-actions">
            {view !== "trash" && (
              <button
                className="new-note-button"
                onClick={() => void newNote()}
                title="新建笔记 (Ctrl/Cmd + N)"
                aria-label="新建笔记"
              >
                <Icon name="plus" size={17} />
              </button>
            )}
          </div>
        </div>

        <div className="list-toolbar">
          <div className="list-filter">
            <Icon name="search" size={14} />
            <input
              ref={filterRef}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="筛选列表"
              aria-label="筛选笔记列表"
              spellCheck={false}
            />
            {filter && (
              <button
                className="filter-clear"
                onClick={() => setFilter("")}
                aria-label="清除筛选"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
          {view !== "trash" && (
            <button
              className="sort-button"
              onClick={cycleSort}
              title={`排序：${sortLabels[sort]}`}
              aria-label={`排序：${sortLabels[sort]}`}
            >
              <Icon name="sort" size={14} />
              <span>{sortLabels[sort]}</span>
            </button>
          )}
        </div>
      </header>

      <div className="note-list-scroll" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="list-empty">
            <div className="list-empty-mark">
              <Icon name={view === "trash" ? "trash" : filter ? "search" : "leaf"} size={22} />
            </div>
            <p className="list-empty-title">{emptyTitle}</p>
            <p className="list-empty-copy">
              {view === "trash"
                ? "删除的笔记会在这里保留 30 天。"
                : filter
                  ? "换个词试试，或者清空筛选。"
                  : view === "recent"
                    ? "打开过的笔记会按时间倒序出现在这里。"
                    : view === "favorites"
                      ? "点开一篇笔记，点标题旁的星标即可收藏。"
                      : "写下一点什么，它会自动保存在本地。"}
            </p>
            {view !== "trash" && !filter && (
              <button className="text-button" onClick={() => void newNote()}>
                <Icon name="plus" size={14} />
                新建一篇
              </button>
            )}
          </div>
        ) : (
          <div
            className="virtual-list"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const note = filtered[row.index];
              return (
                <div
                  key={note.id}
                  className="note-row"
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <div
                    className="note-item"
                    role="button"
                    tabIndex={0}
                    data-active={note.id === activeId}
                    data-deleted={Boolean(note.deletedAt)}
                    onClick={() => void openNote(note.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openNote(note.id);
                      }
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openMenu(note, event.clientX, event.clientY);
                    }}
                    aria-current={note.id === activeId ? "page" : undefined}
                    aria-label={`打开笔记：${note.title || "无标题笔记"}`}
                  >
                    <div className="note-item-top">
                      <span className="note-item-title">{note.title || "无标题笔记"}</span>
                      {note.favorite && !note.deletedAt && (
                        <Icon name="star" size={12} filled className="note-star" />
                      )}
                      <button
                        type="button"
                        className="note-more"
                        aria-label="更多操作"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                          openMenu(note, rect.right - 8, rect.bottom + 4);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Icon name="more" size={15} />
                      </button>
                    </div>
                    <p className="note-item-excerpt">
                      {note.excerpt || "还没有内容"}
                    </p>
                    <div className="note-item-meta">
                      <span>{note.deletedAt ? `删除于 ${listTime(note.deletedAt)}` : listTime(note.updatedAt)}</span>
                      {note.tags[0] && <span className="note-item-tag">#{note.tags[0]}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="list-footer">
        {view === "trash" ? (
          <>
            <span>{filtered.length} 篇已删除</span>
            {filtered.length > 0 && (
              <button
                className="footer-action"
                onClick={() => {
                  if (window.confirm("清空回收站？其中的笔记将被永久删除，无法恢复。")) {
                    void emptyTrash();
                  }
                }}
              >
                清空回收站
              </button>
            )}
          </>
        ) : (
          <>
            <span>{filtered.length} 篇</span>
            <span className="footer-dot" />
            <span>{wordTotal.toLocaleString("zh-CN")} 字</span>
            <span className="footer-spacer" />
            <span className="footer-local">
              <span className="local-dot" />
              本地
            </span>
          </>
        )}
      </footer>

      {menu && (
        <NoteContextMenu
          note={menu.note}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onExport={async () => {
            try {
              const payload = await api.getNote(menu.note.id);
              const path = await api.exportNote(payload.note, payload.content);
              if (path) addToast("已导出 Markdown 文件。", { tone: "success" });
            } catch (error) {
              addToast(error instanceof Error ? error.message : "导出失败。", { tone: "error" });
            }
          }}
        />
      )}
      {totalNotes.length === 0 && view === "all" && (
        <span className="sr-only">笔记库为空</span>
      )}
      <div
        className="pane-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整笔记列表宽度"
        aria-valuenow={Math.round(listWidth)}
        onPointerDown={beginResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
        onDoubleClick={() => setListWidth(318)}
        title="拖动调整列表宽度，双击恢复默认"
      />
    </section>
  );
});
