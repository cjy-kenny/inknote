import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { SnapshotInfo } from "../types";
import { fullTime, relativeTime } from "../lib/time";
import { Icon } from "./Icon";
import { useFocusTrap } from "../hooks/useFocusTrap";

const MarkdownPreview = lazy(() =>
  import("./MarkdownPreview").then((module) => ({ default: module.MarkdownPreview })),
);

export function HistoryDialog() {
  const open = useAppStore((state) => state.historyOpen);
  const setOpen = useAppStore((state) => state.setHistoryOpen);
  const note = useAppStore((state) => state.note);
  const activeId = useAppStore((state) => state.activeId);
  const dirty = useAppStore((state) => state.dirty);
  const applyPayload = useAppStore((state) => state.applyPayload);
  const addToast = useAppStore((state) => state.addToast);

  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef);

  useEffect(() => {
    if (!open || !activeId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setSnapshots([]);
      setSelected(null);
      setPreview("");
      try {
        if (dirty) {
          const ok = await useAppStore.getState().saveActive(false);
          if (!ok) {
            if (!cancelled) setError("请先处理保存冲突，再查看历史版本。");
            return;
          }
        }
        const list = await api.listSnapshots(activeId);
        if (cancelled) return;
        setSnapshots(list);
        if (list[0]) {
          setSelected(list[0].name);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "无法读取版本历史。");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeId, dirty, open]);

  useEffect(() => {
    if (!open || !activeId || !selected) return;
    let cancelled = false;
    setPreviewLoading(true);
    void api
      .readSnapshot(activeId, selected)
      .then((payload) => {
        if (!cancelled) setPreview(payload.content);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "无法读取这个版本。");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, open, selected]);

  if (!open) return null;

  const restore = async () => {
    if (!activeId || !selected) return;
    if (!window.confirm("恢复到这一版？当前内容会先保留为一个新的历史版本。")) return;
    try {
      const payload = await api.restoreSnapshot(activeId, selected);
      applyPayload(payload);
      setOpen(false);
      addToast("已恢复到这个历史版本。", { tone: "success" });
    } catch (err) {
      addToast(err instanceof Error ? err.message : "恢复失败。", { tone: "error" });
    }
  };

  const current = snapshots.find((snapshot) => snapshot.name === selected);

  return (
    <div className="overlay modal-overlay" onMouseDown={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="modal history-modal"
        role="dialog"
        aria-modal="true"
        aria-label="版本历史"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-eyebrow">History</p>
            <h2>版本历史</h2>
            <p className="modal-subtitle">{note?.title || "无标题笔记"}</p>
          </div>
          <button className="icon-button" onClick={() => setOpen(false)} aria-label="关闭版本历史">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="history-body">
          <aside className="history-list">
            {loading && (
              <div className="history-loading">
                <span className="search-spinner" />
                正在读取…
              </div>
            )}
            {!loading && error && <div className="history-empty">{error}</div>}
            {!loading && !error && snapshots.length === 0 && (
              <div className="history-empty">
                <Icon name="history" size={20} />
                <p>还没有历史版本</p>
                <span>每次手动保存，或每隔 5 分钟的自动保存，都会留下一份快照。</span>
              </div>
            )}
            {snapshots.map((snapshot) => (
              <button
                key={snapshot.name}
                className="history-item"
                data-active={snapshot.name === selected}
                onClick={() => setSelected(snapshot.name)}
              >
                <span className="history-item-time">{relativeTime(snapshot.savedAt)}</span>
                <span className="history-item-sub">
                  {fullTime(snapshot.savedAt)} · {Math.max(1, Math.round(snapshot.size / 1024))} KB
                </span>
              </button>
            ))}
          </aside>

          <section className="history-preview">
            {previewLoading ? (
              <div className="history-loading">
                <span className="search-spinner" />
                正在载入版本…
              </div>
            ) : preview ? (
              <Suspense
                fallback={
                  <div className="history-loading">
                    <span className="search-spinner" />
                    正在排版…
                  </div>
                }
              >
                <MarkdownPreview content={preview} />
              </Suspense>
            ) : (
              <div className="history-placeholder">
                <Icon name="file" size={22} />
                <p>选择一个版本查看内容</p>
              </div>
            )}
          </section>
        </div>

        <footer className="modal-footer">
          <span className="modal-footnote">
            {current
              ? `这一版保存于 ${fullTime(current.savedAt)}`
              : "每篇笔记最多保留 20 个历史版本"}
          </span>
          <div className="modal-footer-actions">
            <button className="button subtle" onClick={() => setOpen(false)}>
              取消
            </button>
            <button
              className="button solid"
              disabled={!selected || previewLoading}
              onClick={() => void restore()}
            >
              <Icon name="restore" size={15} />
              恢复此版本
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
