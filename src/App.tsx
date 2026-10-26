import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import { useAppStore } from "./store/useAppStore";
import { api, isDesktop } from "./lib/api";
import { useApplyAppearance, useResolvedTheme } from "./hooks/useTheme";
import { useShortcuts } from "./hooks/useShortcuts";
import { Sidebar } from "./components/Sidebar";
import { NoteList } from "./components/NoteList";
import { EditorPane } from "./components/EditorPane";
import { Toasts } from "./components/Toasts";
import { Logo } from "./components/Icon";

const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((module) => ({
    default: module.CommandPalette,
  })),
);
const SearchOverlay = lazy(() =>
  import("./components/SearchOverlay").then((module) => ({
    default: module.SearchOverlay,
  })),
);
const SettingsDialog = lazy(() =>
  import("./components/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);
const ShortcutsDialog = lazy(() =>
  import("./components/ShortcutsDialog").then((module) => ({
    default: module.ShortcutsDialog,
  })),
);
const HistoryDialog = lazy(() =>
  import("./components/HistoryDialog").then((module) => ({
    default: module.HistoryDialog,
  })),
);

export default function App() {
  const ready = useAppStore((state) => state.ready);
  const bootError = useAppStore((state) => state.bootError);
  const initialize = useAppStore((state) => state.initialize);
  const settings = useAppStore((state) => state.settings);
  const activeId = useAppStore((state) => state.activeId);
  const dirty = useAppStore((state) => state.dirty);
  const content = useAppStore((state) => state.content);
  const title = useAppStore((state) => state.title);
  const saveState = useAppStore((state) => state.saveState);
  const mobileBrowse = useAppStore((state) => state.mobileBrowse);
  const focusMode = useAppStore((state) => state.focusMode);
  const listWidth = useAppStore((state) => state.listWidth);
  const paletteOpen = useAppStore((state) => state.paletteOpen);
  const searchOpen = useAppStore((state) => state.searchOpen);
  const settingsOpen = useAppStore((state) => state.settingsOpen);
  const shortcutsOpen = useAppStore((state) => state.shortcutsOpen);
  const historyOpen = useAppStore((state) => state.historyOpen);

  const resolved = useResolvedTheme(settings.theme);
  useApplyAppearance(settings, resolved);

  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void initialize();
  }, [initialize]);

  const openFind = useCallback(() => {
    const state = useAppStore.getState();
    if (!state.activeId) {
      state.setSearchOpen(true);
      return;
    }
    if (state.preview) state.setPreview(false);
    window.setTimeout(() => window.dispatchEvent(new Event("inknote:find")), 30);
  }, []);

  const focusTitle = useCallback(() => {
    const state = useAppStore.getState();
    if (!state.activeId) return;
    if (state.preview) state.setPreview(false);
    window.setTimeout(() => window.dispatchEvent(new Event("inknote:focus-title")), 30);
  }, []);

  useShortcuts({ openFind, focusTitle });

  useEffect(() => {
    if (!ready || !activeId || !dirty) return;
    if (saveState === "saving" || saveState === "conflict") return;
    const timer = window.setTimeout(() => {
      void useAppStore.getState().saveActive(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeId, content, dirty, ready, saveState, title]);

  useEffect(() => {
    if (!ready) return;
    const draftTimer = window.setInterval(() => {
      const state = useAppStore.getState();
      if (!state.dirty || !state.activeId || !state.note) return;
      void api
        .saveDraft(state.activeId, state.content, state.note.fileMtime)
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(draftTimer);
  }, [ready]);

  useEffect(() => {
    const flush = () => {
      const state = useAppStore.getState();
      if (state.ready && state.dirty) void state.saveActive(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onFocus = () => {
      window.setTimeout(() => {
        void useAppStore.getState().refreshFromDisk();
      }, 250);
    };
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!ready || !isDesktop()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    let closing = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const current = getCurrentWindow();
        unlisten = await current.onCloseRequested(async (event) => {
          if (closing) return;
          event.preventDefault();
          closing = true;
          const ok = await useAppStore.getState().flushActive();
          if (ok) {
            await current.destroy();
          } else {
            closing = false;
          }
        });
        if (disposed) unlisten();
      } catch {
        // The close hook is a safety net; autosave still covers normal use.
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="boot-screen">
        <Logo size={48} />
        <p>InkNote</p>
        <span className="boot-line" />
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="boot-screen boot-error">
        <Logo size={46} />
        <h1>无法打开笔记库</h1>
        <p>{bootError}</p>
        <button
          className="button solid"
          onClick={() => {
            useAppStore.setState({ bootError: null, ready: false });
            void useAppStore.getState().initialize();
          }}
        >
          重试
        </button>
        <span className="boot-hint">默认数据目录：~/Documents/InkNote</span>
      </div>
    );
  }

  return (
    <div
      className="app"
      data-collapsed={settings.sidebarCollapsed}
      data-mobile-browse={mobileBrowse}
      data-has-note={Boolean(activeId)}
      data-focus-mode={focusMode}
      style={{ "--list-width": `clamp(248px, ${listWidth}px, 38vw)` } as CSSProperties}
    >
      <Sidebar />
      <NoteList />
      <EditorPane isDark={resolved === "dark"} />
      <Suspense fallback={null}>
        {paletteOpen && <CommandPalette />}
        {searchOpen && <SearchOverlay />}
        {settingsOpen && <SettingsDialog />}
        {shortcutsOpen && <ShortcutsDialog />}
        {historyOpen && <HistoryDialog />}
      </Suspense>
      <Toasts />
    </div>
  );
}
