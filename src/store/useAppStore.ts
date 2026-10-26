import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import type {
  ConflictInfo,
  DraftInfo,
  DraftPayload,
  NoteMeta,
  NoteView,
  SaveState,
  Settings,
  SortMode,
  TagCount,
  ToastMessage,
  ToastAction,
} from "../types";
import { DEFAULT_SETTINGS } from "../types";
import { excerptOf } from "../lib/text";

interface DraftPrompt {
  savedAt: number;
  content: string;
}

interface AppState {
  ready: boolean;
  bootError: string | null;
  notes: NoteMeta[];
  recentIds: string[];
  tags: TagCount[];
  drafts: Record<string, DraftInfo>;
  dataDir: string;
  version: string;

  activeId: string | null;
  note: NoteMeta | null;
  title: string;
  content: string;
  dirty: boolean;
  saveState: SaveState;
  savedAt: number | null;
  revision: number;

  view: NoteView;
  tagFilter: string | null;
  sort: SortMode;
  settings: Settings;
  preview: boolean;
  focusMode: boolean;
  listWidth: number;

  paletteOpen: boolean;
  searchOpen: boolean;
  searchSeed: string;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  historyOpen: boolean;
  sidebarDrawerOpen: boolean;
  mobileBrowse: boolean;
  conflict: ConflictInfo | null;
  draftPrompt: DraftPrompt | null;
  focusTitleToken: number;

  toasts: ToastMessage[];

  initialize: () => Promise<void>;
  openNote: (id: string, force?: boolean) => Promise<void>;
  newNote: () => Promise<void>;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  saveActive: (manual?: boolean, force?: boolean) => Promise<boolean>;
  flushActive: () => Promise<boolean>;
  toggleFavorite: () => Promise<void>;
  trashActive: () => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  purgeNote: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  setView: (view: NoteView) => void;
  setTagFilter: (tag: string | null) => void;
  setSort: (sort: SortMode) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleSidebar: () => void;
  setPreview: (preview: boolean) => void;
  setFocusMode: (enabled: boolean) => void;
  setListWidth: (width: number) => void;
  setPaletteOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setSearchSeed: (seed: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setHistoryOpen: (open: boolean) => void;
  setSidebarDrawerOpen: (open: boolean) => void;
  setMobileBrowse: (browse: boolean) => void;
  setConflict: (conflict: ConflictInfo | null) => void;
  applyPayload: (payload: { note: NoteMeta; content: string }) => void;
  resolveConflict: (mode: "reload" | "keep") => Promise<void>;
  setDraftPrompt: (prompt: DraftPrompt | null) => void;
  restoreDraft: () => Promise<void>;
  discardDraft: () => Promise<void>;
  addToast: (message: string, options?: { tone?: ToastMessage["tone"]; action?: ToastAction; duration?: number }) => void;
  dismissToast: (id: number) => void;
  refreshFromDisk: () => Promise<void>;
  importNotes: () => Promise<void>;
  exportActive: () => Promise<void>;
  exportAll: () => Promise<void>;
  openDataDir: () => Promise<void>;
}

let activeSave: Promise<boolean> | null = null;
let settingsTimer: number | undefined;
let toastSeq = 0;
const RECENT_KEY = "inknote.recent";
const LIST_WIDTH_KEY = "inknote.listWidth";

function loadListWidth(): number {
  try {
    const value = Number(localStorage.getItem(LIST_WIDTH_KEY));
    return Number.isFinite(value) && value >= 248 ? Math.min(520, value) : 318;
  } catch {
    return 318;
  }
}

function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, 40)
      : [];
  } catch {
    return [];
  }
}

function persistRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Recent history is a convenience; storage failure is harmless.
  }
}

function mergeMeta(notes: NoteMeta[], meta: NoteMeta): NoteMeta[] {
  const index = notes.findIndex((note) => note.id === meta.id);
  if (index < 0) return [meta, ...notes];
  const next = [...notes];
  next[index] = meta;
  return next;
}

function computeTags(notes: NoteMeta[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (note.deletedAt) continue;
    for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function persistSettings(settings: Settings) {
  window.clearTimeout(settingsTimer);
  settingsTimer = window.setTimeout(() => {
    void api.updateSettings(settings).catch(() => {
      // Settings are non-critical; the in-memory value remains usable.
    });
  }, 280);
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  bootError: null,
  notes: [],
  recentIds: [],
  tags: [],
  drafts: {},
  dataDir: "",
  version: "",

  activeId: null,
  note: null,
  title: "",
  content: "",
  dirty: false,
  saveState: "saved",
  savedAt: null,
  revision: 0,

  view: "all",
  tagFilter: null,
  sort: "updated",
  settings: DEFAULT_SETTINGS,
  preview: false,
  focusMode: false,
  listWidth: loadListWidth(),

  paletteOpen: false,
  searchOpen: false,
  searchSeed: "",
  settingsOpen: false,
  shortcutsOpen: false,
  historyOpen: false,
  sidebarDrawerOpen: false,
  mobileBrowse: false,
  conflict: null,
  draftPrompt: null,
  focusTitleToken: 0,

  toasts: [],

  addToast: (message, options = {}) => {
    const id = ++toastSeq;
    const toast: ToastMessage = {
      id,
      message,
      tone: options.tone ?? "default",
      action: options.action,
      duration: options.duration ?? 4_200,
    };
    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }));
    if (toast.duration && toast.duration > 0) {
      window.setTimeout(() => get().dismissToast(id), toast.duration);
    }
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  initialize: async () => {
    try {
      const boot = await api.bootstrap();
      const settings = { ...DEFAULT_SETTINGS, ...boot.settings };
      const drafts = Object.fromEntries(boot.drafts.map((draft) => [draft.noteId, draft]));
      const liveNotes = boot.notes.filter((note) => !note.deletedAt);
      const liveIds = new Set(liveNotes.map((note) => note.id));
      const storedRecent = loadRecent().filter((id) => liveIds.has(id));
      const recentIds = storedRecent.length
        ? storedRecent
        : liveNotes.slice(0, 5).map((note) => note.id);
      if (!storedRecent.length && recentIds.length) persistRecent(recentIds);
      set({
        ready: true,
        notes: boot.notes,
        recentIds,
        tags: boot.tags,
        drafts,
        dataDir: boot.dataDir,
        version: boot.version,
        settings,
        sort: settings.sort,
      });
      const available = boot.notes.filter((note) => !note.deletedAt);
      const preferred =
        available.find((note) => note.id === settings.lastNoteId) ??
        available.find((note) => note.id === boot.settings.lastNoteId) ??
        available[0];
      if (preferred) {
        await get().openNote(preferred.id, true);
      }
      if (typeof window !== "undefined" && window.innerWidth < 760) {
        set({ mobileBrowse: true });
      }
    } catch (error) {
      set({
        ready: true,
        bootError: error instanceof Error ? error.message : "无法打开本地笔记库。",
      });
    }
  },

  openNote: async (id, force = false) => {
    const state = get();
    if (!force && state.activeId === id) {
      if (state.mobileBrowse) set({ mobileBrowse: false });
      return;
    }
    if (state.dirty || activeSave) {
      const saved = await get().flushActive();
      if (!saved) return;
    }
    try {
      const payload = await api.getNote(id);
      const recentIds = [id, ...get().recentIds.filter((value) => value !== id)].slice(0, 40);
      set({
        activeId: id,
        note: payload.note,
        title: payload.note.title,
        content: payload.content,
        dirty: false,
        saveState: "saved",
        savedAt: payload.note.updatedAt,
        revision: get().revision + 1,
        recentIds,
        conflict: null,
        draftPrompt: null,
        preview: false,
        mobileBrowse: false,
      });
      persistRecent(recentIds);
      const settings = { ...get().settings, lastNoteId: id };
      set({ settings });
      persistSettings(settings);
      try {
        const draft = await api.getDraft(id);
        if (
          get().activeId === id &&
          draft &&
          draft.savedAt > payload.note.fileMtime &&
          draft.content !== payload.content
        ) {
          set({ draftPrompt: { savedAt: draft.savedAt, content: draft.content } });
        }
      } catch {
        // Draft lookup is best-effort.
      }
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(".cm-content")?.focus();
      }, 40);
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "无法读取这篇笔记。", {
        tone: "error",
      });
    }
  },

  newNote: async () => {
    if (get().dirty || activeSave) {
      const saved = await get().flushActive();
      if (!saved) return;
    }
    try {
      const payload = await api.createNote("无标题笔记", "");
      set((state) => ({
        notes: [payload.note, ...state.notes],
        recentIds: [
          payload.note.id,
          ...state.recentIds.filter((value) => value !== payload.note.id),
        ].slice(0, 40),
        activeId: payload.note.id,
        note: payload.note,
        title: payload.note.title,
        content: payload.content,
        dirty: false,
        saveState: "saved",
        savedAt: payload.note.updatedAt,
        revision: state.revision + 1,
        view: "all",
        tagFilter: null,
        conflict: null,
        draftPrompt: null,
        preview: false,
        mobileBrowse: false,
        focusTitleToken: state.focusTitleToken + 1,
      }));
      persistRecent(get().recentIds);
      const settings = { ...get().settings, lastNoteId: payload.note.id };
      set({ settings, tags: computeTags(get().notes) });
      persistSettings(settings);
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "新建笔记失败。", {
        tone: "error",
      });
    }
  },

  setTitle: (title) => {
    set((state) => ({
      title,
      dirty: true,
      saveState: state.saveState === "conflict" ? "conflict" : "dirty",
      revision: state.revision + 1,
    }));
  },

  setContent: (content) => {
    set((state) => ({
      content,
      dirty: true,
      saveState: state.saveState === "conflict" ? "conflict" : "dirty",
      revision: state.revision + 1,
    }));
  },

  saveActive: async (manual = false, force = false) => {
    if (activeSave) return activeSave;
    const state = get();
    if (!state.activeId || !state.note) return true;
    if (state.note.deletedAt) return true;
    if (!state.dirty && !manual) return true;

    const id = state.activeId;
    const baseNote = state.note;
    const sentTitle = state.title;
    const sentContent = state.content;
    const sentRevision = state.revision;
    set({ saveState: "saving" });

    activeSave = (async () => {
      try {
        const result = await api.saveNote({
          id,
          title: sentTitle,
          content: sentContent,
          baseMtime: baseNote.fileMtime,
          manual,
          force,
        });
        const current = get();
        const stillSameNote = current.activeId === id;
        const changedSince = current.revision !== sentRevision;

        set((s) => ({
          notes: mergeMeta(s.notes, result.note),
          tags: computeTags(mergeMeta(s.notes, result.note)),
          note: stillSameNote ? result.note : s.note,
          title:
            stillSameNote && !changedSince && s.title === sentTitle
              ? result.note.title
              : s.title,
          dirty: stillSameNote ? changedSince : s.dirty,
          saveState: stillSameNote
            ? changedSince
              ? "dirty"
              : "saved"
            : s.saveState,
          savedAt: stillSameNote ? result.savedAt : s.savedAt,
          conflict: current.conflict?.noteId === id ? null : current.conflict,
          drafts: Object.fromEntries(
            Object.entries(s.drafts).filter(([noteId]) => noteId !== id),
          ),
        }));
        return true;
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null;
        if (apiError?.code === "external_conflict") {
          const diskMtime = Number(
            (apiError.detail as { diskMtime?: number } | undefined)?.diskMtime ?? Date.now(),
          );
          set({
            saveState: "conflict",
            conflict: {
              noteId: id,
              message: apiError.message,
              diskMtime,
            },
          });
          return false;
        }
        set({ saveState: "error" });
        get().addToast(error instanceof Error ? error.message : "保存失败，请检查磁盘。", {
          tone: "error",
        });
        return false;
      } finally {
        activeSave = null;
      }
    })();

    return activeSave;
  },

  flushActive: async () => {
    if (activeSave) {
      const ok = await activeSave;
      if (!ok) return false;
    }
    if (get().dirty) {
      const ok = await get().saveActive(false);
      if (!ok) return false;
    }
    return true;
  },

  toggleFavorite: async () => {
    const note = get().note;
    if (!note) return;
    try {
      const updated = await api.setFavorite(note.id, !note.favorite);
      set((state) => ({
        note: state.note?.id === updated.id ? updated : state.note,
        notes: mergeMeta(state.notes, updated),
      }));
      get().addToast(updated.favorite ? "已加入收藏。" : "已取消收藏。", { duration: 2200 });
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "操作失败。", { tone: "error" });
    }
  },

  trashActive: async () => {
    const state = get();
    if (!state.activeId || !state.note) return;
    if (state.dirty || activeSave) {
      const saved = await get().flushActive();
      if (!saved) return;
    }
    const id = state.activeId;
    const title = state.note.title;
    try {
      const updated = await api.trashNote(id);
      set((s) => ({
        notes: mergeMeta(s.notes, updated),
        tags: computeTags(mergeMeta(s.notes, updated)),
        recentIds: s.recentIds.filter((value) => value !== id),
        activeId: null,
        note: null,
        title: "",
        content: "",
        dirty: false,
        saveState: "saved",
        view: "all",
        conflict: null,
        draftPrompt: null,
      }));
      persistRecent(get().recentIds);
      get().addToast(`「${title}」已移入回收站。`, {
        action: {
          label: "撤销",
          run: async () => {
            await get().restoreNote(id);
          },
        },
        duration: 6_000,
      });
      const next = get().notes.find((note) => !note.deletedAt);
      if (next) await get().openNote(next.id, true);
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "无法删除这篇笔记。", {
        tone: "error",
      });
    }
  },

  restoreNote: async (id) => {
    try {
      const updated = await api.restoreNote(id);
      set((state) => ({
        notes: mergeMeta(state.notes, updated),
        tags: computeTags(mergeMeta(state.notes, updated)),
      }));
      get().addToast("已恢复到笔记列表。", { tone: "success", duration: 2500 });
      set({ view: "all", tagFilter: null });
      await get().openNote(id, true);
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "恢复失败。", { tone: "error" });
    }
  },

  purgeNote: async (id) => {
    const wasActive = get().activeId === id;
    try {
      await api.purgeNote(id);
      set((state) => ({
        notes: state.notes.filter((note) => note.id !== id),
        recentIds: state.recentIds.filter((value) => value !== id),
        activeId: wasActive ? null : state.activeId,
        note: wasActive ? null : state.note,
        title: wasActive ? "" : state.title,
        content: wasActive ? "" : state.content,
        dirty: false,
        saveState: "saved",
      }));
      persistRecent(get().recentIds);
      if (wasActive) {
        const next = get().notes.find((note) => !note.deletedAt);
        if (next) await get().openNote(next.id, true);
      }
      get().addToast("已永久删除。", { duration: 2500 });
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "删除失败。", { tone: "error" });
    }
  },

  emptyTrash: async () => {
    const activeWasDeleted = Boolean(get().note?.deletedAt);
    try {
      await api.emptyTrash();
      set((state) => {
        const liveIds = new Set(
          state.notes.filter((note) => !note.deletedAt).map((note) => note.id),
        );
        return {
          notes: state.notes.filter((note) => !note.deletedAt),
          recentIds: state.recentIds.filter((id) => liveIds.has(id)),
          activeId: activeWasDeleted ? null : state.activeId,
          note: activeWasDeleted ? null : state.note,
          title: activeWasDeleted ? "" : state.title,
          content: activeWasDeleted ? "" : state.content,
          dirty: false,
          saveState: "saved",
        };
      });
      persistRecent(get().recentIds);
      if (activeWasDeleted) {
        const next = get().notes.find((note) => !note.deletedAt);
        if (next) await get().openNote(next.id, true);
      }
      get().addToast("回收站已清空。", { duration: 2500 });
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "清空失败。", { tone: "error" });
    }
  },

  setView: (view) => set({ view, tagFilter: null, sidebarDrawerOpen: false }),

  setTagFilter: (tag) => set({ tagFilter: tag }),

  setSort: (sort) => {
    set({ sort });
    const settings = { ...get().settings, sort };
    set({ settings });
    persistSettings(settings);
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    persistSettings(settings);
  },

  toggleSidebar: () => {
    if (get().focusMode) {
      set({ focusMode: false });
      return;
    }
    if (window.innerWidth < 1020) {
      set((state) => ({ sidebarDrawerOpen: !state.sidebarDrawerOpen }));
      return;
    }
    const collapsed = !get().settings.sidebarCollapsed;
    get().updateSettings({ sidebarCollapsed: collapsed });
  },

  setPreview: (preview) => set({ preview }),
  setListWidth: (width) => {
    const clamped = Math.min(520, Math.max(248, width));
    set({ listWidth: clamped });
    try {
      localStorage.setItem(LIST_WIDTH_KEY, String(clamped));
    } catch {
      // A non-persisted width is still usable for this session.
    }
  },
  setFocusMode: (enabled) =>
    set({
      focusMode: enabled,
      sidebarDrawerOpen: false,
      paletteOpen: false,
      settingsOpen: false,
      shortcutsOpen: false,
      historyOpen: false,
      searchOpen: false,
    }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSearchSeed: (seed) => set({ searchSeed: seed }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setHistoryOpen: (open) => set({ historyOpen: open }),
  setSidebarDrawerOpen: (open) => set({ sidebarDrawerOpen: open }),
  setMobileBrowse: (browse) => set({ mobileBrowse: browse }),
  setConflict: (conflict) => set({ conflict }),

  applyPayload: (payload) => {
    set((state) => ({
      note: payload.note,
      title: payload.note.title,
      content: payload.content,
      dirty: false,
      saveState: "saved",
      savedAt: payload.note.updatedAt,
      revision: state.revision + 1,
      conflict: null,
      draftPrompt: null,
      notes: mergeMeta(state.notes, payload.note),
      tags: computeTags(mergeMeta(state.notes, payload.note)),
    }));
  },

  resolveConflict: async (mode) => {
    const conflict = get().conflict;
    if (!conflict) return;
    if (mode === "keep") {
      const ok = await get().saveActive(true, true);
      if (ok) {
        set({ conflict: null, saveState: "saved" });
        get().addToast("已用当前内容覆盖磁盘文件。", { tone: "success" });
      }
      return;
    }
    set({ conflict: null, dirty: false, saveState: "saved", draftPrompt: null });
    try {
      await api.discardDraft(conflict.noteId);
    } catch {
      // The stale draft will be replaced by the next autosave anyway.
    }
    await get().openNote(conflict.noteId, true);
    get().addToast("已重新载入磁盘上的版本。", { duration: 2500 });
  },

  setDraftPrompt: (prompt) => set({ draftPrompt: prompt }),

  restoreDraft: async () => {
    const draft = get().draftPrompt;
    if (!draft) return;
    set({
      content: draft.content,
      dirty: true,
      saveState: "dirty",
      revision: get().revision + 1,
      draftPrompt: null,
    });
    get().addToast("草稿已恢复，正在保存。", { duration: 2500 });
    window.setTimeout(() => void get().saveActive(false), 500);
  },

  discardDraft: async () => {
    const id = get().activeId;
    if (!id) return;
    try {
      await api.discardDraft(id);
    } catch {
      // Ignore: the draft will be cleaned up on the next successful save.
    }
    set({ draftPrompt: null });
    get().addToast("已丢弃草稿。", { duration: 2200 });
  },

  refreshFromDisk: async () => {
    try {
      const changed = await api.checkExternalChanges();
      if (!changed.length) return;
      const notes = await api.refreshNotes();
      set({ notes, tags: computeTags(notes) });
      const active = get().activeId;
      if (active && changed.includes(active)) {
        if (get().dirty) {
          const meta = notes.find((note) => note.id === active);
          set({
            conflict: {
              noteId: active,
              message: "磁盘上的文件被其他程序修改了，而这里还有未保存的内容。",
              diskMtime: meta?.fileMtime ?? Date.now(),
            },
            saveState: "conflict",
          });
        } else {
          await get().openNote(active, true);
          get().addToast("检测到外部修改，已重新载入。", { duration: 3200 });
        }
      }
    } catch {
      // Focus-time reconciliation is best-effort.
    }
  },

  importNotes: async () => {
    try {
      if (get().dirty || activeSave) {
        const saved = await get().flushActive();
        if (!saved) return;
      }
      const result = await api.importNotes();
      if (!result.imported) return;
      set((state) => ({
        notes: [...result.notes, ...state.notes].sort((a, b) => b.updatedAt - a.updatedAt),
        tags: computeTags([...result.notes, ...state.notes]),
        view: "all",
      }));
      get().addToast(`已导入 ${result.imported} 篇笔记。`, { tone: "success" });
      if (result.notes[0]) await get().openNote(result.notes[0].id, true);
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "导入失败。", { tone: "error" });
    }
  },

  exportActive: async () => {
    const { note, content, dirty } = get();
    if (!note) return;
    if (dirty) {
      const saved = await get().saveActive(false);
      if (!saved) return;
    }
    try {
      const path = await api.exportNote(note, content);
      if (path) get().addToast("已导出 Markdown 文件。", { tone: "success" });
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "导出失败。", { tone: "error" });
    }
  },

  exportAll: async () => {
    try {
      if (get().dirty || activeSave) {
        const saved = await get().flushActive();
        if (!saved) return;
      }
      const notes = get().notes.filter((note) => !note.deletedAt);
      const path = await api.exportAll(notes);
      if (path) get().addToast("已导出全部笔记。", { tone: "success" });
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "导出失败。", { tone: "error" });
    }
  },

  openDataDir: async () => {
    try {
      await api.openDataDir();
    } catch (error) {
      get().addToast(error instanceof Error ? error.message : "无法打开数据目录。", {
        tone: "error",
      });
    }
  },
}));

export function selectVisibleNotes(state: AppState): NoteMeta[] {
  let notes = state.notes;
  if (state.view === "trash") {
    notes = notes.filter((note) => note.deletedAt);
  } else {
    notes = notes.filter((note) => !note.deletedAt);
    if (state.view === "favorites") notes = notes.filter((note) => note.favorite);
  }
  if (state.tagFilter) {
    notes = notes.filter((note) => note.tags.includes(state.tagFilter as string));
  }
  if (state.view === "recent") {
    const order = new Map(state.recentIds.map((id, index) => [id, index]));
    const recent = notes
      .filter((note) => order.has(note.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    if (recent.length > 0) return recent;
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
  }
  return [...notes].sort((a, b) => {
    if (state.sort === "title") return a.title.localeCompare(b.title, "zh-CN");
    if (state.sort === "created") return b.createdAt - a.createdAt;
    if (state.view === "trash") return (b.deletedAt ?? 0) - (a.deletedAt ?? 0);
    return b.updatedAt - a.updatedAt;
  });
}

export function useVisibleNotes(): NoteMeta[] {
  return useAppStore(selectVisibleNotes);
}

export function draftPreview(draft: DraftPayload): string {
  return excerptOf(draft.content, 80);
}
