import { useEffect } from "react";
import { useAppStore, selectVisibleNotes } from "../store/useAppStore";

interface Handlers {
  openFind: () => void;
  focusTitle: () => void;
}

export function useShortcuts({ openFind, focusTitle }: Handlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const state = useAppStore.getState();
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        if (state.paletteOpen) {
          state.setPaletteOpen(false);
          event.preventDefault();
          return;
        }
        if (state.searchOpen) {
          state.setSearchOpen(false);
          event.preventDefault();
          return;
        }
        if (state.settingsOpen) {
          state.setSettingsOpen(false);
          event.preventDefault();
          return;
        }
        if (state.shortcutsOpen) {
          state.setShortcutsOpen(false);
          event.preventDefault();
          return;
        }
        if (state.historyOpen) {
          state.setHistoryOpen(false);
          event.preventDefault();
          return;
        }
        if (state.sidebarDrawerOpen) {
          state.setSidebarDrawerOpen(false);
          event.preventDefault();
          return;
        }
      }

      if (!mod) {
        if (event.key === "?" && !typing) {
          state.setShortcutsOpen(true);
          event.preventDefault();
        }
        return;
      }

      if (event.altKey) return;

      if (state.settingsOpen || state.shortcutsOpen || state.historyOpen) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "n":
          event.preventDefault();
          void state.newNote();
          break;
        case "s":
          event.preventDefault();
          void state.saveActive(true);
          break;
        case "f":
          event.preventDefault();
          if (event.shiftKey) state.setSearchOpen(true);
          else openFind();
          break;
        case "p":
          event.preventDefault();
          state.setPaletteOpen(!state.paletteOpen);
          break;
        case "\\":
          event.preventDefault();
          state.toggleSidebar();
          break;
        case ",":
          event.preventDefault();
          state.setSettingsOpen(true);
          break;
        case "tab": {
          if (state.paletteOpen || state.searchOpen) return;
          event.preventDefault();
          const notes = selectVisibleNotes(state).filter((note) => !note.deletedAt);
          if (notes.length < 2) return;
          const index = notes.findIndex((note) => note.id === state.activeId);
          const next = notes[(index + 1) % notes.length];
          void state.openNote(next.id);
          break;
        }
        case "h":
          if (event.shiftKey) {
            event.preventDefault();
            state.setHistoryOpen(true);
          }
          break;
        case "v":
          if (event.shiftKey) {
            event.preventDefault();
            state.setPreview(!state.preview);
          }
          break;
        case "enter":
          if (event.shiftKey) {
            event.preventDefault();
            state.setFocusMode(!state.focusMode);
          }
          break;
        case "e":
          if (event.shiftKey) {
            event.preventDefault();
            focusTitle();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [focusTitle, openFind]);
}
