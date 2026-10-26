import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { api } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { SearchHit } from "../types";
import { cleanSnippet, highlightMatches } from "../lib/text";
import { listTime } from "../lib/time";
import { modLabel } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Icon } from "./Icon";

export function SearchOverlay() {
  const open = useAppStore((state) => state.searchOpen);
  const seed = useAppStore((state) => state.searchSeed);
  const notes = useAppStore((state) => state.notes);
  const setOpen = useAppStore((state) => state.setSearchOpen);
  const openNote = useAppStore((state) => state.openNote);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef);

  useEffect(() => {
    if (!open) return;
    setQuery(seed);
    setActive(0);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [open, seed]);

  useEffect(() => {
    if (!open) return;
    const request = ++requestRef.current;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setElapsed(null);
      return;
    }
    setLoading(true);
    const started = performance.now();
    const timer = window.setTimeout(async () => {
      try {
        const hits = await api.search(trimmed, 80);
        if (requestRef.current !== request) return;
        setResults(hits);
        setElapsed(performance.now() - started);
      } catch {
        if (requestRef.current === request) setResults([]);
      } finally {
        if (requestRef.current === request) setLoading(false);
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const recent = useMemo(
    () =>
      notes
        .filter((note) => !note.deletedAt)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6),
    [notes],
  );

  useEffect(() => {
    if (!open) return;
    const showRecentNow = !query.trim();
    const items = showRecentNow ? recent : results;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => (items.length ? (index + 1) % items.length : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (items.length ? (index - 1 + items.length) % items.length : 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (showRecentNow) {
          const note = recent[active];
          if (note) {
            setOpen(false);
            void openNote(note.id);
          }
        } else {
          const hit = results[active];
          if (hit) {
            setOpen(false);
            void openNote(hit.note.id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [active, open, openNote, query, recent, results, setOpen]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const showRecent = !query.trim();

  return (
    <div className="overlay search-overlay" onMouseDown={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-input-row">
          <Icon name="search" size={19} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题与正文…"
            aria-label="搜索所有笔记"
            spellCheck={false}
          />
          {loading ? (
            <span className="search-spinner" aria-label="搜索中" />
          ) : (
            <kbd>Esc</kbd>
          )}
        </div>
        <div className="search-meta-row">
          <span>
            {showRecent
              ? "最近编辑"
              : loading
                ? "正在检索本地索引"
                : `${results.length} 条结果${elapsed != null ? ` · ${Math.max(1, Math.round(elapsed))} ms` : ""}`}
          </span>
          <span>全文索引 · 仅本机</span>
        </div>

        <div className="search-results" ref={listRef}>
          {showRecent &&
            recent.map((note, index) => (
              <button
                key={note.id}
                className="search-result"
                data-active={index === active}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => {
                  setOpen(false);
                  void openNote(note.id);
                }}
              >
                <span className="search-result-icon">
                  <Icon name="file" size={15} />
                </span>
                <span className="search-result-copy">
                  <span
                    className="search-result-title"
                    dangerouslySetInnerHTML={{ __html: highlightMatches(note.title, query) }}
                  />
                  <span className="search-result-snippet">{note.excerpt}</span>
                </span>
                <span className="search-result-time">{listTime(note.updatedAt)}</span>
              </button>
            ))}

          {!showRecent &&
            results.map((hit, index) => (
              <button
                key={hit.note.id}
                className="search-result"
                data-active={index === active}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => {
                  setOpen(false);
                  void openNote(hit.note.id);
                }}
              >
                <span className="search-result-icon">
                  <Icon name="file" size={15} />
                </span>
                <span className="search-result-copy">
                  <span
                    className="search-result-title"
                    dangerouslySetInnerHTML={{
                      __html: highlightMatches(hit.note.title, query),
                    }}
                  />
                  <span
                    className="search-result-snippet"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(cleanSnippet(hit.snippet), {
                        ALLOWED_TAGS: ["mark"],
                        ALLOWED_ATTR: [],
                      }),
                    }}
                  />
                </span>
                <span className="search-result-side">
                  <span className="search-result-time">{listTime(hit.note.updatedAt)}</span>
                  {hit.note.tags[0] && <span className="search-result-tag">#{hit.note.tags[0]}</span>}
                </span>
              </button>
            ))}

          {!showRecent && !loading && results.length === 0 && (
            <div className="search-empty">
              <Icon name="search" size={20} />
              <p>没有找到「{query.trim()}」</p>
              <span>试试更短的关键词，或换一个说法。中文支持两字以上的模糊匹配。</span>
            </div>
          )}
        </div>

        <div className="search-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            浏览
          </span>
          <span>
            <kbd>↵</kbd>
            打开笔记
          </span>
          <span className="search-footer-right">
            <kbd>{modLabel()}</kbd>
            <kbd>Shift</kbd>
            <kbd>F</kbd>
            全局搜索
          </span>
        </div>
      </div>
    </div>
  );
}
