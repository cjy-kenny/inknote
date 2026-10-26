use std::fs;
use std::path::PathBuf;
use std::sync::MutexGuard;

use rusqlite::Connection;
use tauri::State;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{
    normalize_title, Bootstrap, DraftInfo, DraftPayload, ImportResult, NoteMeta, NotePayload,
    SaveResult, SearchHit, Settings, SnapshotInfo, SnapshotPayload,
};
use crate::storage::{self, AppState};
use crate::text::{
    count_words, excerpt_from, extract_tags, first_h1, is_safe_id, split_frontmatter,
};

fn lock_db(state: &AppState) -> AppResult<MutexGuard<'_, Connection>> {
    state
        .db
        .lock()
        .map_err(|_| AppError::internal("索引状态已损坏。"))
}

fn get_required_note(conn: &Connection, id: &str) -> AppResult<NoteMeta> {
    db::get_note(conn, id)?.ok_or_else(|| AppError::not_found("这篇笔记已经不存在了。"))
}

fn read_note_content(note: &NoteMeta) -> AppResult<String> {
    let path = PathBuf::from(&note.file_path);
    if !path.exists() {
        if note.deleted_at.is_some() {
            return Ok(String::new());
        }
        return Err(AppError::not_found(
            "笔记文件不见了，可能在应用外被移动或删除。",
        ));
    }
    let raw = storage::read_text(&path)?;
    let (_, body) = split_frontmatter(&raw);
    Ok(body)
}

fn create_note_record(
    state: &AppState,
    title: &str,
    content: &str,
    tags: Vec<String>,
) -> AppResult<NoteMeta> {
    let title = normalize_title(title);
    let id = storage::create_id();
    let now = storage::now_ms();
    let word_count = count_words(content);
    let excerpt = excerpt_from(content);
    let path = storage::write_new_note(state, now, &title, &id, content)?;
    let note = NoteMeta {
        id: id.clone(),
        title,
        file_path: path.to_string_lossy().to_string(),
        created_at: now,
        updated_at: now,
        file_mtime: storage::mtime_ms(&path),
        favorite: false,
        deleted_at: None,
        word_count,
        excerpt,
        tags,
    };
    {
        let conn = lock_db(state)?;
        if let Err(error) = db::insert_note(&conn, &note, content) {
            let _ = fs::remove_file(&path);
            return Err(error);
        }
    }
    Ok(note)
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> AppResult<Bootstrap> {
    let (notes, tags) = {
        let conn = lock_db(&state)?;
        (db::list_notes(&conn)?, db::all_tags(&conn)?)
    };
    Ok(Bootstrap {
        notes,
        settings: state.settings()?,
        data_dir: state.data_dir.to_string_lossy().to_string(),
        drafts: storage::list_draft_files(&state)?,
        tags,
        version: storage::current_version(),
    })
}

#[tauri::command]
pub fn create_note(
    state: State<'_, AppState>,
    title: String,
    content: String,
) -> AppResult<NotePayload> {
    if content.len() > 12 * 1024 * 1024 {
        return Err(AppError::invalid("单篇笔记超过 12 MB，无法保存。"));
    }
    let title = if title.trim().is_empty() {
        first_h1(&content).unwrap_or_else(|| "无标题笔记".to_string())
    } else {
        title
    };
    let tags = extract_tags(&content);
    let note = create_note_record(&state, &title, &content, tags)?;
    Ok(NotePayload { note, content })
}

#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: String) -> AppResult<NotePayload> {
    if !is_safe_id(&id) {
        return Err(AppError::invalid("笔记标识无效。"));
    }
    let note = {
        let conn = lock_db(&state)?;
        get_required_note(&conn, &id)?
    };
    let content = read_note_content(&note)?;
    Ok(NotePayload { note, content })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn save_note(
    state: State<'_, AppState>,
    id: String,
    title: String,
    content: String,
    base_mtime: i64,
    manual: bool,
    force: bool,
) -> AppResult<SaveResult> {
    if !is_safe_id(&id) {
        return Err(AppError::invalid("笔记标识无效。"));
    }
    if content.len() > 12 * 1024 * 1024 {
        return Err(AppError::invalid("单篇笔记超过 12 MB，无法保存。"));
    }

    let mut note = {
        let conn = lock_db(&state)?;
        get_required_note(&conn, &id)?
    };
    if note.deleted_at.is_some() {
        return Err(AppError::invalid("回收站中的笔记不能编辑，请先恢复。"));
    }

    let old_path = PathBuf::from(&note.file_path);
    let disk_mtime = storage::mtime_ms(&old_path);
    if !force && base_mtime > 0 {
        if !old_path.exists() {
            return Err(AppError::conflict(
                "磁盘上的笔记文件不见了，可能被其他程序移动。",
                0,
            ));
        }
        if (disk_mtime - base_mtime).abs() > 2 {
            return Err(AppError::conflict(
                "文件在磁盘上被其他程序修改过，请选择保留哪一份。",
                disk_mtime,
            ));
        }
    }

    let title = normalize_title(&title);
    let new_path = storage::note_file_path(&state, note.created_at, &title, &id);
    storage::atomic_write(&new_path, &content)?;
    if new_path != old_path && old_path.exists() {
        let _ = fs::remove_file(&old_path);
    }

    let now = storage::now_ms();
    let tags = extract_tags(&content);
    note.title = title;
    note.file_path = new_path.to_string_lossy().to_string();
    note.updated_at = now;
    note.file_mtime = storage::mtime_ms(&new_path);
    note.word_count = count_words(&content);
    note.excerpt = excerpt_from(&content);
    note.tags = tags;

    {
        let conn = lock_db(&state)?;
        db::update_note(&conn, &note, &content)?;
    }

    let snapshot_created = storage::create_snapshot(&state, &id, &content, manual).unwrap_or(false);
    let _ = storage::discard_draft_file(&state, &id);

    Ok(SaveResult {
        note,
        saved_at: now,
        snapshot_created,
    })
}

#[tauri::command]
pub fn set_favorite(state: State<'_, AppState>, id: String, favorite: bool) -> AppResult<NoteMeta> {
    let conn = lock_db(&state)?;
    db::set_favorite(&conn, &id, favorite)?
        .ok_or_else(|| AppError::not_found("这篇笔记已经不存在了。"))
}

#[tauri::command]
pub fn trash_note(state: State<'_, AppState>, id: String) -> AppResult<NoteMeta> {
    let note = {
        let conn = lock_db(&state)?;
        get_required_note(&conn, &id)?
    };
    if note.deleted_at.is_some() {
        return Ok(note);
    }
    let old_path = PathBuf::from(&note.file_path);
    let content = if old_path.exists() {
        storage::read_text(&old_path).unwrap_or_default()
    } else {
        String::new()
    };
    let _ = storage::create_snapshot(&state, &id, &content, true);
    let trash_path = if old_path.exists() {
        storage::move_to_trash(&state, &id, &old_path)?
    } else {
        let fallback = state
            .trash_dir()
            .join(format!("{id}-{}.md", storage::now_ms()));
        storage::atomic_write(&fallback, &content)?;
        fallback
    };
    let mtime = storage::mtime_ms(&trash_path);
    let now = storage::now_ms();
    {
        let conn = lock_db(&state)?;
        db::set_deleted_path(
            &conn,
            &id,
            Some(now),
            &trash_path.to_string_lossy(),
            mtime,
            now,
        )?;
        let _ = storage::discard_draft_file(&state, &id);
        get_required_note(&conn, &id)
    }
}

#[tauri::command]
pub fn restore_note(state: State<'_, AppState>, id: String) -> AppResult<NoteMeta> {
    let note = {
        let conn = lock_db(&state)?;
        get_required_note(&conn, &id)?
    };
    if note.deleted_at.is_none() {
        return Ok(note);
    }
    let trash_path = PathBuf::from(&note.file_path);
    if !trash_path.exists() {
        return Err(AppError::not_found("回收站中的文件已经不存在了。"));
    }
    let new_path = storage::note_file_path(&state, note.created_at, &note.title, &id);
    fs::rename(&trash_path, &new_path)
        .map_err(|error| AppError::io(format!("无法把笔记移回 notes 目录：{error}")))?;
    let raw = storage::read_text(&new_path)?;
    let (_, content) = split_frontmatter(&raw);
    let mtime = storage::mtime_ms(&new_path);
    let now = storage::now_ms();
    let mut restored = note;
    restored.file_path = new_path.to_string_lossy().to_string();
    restored.deleted_at = None;
    restored.updated_at = now;
    restored.file_mtime = mtime;
    restored.word_count = count_words(&content);
    restored.excerpt = excerpt_from(&content);
    restored.tags = extract_tags(&content);
    {
        let conn = lock_db(&state)?;
        db::update_note(&conn, &restored, &content)?;
    }
    Ok(restored)
}

#[tauri::command]
pub fn purge_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let note = {
        let conn = lock_db(&state)?;
        get_required_note(&conn, &id)?
    };
    if note.deleted_at.is_none() {
        return Err(AppError::invalid("请先把笔记移到回收站，再永久删除。"));
    }
    let path = PathBuf::from(&note.file_path);
    let _ = fs::remove_file(path);
    {
        let conn = lock_db(&state)?;
        db::delete_note(&conn, &id)?;
    }
    if is_safe_id(&id) {
        let _ = fs::remove_dir_all(state.history_dir().join(&id));
    }
    Ok(())
}

#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> AppResult<()> {
    storage::purge_all_trash(&state)
}

#[tauri::command]
pub fn search_notes(
    state: State<'_, AppState>,
    query: String,
    limit: usize,
) -> AppResult<Vec<SearchHit>> {
    let conn = lock_db(&state)?;
    db::search(&conn, &query, limit)
}

#[tauri::command]
pub fn save_draft(
    state: State<'_, AppState>,
    note_id: String,
    content: String,
    base_mtime: i64,
) -> AppResult<()> {
    let exists = {
        let conn = lock_db(&state)?;
        db::get_note(&conn, &note_id)?.is_some()
    };
    if !exists {
        return Err(AppError::not_found("这篇笔记已经不存在了。"));
    }
    storage::save_draft_file(&state, &note_id, &content, base_mtime)
}

#[tauri::command]
pub fn get_draft(state: State<'_, AppState>, note_id: String) -> AppResult<Option<DraftPayload>> {
    storage::draft_payload(&state, &note_id)
}

#[tauri::command]
pub fn discard_draft(state: State<'_, AppState>, note_id: String) -> AppResult<()> {
    storage::discard_draft_file(&state, &note_id)
}

#[tauri::command]
pub fn list_drafts(state: State<'_, AppState>) -> AppResult<Vec<DraftInfo>> {
    storage::list_draft_files(&state)
}

#[tauri::command]
pub fn list_snapshots(state: State<'_, AppState>, note_id: String) -> AppResult<Vec<SnapshotInfo>> {
    storage::list_snapshots(&state, &note_id)
}

#[tauri::command]
pub fn read_snapshot(
    state: State<'_, AppState>,
    note_id: String,
    name: String,
) -> AppResult<SnapshotPayload> {
    storage::read_snapshot(&state, &note_id, &name)
}

#[tauri::command]
pub fn restore_snapshot(
    state: State<'_, AppState>,
    note_id: String,
    name: String,
) -> AppResult<NotePayload> {
    let mut note = {
        let conn = lock_db(&state)?;
        get_required_note(&conn, &note_id)?
    };
    if note.deleted_at.is_some() {
        return Err(AppError::invalid("回收站中的笔记不能恢复历史版本。"));
    }
    let snapshot = storage::read_snapshot(&state, &note_id, &name)?;
    let current = read_note_content(&note).unwrap_or_default();
    let _ = storage::create_snapshot(&state, &note_id, &current, true);
    let path = PathBuf::from(&note.file_path);
    storage::atomic_write(&path, &snapshot.content)?;
    note.updated_at = storage::now_ms();
    note.file_mtime = storage::mtime_ms(&path);
    note.word_count = count_words(&snapshot.content);
    note.excerpt = excerpt_from(&snapshot.content);
    note.tags = extract_tags(&snapshot.content);
    {
        let conn = lock_db(&state)?;
        db::update_note(&conn, &note, &snapshot.content)?;
    }
    let _ = storage::discard_draft_file(&state, &note_id);
    Ok(NotePayload {
        note,
        content: snapshot.content,
    })
}

#[tauri::command]
pub fn check_external_changes(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    storage::check_external_changes(&state)
}

#[tauri::command]
pub fn refresh_notes(state: State<'_, AppState>) -> AppResult<Vec<NoteMeta>> {
    let conn = lock_db(&state)?;
    db::list_notes(&conn)
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, settings: Settings) -> AppResult<Settings> {
    state.set_settings(settings)
}

#[tauri::command]
pub fn import_paths(state: State<'_, AppState>, paths: Vec<String>) -> AppResult<ImportResult> {
    let mut imported_notes = Vec::new();
    let mut skipped = 0usize;
    for raw_path in paths {
        let path = PathBuf::from(&raw_path);
        match storage::parse_import_file(&path) {
            Ok(imported) => {
                match create_note_record(&state, &imported.title, &imported.content, imported.tags)
                {
                    Ok(note) => imported_notes.push(note),
                    Err(_) => skipped += 1,
                }
            }
            Err(_) => skipped += 1,
        }
    }
    Ok(ImportResult {
        imported: imported_notes.len(),
        skipped,
        notes: imported_notes,
    })
}

#[tauri::command]
pub fn export_note_to(state: State<'_, AppState>, id: String, path: String) -> AppResult<()> {
    let note = {
        let conn = lock_db(&state)?;
        get_required_note(&conn, &id)?
    };
    let disk_content = read_note_content(&note)?;
    let (_, content) = split_frontmatter(&disk_content);
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let output = format!("{}{}", storage::frontmatter_for(&note), content);
    storage::atomic_write(&target, &output)?;
    Ok(())
}

fn safe_export_name(title: &str, id: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|ch| {
            if matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                ' '
            } else {
                ch
            }
        })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = if cleaned.chars().count() > 70 {
        cleaned.chars().take(70).collect::<String>()
    } else {
        cleaned
    };
    if trimmed.is_empty() {
        format!("{id}.md")
    } else {
        format!("{trimmed}-{id}.md")
    }
}

#[tauri::command]
pub fn export_all_to(state: State<'_, AppState>, dir: String) -> AppResult<String> {
    let notes = {
        let conn = lock_db(&state)?;
        db::list_notes(&conn)?
    };
    let base = PathBuf::from(dir);
    if base.is_file() {
        return Err(AppError::invalid("导出目标不是一个文件夹。"));
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let target_dir = base.join(format!("InkNote-Export-{stamp}"));
    fs::create_dir_all(&target_dir)?;
    for note in notes.iter().filter(|note| note.deleted_at.is_none()) {
        let path = PathBuf::from(&note.file_path);
        let content = storage::read_text(&path).unwrap_or_default();
        let (_, body) = split_frontmatter(&content);
        let output = format!("{}{}", storage::frontmatter_for(note), body);
        let file = target_dir.join(safe_export_name(&note.title, &note.id));
        storage::atomic_write(&file, &output)?;
    }
    Ok(target_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_data_dir(state: State<'_, AppState>) -> AppResult<()> {
    storage::open_data_dir(&state)
}
