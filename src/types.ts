export type ThemeMode = "system" | "light" | "dark";
export type AccentName = "slate" | "moss" | "amber";
export type EditorFont = "serif" | "sans" | "mono";
export type SortMode = "updated" | "created" | "title";
export type NoteView = "all" | "favorites" | "recent" | "trash";

export interface NoteMeta {
  id: string;
  title: string;
  filePath: string;
  createdAt: number;
  updatedAt: number;
  fileMtime: number;
  favorite: boolean;
  deletedAt: number | null;
  wordCount: number;
  excerpt: string;
  tags: string[];
}

export interface NotePayload {
  note: NoteMeta;
  content: string;
}

export interface TagCount {
  name: string;
  count: number;
}

export interface DraftInfo {
  noteId: string;
  savedAt: number;
  preview: string;
}

export interface DraftPayload {
  noteId: string;
  content: string;
  savedAt: number;
  baseMtime: number;
}

export interface SnapshotInfo {
  name: string;
  savedAt: number;
  size: number;
}

export interface SnapshotPayload {
  info: SnapshotInfo;
  content: string;
}

export interface Settings {
  theme: ThemeMode;
  accent: AccentName;
  editorFont: EditorFont;
  lineHeight: number;
  lastNoteId: string | null;
  sidebarCollapsed: boolean;
  sort: SortMode;
}

export interface Bootstrap {
  notes: NoteMeta[];
  settings: Settings;
  dataDir: string;
  drafts: DraftInfo[];
  tags: TagCount[];
  version: string;
}

export interface SaveResult {
  note: NoteMeta;
  savedAt: number;
  snapshotCreated: boolean;
}

export interface SearchHit {
  note: NoteMeta;
  snippet: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  notes: NoteMeta[];
}

export interface ConflictInfo {
  noteId: string;
  message: string;
  diskMtime: number;
}

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastMessage {
  id: number;
  message: string;
  tone: "default" | "error" | "success";
  action?: ToastAction;
  duration?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "slate",
  editorFont: "serif",
  lineHeight: 1.8,
  lastNoteId: null,
  sidebarCollapsed: false,
  sort: "updated",
};
