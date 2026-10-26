import { invoke } from "@tauri-apps/api/core";
import { strToU8, zipSync } from "fflate";
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
} from "../types";
import { ApiError, mockInvoke } from "./mock";

export { ApiError };

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const isServerMode = (): boolean =>
  typeof window !== "undefined" &&
  (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
  window.location.port === "47821";

function normalizeError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  let value = error;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new ApiError("backend_error", String(value));
    }
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.code === "string") {
      throw new ApiError(
        record.code,
        typeof record.message === "string" ? record.message : "操作没有完成。",
        record.detail ?? record,
      );
    }
    if (typeof record.message === "string") {
      throw new ApiError("backend_error", record.message, record);
    }
  }
  throw new ApiError("backend_error", "操作没有完成，请稍后再试。");
}

async function serverInvoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    const response = await fetch("/api/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      result?: T;
      error?: { code?: string; message?: string; detail?: unknown };
    };
    if (!response.ok || !payload.ok) {
      throw new ApiError(
        payload.error?.code ?? "backend_error",
        payload.error?.message ?? "本地服务没有完成这次操作。",
        payload.error?.detail,
      );
    }
    return payload.result as T;
  } catch (error) {
    normalizeError(error);
  }
}

async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isServerMode()) return serverInvoke<T>(command, args);
  if (!isDesktop()) return mockInvoke<T>(command, args);
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    normalizeError(error);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function frontmatter(note: NoteMeta): string {
  const lines = [
    "---",
    `title: "${note.title.replace(/"/g, '\\"')}"`,
    `id: ${note.id}`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    note.tags.length ? `tags: [${note.tags.map((tag) => `"${tag}"`).join(", ")}]` : "tags: []",
    "---",
    "",
  ];
  return lines.join("\n");
}

function safeFilename(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "无标题笔记"
  );
}

function pickBrowserFiles(): Promise<Array<{ name: string; content: string }>> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/markdown,text/plain";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    let settled = false;
    const finish = async () => {
      if (settled) return;
      settled = true;
      const files = Array.from(input.files ?? []);
      const payload = await Promise.all(
        files.map(async (file) => ({ name: file.name, content: await file.text() })),
      );
      input.remove();
      resolve(payload);
    };
    input.addEventListener("change", finish, { once: true });
    input.addEventListener("cancel", () => {
      settled = true;
      input.remove();
      resolve([]);
    });
    input.click();
  });
}

export const api = {
  bootstrap: () => call<Bootstrap>("bootstrap"),

  createNote: (title = "", content = "") =>
    call<NotePayload>("create_note", { title, content }),

  getNote: (id: string) => call<NotePayload>("get_note", { id }),

  saveNote: (input: {
    id: string;
    title: string;
    content: string;
    baseMtime: number;
    manual: boolean;
    force?: boolean;
  }) =>
    call<SaveResult>("save_note", {
      id: input.id,
      title: input.title,
      content: input.content,
      baseMtime: input.baseMtime,
      manual: input.manual,
      force: input.force ?? false,
    }),

  setFavorite: (id: string, favorite: boolean) =>
    call<NoteMeta>("set_favorite", { id, favorite }),

  trashNote: (id: string) => call<NoteMeta>("trash_note", { id }),

  restoreNote: (id: string) => call<NoteMeta>("restore_note", { id }),

  purgeNote: (id: string) => call<null>("purge_note", { id }),

  emptyTrash: () => call<null>("empty_trash"),

  search: (query: string, limit = 80) =>
    call<SearchHit[]>("search_notes", { query, limit }),

  saveDraft: (noteId: string, content: string, baseMtime: number) =>
    call<null>("save_draft", { noteId, content, baseMtime }),

  getDraft: (noteId: string) => call<DraftPayload | null>("get_draft", { noteId }),

  discardDraft: (noteId: string) => call<null>("discard_draft", { noteId }),

  listDrafts: () => call<DraftInfo[]>("list_drafts"),

  listSnapshots: (noteId: string) => call<SnapshotInfo[]>("list_snapshots", { noteId }),

  readSnapshot: (noteId: string, name: string) =>
    call<SnapshotPayload>("read_snapshot", { noteId, name }),

  restoreSnapshot: (noteId: string, name: string) =>
    call<NotePayload>("restore_snapshot", { noteId, name }),

  checkExternalChanges: () => call<string[]>("check_external_changes"),

  refreshNotes: () => call<NoteMeta[]>("refresh_notes"),

  updateSettings: (settings: Settings) => call<Settings>("update_settings", { settings }),

  openDataDir: () => call<null>("open_data_dir"),

  async openExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) throw new ApiError("blocked_url", "只允许打开网页链接。");
    if (!isDesktop()) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  },

  async importNotes(): Promise<ImportResult> {
    if (!isDesktop()) {
      const files = await pickBrowserFiles();
      if (!files.length) return { imported: 0, skipped: 0, notes: [] };
      return call<ImportResult>("import_texts", { files });
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: true,
      title: "导入 Markdown 或文本",
      filters: [{ name: "Markdown / 文本", extensions: ["md", "markdown", "txt"] }],
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (!paths.length) return { imported: 0, skipped: 0, notes: [] };
    return call<ImportResult>("import_paths", { paths });
  },

  async exportNote(note: NoteMeta, content: string): Promise<string | null> {
    const filename = `${safeFilename(note.title)}.md`;
    if (!isDesktop()) {
      downloadBlob(new Blob([content], { type: "text/markdown;charset=utf-8" }), filename);
      return filename;
    }
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      title: "导出 Markdown",
      defaultPath: filename,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return null;
    await call<null>("export_note_to", { id: note.id, path });
    return path;
  },

  async exportAll(notes: NoteMeta[]): Promise<string | null> {
    if (!isDesktop()) {
      const files: Record<string, Uint8Array> = {};
      for (const note of notes) {
        const payload = await api.getNote(note.id);
        files[`${safeFilename(note.title)}-${note.id}.md`] = strToU8(
          frontmatter(note) + payload.content,
        );
      }
      if (!Object.keys(files).length) return null;
      const zipped = zipSync(files, { level: 6 });
      downloadBlob(new Blob([zipped], { type: "application/zip" }), "InkNote-导出.zip");
      return "InkNote-导出.zip";
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const dir = await open({ directory: true, title: "选择导出文件夹" });
    if (!dir) return null;
    return call<string>("export_all_to", { dir });
  },

  async previewExport(note: NoteMeta, content: string): Promise<string> {
    return frontmatter(note) + content + "\n";
  },
};
