import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "../store/useAppStore";
import { fuzzyScore, highlightMatches } from "../lib/text";
import { modLabel } from "../hooks/useTheme";
import { Icon, type IconName } from "./Icon";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { NoteMeta } from "../types";

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  detail?: string;
  hint?: string;
  icon: IconName;
  score: number;
  renderLabel?: ReactNode;
  run: () => void | Promise<unknown>;
}

export function CommandPalette() {
  const open = useAppStore((state) => state.paletteOpen);
  const setOpen = useAppStore((state) => state.setPaletteOpen);
  const notes = useAppStore((state) => state.notes);
  const recentIds = useAppStore((state) => state.recentIds);
  const activeId = useAppStore((state) => state.activeId);
  const theme = useAppStore((state) => state.settings.theme);
  const focusMode = useAppStore((state) => state.focusMode);
  const newNote = useAppStore((state) => state.newNote);
  const openNote = useAppStore((state) => state.openNote);
  const saveActive = useAppStore((state) => state.saveActive);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setSearchOpen = useAppStore((state) => state.setSearchOpen);
  const setSearchSeed = useAppStore((state) => state.setSearchSeed);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setShortcutsOpen = useAppStore((state) => state.setShortcutsOpen);
  const setHistoryOpen = useAppStore((state) => state.setHistoryOpen);
  const setPreview = useAppStore((state) => state.setPreview);
  const setFocusMode = useAppStore((state) => state.setFocusMode);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const importNotes = useAppStore((state) => state.importNotes);
  const exportActive = useAppStore((state) => state.exportActive);
  const exportAll = useAppStore((state) => state.exportAll);
  const openDataDir = useAppStore((state) => state.openDataDir);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const commands: PaletteItem[] = [
      {
        id: "new",
        group: "操作",
        label: "新建笔记",
        icon: "plus",
        hint: `${modLabel()} N`,
        score: 0,
        run: () => newNote(),
      },
      {
        id: "save",
        group: "操作",
        label: "保存当前笔记",
        icon: "check",
        hint: `${modLabel()} S`,
        score: 0,
        run: () => saveActive(true),
      },
      {
        id: "search",
        group: "操作",
        label: "在全部笔记中搜索",
        detail: "全文搜索标题与正文",
        icon: "search",
        hint: `${modLabel()} Shift F`,
        score: 0,
        run: () => {
          setSearchSeed(q);
          setSearchOpen(true);
        },
      },
      {
        id: "sidebar",
        group: "操作",
        label: "折叠 / 展开侧边栏",
        icon: "panel-left",
        hint: `${modLabel()} \\`,
        score: 0,
        run: () => toggleSidebar(),
      },
      {
        id: "preview",
        group: "操作",
        label: "切换 Markdown 预览",
        icon: "eye",
        hint: `${modLabel()} Shift V`,
        score: 0,
        run: () => setPreview(!useAppStore.getState().preview),
      },
      {
        id: "focus-mode",
        group: "视图",
        label: focusMode ? "退出专注模式" : "进入专注模式",
        detail: "隐藏侧边栏和列表，只留下当前笔记",
        icon: focusMode ? "minimize" : "maximize",
        hint: `${modLabel()} Shift Enter`,
        score: 0,
        run: () => setFocusMode(!useAppStore.getState().focusMode),
      },
      {
        id: "history",
        group: "操作",
        label: "查看版本历史",
        icon: "history",
        hint: `${modLabel()} Shift H`,
        score: 0,
        run: () => setHistoryOpen(true),
      },
      {
        id: "import",
        group: "文件",
        label: "导入 Markdown / 文本",
        icon: "upload",
        score: 0,
        run: () => importNotes(),
      },
      {
        id: "export",
        group: "文件",
        label: "导出当前笔记",
        icon: "download",
        score: 0,
        run: () => exportActive(),
      },
      {
        id: "export-all",
        group: "文件",
        label: "导出全部笔记",
        icon: "archive",
        score: 0,
        run: () => exportAll(),
      },
      {
        id: "data-dir",
        group: "文件",
        label: "打开本地数据目录",
        icon: "folder",
        score: 0,
        run: () => openDataDir(),
      },
      {
        id: "settings",
        group: "应用",
        label: "设置",
        icon: "settings",
        hint: `${modLabel()} ,`,
        score: 0,
        run: () => setSettingsOpen(true),
      },
      {
        id: "shortcuts",
        group: "应用",
        label: "快捷键一览",
        icon: "keyboard",
        score: 0,
        run: () => setShortcutsOpen(true),
      },
      {
        id: "theme-system",
        group: "外观",
        label: "外观：跟随系统",
        icon: "monitor",
        score: 0,
        run: () => updateSettings({ theme: "system" }),
      },
      {
        id: "theme-light",
        group: "外观",
        label: "外观：亮色",
        icon: "sun",
        score: 0,
        run: () => updateSettings({ theme: "light" }),
      },
      {
        id: "theme-dark",
        group: "外观",
        label: "外观：暗色",
        icon: "moon",
        score: 0,
        run: () => updateSettings({ theme: "dark" }),
      },
    ];

    const liveNotes = notes.filter((note) => !note.deletedAt);
    const noteById = new Map(liveNotes.map((note) => [note.id, note]));
    const ordered = recentIds
      .map((id) => noteById.get(id))
      .filter((note): note is NoteMeta => Boolean(note));
    const recentSource = ordered.length
      ? ordered
      : liveNotes.slice().sort((a, b) => b.updatedAt - a.updatedAt);
    const recent: PaletteItem[] = recentSource
      .slice(0, q ? 6 : 5)
      .map<PaletteItem>((note) => ({
        id: `note-${note.id}`,
        group: q ? "笔记" : "最近打开",
        label: note.title || "无标题笔记",
        detail: note.excerpt,
        icon: "file",
        score: 0,
        renderLabel: (
          <span
            className="palette-note-title"
            dangerouslySetInnerHTML={{ __html: highlightMatches(note.title || "无标题笔记", q) }}
          />
        ),
        run: () => openNote(note.id),
      }));

    if (!q) return [...recent, ...commands];

    const scoredNotes = recent
      .map((item) => {
        const source = notes.find((note) => `note-${note.id}` === item.id) as NoteMeta | undefined;
        const score = fuzzyScore(
          `${item.label}\n${source?.excerpt ?? ""}\n${source?.tags.join(" ") ?? ""}`,
          q,
        );
        return score == null ? null : { ...item, score };
      })
      .filter((item): item is PaletteItem => Boolean(item))
      .sort((a, b) => b.score - a.score);

    const scoredCommands = commands
      .map((item) => {
        const score = fuzzyScore(`${item.label} ${item.detail ?? ""}`, q);
        return score == null ? null : { ...item, score };
      })
      .filter((item): item is PaletteItem => Boolean(item))
      .sort((a, b) => b.score - a.score);

    const all = [...scoredNotes, ...scoredCommands];
    if (q) {
      all.push({
        id: "deep-search",
        group: "全文搜索",
        label: `在所有内容中搜索「${q}」`,
        detail: "搜索正文，并显示命中片段",
        icon: "search",
        score: -1,
        run: () => {
          setSearchSeed(q);
          setSearchOpen(true);
        },
      });
    }
    return all.slice(0, 18);
  }, [
    exportActive,
    exportAll,
    focusMode,
    importNotes,
    newNote,
    notes,
    openDataDir,
    openNote,
    query,
    recentIds,
    saveActive,
    setFocusMode,
    setHistoryOpen,
    setPreview,
    setSearchOpen,
    setSearchSeed,
    setSettingsOpen,
    setShortcutsOpen,
    toggleSidebar,
    updateSettings,
  ]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
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
        const item = items[Math.min(active, items.length - 1)];
        if (item) {
          setOpen(false);
          window.setTimeout(() => void item.run(), 10);
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [active, items, open, setOpen]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup = "";
  let flatIndex = -1;

  return (
    <div className="overlay palette-overlay" onMouseDown={() => setOpen(false)}>
      <div
        ref={dialogRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索笔记，或输入一个命令…"
            aria-label="搜索笔记或命令"
            spellCheck={false}
          />
          <kbd className="palette-esc">Esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {items.length === 0 && (
            <div className="palette-empty">
              <Icon name="search" size={20} />
              <p>没有找到对应的笔记或命令</p>
              <span>试试更短的关键词，或直接搜索全文。</span>
            </div>
          )}
          {items.map((item) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            flatIndex += 1;
            const itemIndex = flatIndex;
            return (
              <div key={item.id}>
                {showGroup && <div className="palette-group">{item.group}</div>}
                <button
                  className="palette-item"
                  data-active={itemIndex === active}
                  data-index={itemIndex}
                  onMouseMove={() => setActive(itemIndex)}
                  onClick={() => {
                    setOpen(false);
                    window.setTimeout(() => void item.run(), 10);
                  }}
                >
                  <span className="palette-icon">
                    <Icon name={item.icon} size={16} />
                  </span>
                  <span className="palette-copy">
                    {item.renderLabel ?? <span className="palette-label">{item.label}</span>}
                    {item.detail && <span className="palette-detail">{item.detail}</span>}
                  </span>
                  {item.id === `note-${activeId}` && <span className="palette-current">当前</span>}
                  {item.id.startsWith("theme-") && item.label.endsWith(
                    theme === "system" ? "跟随系统" : theme === "light" ? "亮色" : "暗色",
                  ) && <Icon name="check" size={14} className="palette-check" />}
                  {item.hint && <kbd className="palette-hint">{item.hint}</kbd>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            选择
          </span>
          <span>
            <kbd>↵</kbd>
            打开
          </span>
          <span>
            <kbd>{modLabel()}</kbd>
            <kbd>P</kbd>
            关闭
          </span>
          <span className="palette-footer-hint">正文搜索：{modLabel()} Shift F</span>
        </div>
      </div>
    </div>
  );
}
