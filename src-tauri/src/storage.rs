use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Local, TimeZone};
use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{
    normalize_title, DraftFile, DraftInfo, DraftPayload, NoteMeta, Settings, SnapshotInfo,
    SnapshotPayload,
};
use crate::text::{
    count_words, excerpt_from, extract_tags, first_h1, id_from_filename, is_safe_id, note_filename,
    split_frontmatter, title_from_filename,
};

pub struct AppState {
    pub data_dir: PathBuf,
    pub db: Mutex<Connection>,
    pub settings: Mutex<Settings>,
}

impl AppState {
    pub fn new(app: &AppHandle) -> AppResult<Self> {
        let data_dir = std::env::var_os("INKNOTE_DATA_DIR")
            .map(PathBuf::from)
            .or_else(|| {
                app.path()
                    .document_dir()
                    .ok()
                    .map(|dir| dir.join("InkNote"))
            })
            .or_else(|| {
                app.path()
                    .home_dir()
                    .ok()
                    .map(|home| home.join("Documents").join("InkNote"))
            })
            .unwrap_or_else(|| PathBuf::from("InkNote"));
        Self::open(data_dir)
    }

    pub fn open(data_dir: PathBuf) -> AppResult<Self> {
        let data_dir = if data_dir.is_absolute() {
            data_dir
        } else {
            std::env::current_dir()?.join(data_dir)
        };
        let notes_dir = data_dir.join("notes");
        let index_dir = data_dir.join(".index");
        let history_dir = data_dir.join(".history");
        let drafts_dir = data_dir.join(".drafts");
        let trash_dir = data_dir.join(".trash");
        for dir in [
            &data_dir,
            &notes_dir,
            &index_dir,
            &history_dir,
            &drafts_dir,
            &trash_dir,
        ] {
            fs::create_dir_all(dir)?;
        }

        let db_path = index_dir.join("notes.db");
        let connection = match db::open(&db_path) {
            Ok(connection) => connection,
            Err(first_error) => {
                let backup = index_dir.join(format!("notes.db.broken-{}", now_ms()));
                let _ = fs::rename(&db_path, &backup);
                db::open(&db_path).map_err(|_| first_error)?
            }
        };

        let settings = load_settings(&data_dir.join("config.json"));
        let state = Self {
            data_dir,
            db: Mutex::new(connection),
            settings: Mutex::new(settings),
        };
        reconcile(&state)?;
        let _ = purge_expired(&state, 30);
        Ok(state)
    }

    pub fn notes_dir(&self) -> PathBuf {
        self.data_dir.join("notes")
    }

    pub fn history_dir(&self) -> PathBuf {
        self.data_dir.join(".history")
    }

    pub fn drafts_dir(&self) -> PathBuf {
        self.data_dir.join(".drafts")
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.data_dir.join(".trash")
    }

    pub fn settings(&self) -> AppResult<Settings> {
        Ok(self
            .settings
            .lock()
            .map_err(|_| AppError::internal("设置状态已损坏。"))?
            .clone())
    }

    pub fn set_settings(&self, settings: Settings) -> AppResult<Settings> {
        let settings = settings.sanitized();
        save_settings(&self.data_dir.join("config.json"), &settings)?;
        *self
            .settings
            .lock()
            .map_err(|_| AppError::internal("设置状态已损坏。"))? = settings.clone();
        Ok(settings)
    }

    pub fn config_path(&self) -> PathBuf {
        self.data_dir.join("config.json")
    }
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub fn mtime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub fn read_text(path: &Path) -> AppResult<String> {
    fs::read_to_string(path).map_err(|error| AppError::io(format!("{}: {error}", path.display())))
}

pub fn atomic_write(path: &Path, content: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("note");
    let temp = path.with_file_name(format!(".{file_name}.{}.tmp", Uuid::new_v4().simple()));
    {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp)?;
        file.write_all(content.as_bytes())?;
        let _ = file.sync_all();
    }
    match fs::rename(&temp, path) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Windows can refuse to replace a file held open by another process.
            // Remove the destination and retry so the save still succeeds.
            let _ = fs::remove_file(path);
            fs::rename(&temp, path).map_err(|error| {
                let _ = fs::remove_file(&temp);
                AppError::io(format!("{}: {error}", path.display()))
            })
        }
    }
}

pub fn read_settings(path: &Path) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Settings>(&raw).ok())
        .unwrap_or_default()
        .sanitized()
}

fn load_settings(path: &Path) -> Settings {
    read_settings(path)
}

pub fn save_settings(path: &Path, settings: &Settings) -> AppResult<()> {
    let json = serde_json::to_string_pretty(settings)?;
    atomic_write(path, &json)
}

pub fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

pub fn create_id() -> String {
    let raw = Uuid::new_v4().simple().to_string();
    raw[..8].to_string()
}

pub fn note_file_path(state: &AppState, created_at: i64, title: &str, id: &str) -> PathBuf {
    state.notes_dir().join(note_filename(created_at, title, id))
}

pub fn write_new_note(
    state: &AppState,
    created_at: i64,
    title: &str,
    id: &str,
    content: &str,
) -> AppResult<PathBuf> {
    fs::create_dir_all(state.notes_dir())?;
    let path = note_file_path(state, created_at, title, id);
    atomic_write(&path, content)?;
    Ok(path)
}

pub fn list_note_files(dir: &Path) -> AppResult<Vec<PathBuf>> {
    let mut files = Vec::new();
    if !dir.exists() {
        return Ok(files);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if matches!(extension.as_str(), "md" | "markdown" | "txt") {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

pub fn reconcile(state: &AppState) -> AppResult<()> {
    let existing = {
        let conn = state
            .db
            .lock()
            .map_err(|_| AppError::internal("索引状态已损坏。"))?;
        db::list_notes(&conn)?
    };
    let by_id: HashMap<String, NoteMeta> = existing
        .iter()
        .cloned()
        .map(|note| (note.id.clone(), note))
        .collect();
    let files = list_note_files(&state.notes_dir())?;
    let mut seen: HashSet<String> = HashSet::new();

    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::internal("索引状态已损坏。"))?;

    for path in files {
        let path_string = path.to_string_lossy().to_string();
        let mtime = mtime_ms(&path);
        match id_from_filename(&path) {
            Some(id) if by_id.contains_key(&id) => {
                let note = &by_id[&id];
                seen.insert(id.clone());
                if note.deleted_at.is_some() {
                    // A file in notes/ should never stay in the trash state.
                    db::set_deleted_path(
                        &conn,
                        &id,
                        None,
                        &path_string,
                        note.file_mtime,
                        note.updated_at,
                    )?;
                } else if note.file_mtime != mtime || note.file_path != path_string {
                    match read_text(&path) {
                        Ok(content) => {
                            let (_, body) = split_frontmatter(&content);
                            db::reindex_external(&conn, &id, &path_string, &body, mtime, mtime)?;
                        }
                        Err(_) => {
                            db::update_file_pointer(&conn, &id, &path_string)?;
                        }
                    }
                }
            }
            Some(id) => {
                if let Ok(content) = read_text(&path) {
                    let (frontmatter, body) = split_frontmatter(&content);
                    let title = frontmatter
                        .as_ref()
                        .and_then(|meta| meta.title.clone())
                        .or_else(|| first_h1(&body))
                        .unwrap_or_else(|| title_from_filename(&path));
                    let title = normalize_title(&title);
                    let created = fs::metadata(&path)
                        .and_then(|metadata| metadata.created())
                        .ok()
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .map(|duration| duration.as_millis() as i64)
                        .unwrap_or(mtime);
                    let mut tags = frontmatter.map(|meta| meta.tags).unwrap_or_default();
                    for tag in extract_tags(&body) {
                        if !tags.contains(&tag) {
                            tags.push(tag);
                        }
                    }
                    let note = NoteMeta {
                        id: id.clone(),
                        title: title.clone(),
                        file_path: path_string.clone(),
                        created_at: created,
                        updated_at: mtime,
                        file_mtime: mtime,
                        favorite: false,
                        deleted_at: None,
                        word_count: count_words(&body),
                        excerpt: excerpt_from(&body),
                        tags,
                    };
                    if db::insert_note(&conn, &note, &body).is_err() {
                        // A path collision can happen if the index is stale.
                        // Re-point the row rather than losing the file.
                        db::update_file_pointer(&conn, &id, &path_string)?;
                    }
                    seen.insert(id);
                }
            }
            None => {
                if let Ok(content) = read_text(&path) {
                    let (frontmatter, body) = split_frontmatter(&content);
                    let title = frontmatter
                        .as_ref()
                        .and_then(|meta| meta.title.clone())
                        .or_else(|| first_h1(&body))
                        .unwrap_or_else(|| title_from_filename(&path));
                    let title = normalize_title(&title);
                    let created = fs::metadata(&path)
                        .and_then(|metadata| metadata.created())
                        .ok()
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .map(|duration| duration.as_millis() as i64)
                        .unwrap_or(mtime);
                    let id = create_id();
                    let canonical = note_file_path(state, created, &title, &id);
                    let final_path = if fs::rename(&path, &canonical).is_ok() {
                        canonical
                    } else {
                        path.clone()
                    };
                    let final_string = final_path.to_string_lossy().to_string();
                    let mut tags = frontmatter.map(|meta| meta.tags).unwrap_or_default();
                    for tag in extract_tags(&body) {
                        if !tags.contains(&tag) {
                            tags.push(tag);
                        }
                    }
                    let note = NoteMeta {
                        id: id.clone(),
                        title,
                        file_path: final_string,
                        created_at: created,
                        updated_at: mtime,
                        file_mtime: mtime,
                        favorite: false,
                        deleted_at: None,
                        word_count: count_words(&body),
                        excerpt: excerpt_from(&body),
                        tags,
                    };
                    db::insert_note(&conn, &note, &body)?;
                    seen.insert(id);
                }
            }
        }
    }

    for note in existing.iter() {
        if note.deleted_at.is_none() && !seen.contains(&note.id) {
            db::mark_deleted(&conn, &note.id, now_ms())?;
        }
    }
    Ok(())
}

pub fn check_external_changes(state: &AppState) -> AppResult<Vec<String>> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::internal("索引状态已损坏。"))?;
    let live = db::live_note_files(&conn)?;
    let mut changed = Vec::new();
    for (id, path, known_mtime) in live {
        let path = PathBuf::from(&path);
        if !path.exists() {
            db::mark_deleted(&conn, &id, now_ms())?;
            changed.push(id);
            continue;
        }
        let disk_mtime = mtime_ms(&path);
        if disk_mtime != known_mtime {
            if let Ok(content) = read_text(&path) {
                let (_, body) = split_frontmatter(&content);
                db::reindex_external(
                    &conn,
                    &id,
                    &path.to_string_lossy(),
                    &body,
                    disk_mtime,
                    disk_mtime,
                )?;
                changed.push(id);
            }
        }
    }
    Ok(changed)
}

pub fn purge_expired(state: &AppState, days: i64) -> AppResult<()> {
    let cutoff = now_ms() - days * 24 * 60 * 60 * 1000;
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::internal("索引状态已损坏。"))?;
    let expired = db::deleted_before(&conn, cutoff)?;
    for (id, path) in expired {
        let _ = fs::remove_file(path);
        db::delete_note(&conn, &id)?;
    }
    Ok(())
}

pub fn purge_all_trash(state: &AppState) -> AppResult<()> {
    let conn = state
        .db
        .lock()
        .map_err(|_| AppError::internal("索引状态已损坏。"))?;
    let deleted = db::all_deleted(&conn)?;
    for (id, path) in deleted {
        let _ = fs::remove_file(path);
        db::delete_note(&conn, &id)?;
    }
    let _ = fs::remove_dir_all(state.trash_dir());
    let _ = fs::create_dir_all(state.trash_dir());
    Ok(())
}

pub fn snapshot_dir(state: &AppState, id: &str) -> AppResult<PathBuf> {
    if !is_safe_id(id) {
        return Err(AppError::invalid("笔记标识无效。"));
    }
    Ok(state.history_dir().join(id))
}

pub fn latest_snapshot_ms(state: &AppState, id: &str) -> i64 {
    let Ok(dir) = snapshot_dir(state, id) else {
        return 0;
    };
    fs::read_dir(dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.metadata().ok()?.modified().ok())
        .filter_map(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .max()
        .unwrap_or(0)
}

pub fn create_snapshot(state: &AppState, id: &str, content: &str, manual: bool) -> AppResult<bool> {
    let now = now_ms();
    let last = latest_snapshot_ms(state, id);
    if !manual && last > 0 && now - last < 5 * 60 * 1000 {
        return Ok(false);
    }
    let dir = snapshot_dir(state, id)?;
    fs::create_dir_all(&dir)?;
    let stamp = Local
        .timestamp_millis_opt(now)
        .single()
        .unwrap_or_else(Local::now)
        .format("%Y%m%dT%H%M%S")
        .to_string();
    let name = format!("{stamp}-{:03}.md", now.rem_euclid(1000));
    atomic_write(&dir.join(&name), content)?;
    prune_snapshots(&dir, 20)?;
    Ok(true)
}

fn prune_snapshots(dir: &Path, keep: usize) -> AppResult<()> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("md"))
        .collect();
    files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    while files.len() > keep {
        let oldest = files.remove(0);
        let _ = fs::remove_file(oldest);
    }
    Ok(())
}

pub fn list_snapshots(state: &AppState, id: &str) -> AppResult<Vec<SnapshotInfo>> {
    let dir = snapshot_dir(state, id)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut snapshots = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let metadata = entry.metadata()?;
        let saved_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0);
        snapshots.push(SnapshotInfo {
            name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            saved_at,
            size: metadata.len() as i64,
        });
    }
    snapshots.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(snapshots)
}

fn valid_snapshot_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 120
        && name.ends_with(".md")
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
}

pub fn read_snapshot(state: &AppState, id: &str, name: &str) -> AppResult<SnapshotPayload> {
    if !valid_snapshot_name(name) {
        return Err(AppError::invalid("历史版本名称无效。"));
    }
    let dir = snapshot_dir(state, id)?;
    let path = dir.join(name);
    let content = read_text(&path)?;
    let metadata = fs::metadata(&path)?;
    let saved_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    Ok(SnapshotPayload {
        info: SnapshotInfo {
            name: name.to_string(),
            saved_at,
            size: metadata.len() as i64,
        },
        content,
    })
}

pub fn draft_path(state: &AppState, id: &str) -> AppResult<PathBuf> {
    if !is_safe_id(id) {
        return Err(AppError::invalid("笔记标识无效。"));
    }
    Ok(state.drafts_dir().join(format!("{id}.draft")))
}

pub fn save_draft_file(
    state: &AppState,
    id: &str,
    content: &str,
    base_mtime: i64,
) -> AppResult<()> {
    let draft = DraftFile {
        content: content.to_string(),
        saved_at: now_ms(),
        base_mtime,
    };
    let json = serde_json::to_string(&draft)?;
    atomic_write(&draft_path(state, id)?, &json)
}

pub fn read_draft_file(state: &AppState, id: &str) -> AppResult<Option<DraftFile>> {
    let path = draft_path(state, id)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = read_text(&path)?;
    Ok(serde_json::from_str::<DraftFile>(&raw).ok())
}

pub fn discard_draft_file(state: &AppState, id: &str) -> AppResult<()> {
    let path = draft_path(state, id)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn list_draft_files(state: &AppState) -> AppResult<Vec<DraftInfo>> {
    let dir = state.drafts_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut drafts = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("draft") {
            continue;
        }
        let Some(id) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(raw) = read_text(&path) else {
            continue;
        };
        let Ok(draft) = serde_json::from_str::<DraftFile>(&raw) else {
            continue;
        };
        drafts.push(DraftInfo {
            note_id: id.to_string(),
            saved_at: draft.saved_at,
            preview: excerpt_from(&draft.content),
        });
    }
    drafts.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(drafts)
}

pub fn draft_payload(state: &AppState, id: &str) -> AppResult<Option<DraftPayload>> {
    Ok(read_draft_file(state, id)?.map(|draft| DraftPayload {
        note_id: id.to_string(),
        content: draft.content,
        saved_at: draft.saved_at,
        base_mtime: draft.base_mtime,
    }))
}

pub fn move_to_trash(state: &AppState, id: &str, source: &Path) -> AppResult<PathBuf> {
    fs::create_dir_all(state.trash_dir())?;
    let target = state.trash_dir().join(format!("{id}-{}.md", now_ms()));
    if fs::rename(source, &target).is_err() {
        let content = read_text(source)?;
        atomic_write(&target, &content)?;
        fs::remove_file(source)?;
    }
    Ok(target)
}

pub fn open_data_dir(state: &AppState) -> AppResult<()> {
    let path = state.data_dir.clone();
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&path);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&path);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&path);
        command
    };
    command
        .spawn()
        .map_err(|error| AppError::io(format!("无法打开数据目录：{error}")))?;
    Ok(())
}

pub struct ImportedFile {
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
}

pub fn parse_import_file(path: &Path) -> AppResult<ImportedFile> {
    let metadata = fs::metadata(path)
        .map_err(|_| AppError::not_found(format!("找不到文件：{}", path.display())))?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err(AppError::invalid("文件超过 10 MB，无法导入。"));
    }
    let content = read_text(path)?;
    let (frontmatter, body) = split_frontmatter(&content);
    let title = frontmatter
        .as_ref()
        .and_then(|meta| meta.title.clone())
        .or_else(|| first_h1(&body))
        .unwrap_or_else(|| title_from_filename(path));
    let mut tags = frontmatter.map(|meta| meta.tags).unwrap_or_default();
    for tag in extract_tags(&body) {
        if !tags.contains(&tag) {
            tags.push(tag);
        }
    }
    Ok(ImportedFile {
        title: normalize_title(&title),
        content: body,
        tags,
    })
}

pub fn frontmatter_for(note: &NoteMeta) -> String {
    let created = Local
        .timestamp_millis_opt(note.created_at)
        .single()
        .unwrap_or_else(Local::now)
        .to_rfc3339();
    let updated = Local
        .timestamp_millis_opt(note.updated_at)
        .single()
        .unwrap_or_else(Local::now)
        .to_rfc3339();
    let tags = if note.tags.is_empty() {
        "[]".to_string()
    } else {
        format!(
            "[{}]",
            note.tags
                .iter()
                .map(|tag| format!("\"{}\"", tag.replace('"', "\\\"")))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    format!(
        "---\ntitle: \"{}\"\nid: {}\ncreated: {}\nupdated: {}\ntags: {}\n---\n\n",
        note.title.replace('"', "\\\""),
        note.id,
        created,
        updated,
        tags
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_state() -> (AppState, PathBuf) {
        let dir = std::env::temp_dir().join(format!("inknote-test-{}", Uuid::new_v4()));
        let state = AppState::open(dir.clone()).expect("state should open");
        (state, dir)
    }

    #[test]
    fn atomic_write_replaces_existing_content() {
        let dir = std::env::temp_dir().join(format!("inknote-atomic-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("note.md");
        atomic_write(&path, "first").unwrap();
        atomic_write(&path, "second").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn snapshot_rotation_keeps_twenty() {
        let (state, dir) = temp_state();
        for index in 0..25 {
            let snapshot_dir = snapshot_dir(&state, "deadbeef").unwrap();
            fs::create_dir_all(&snapshot_dir).unwrap();
            atomic_write(
                &snapshot_dir.join(format!("20260101T0000{index:02}-000.md")),
                "x",
            )
            .unwrap();
        }
        let target = snapshot_dir(&state, "deadbeef").unwrap();
        prune_snapshots(&target, 20).unwrap();
        let count = fs::read_dir(&target).unwrap().count();
        assert_eq!(count, 20);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn drafts_round_trip() {
        let (state, dir) = temp_state();
        save_draft_file(&state, "deadbeef", "未保存的一段话", 42).unwrap();
        let draft = read_draft_file(&state, "deadbeef").unwrap().unwrap();
        assert_eq!(draft.content, "未保存的一段话");
        assert_eq!(draft.base_mtime, 42);
        discard_draft_file(&state, "deadbeef").unwrap();
        assert!(read_draft_file(&state, "deadbeef").unwrap().is_none());
        let _ = fs::remove_dir_all(dir);
    }
}
