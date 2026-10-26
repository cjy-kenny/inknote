use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};
use crate::models::{NoteMeta, SearchHit, TagCount};
use crate::text::{count_words, excerpt_from, extract_tags, make_snippet};

const NOTE_COLUMNS: &str = "id, title, file_path, created_at, updated_at, file_mtime, favorite, deleted_at, word_count, excerpt";

pub fn open(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;",
    )?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            file_path TEXT UNIQUE NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            file_mtime INTEGER NOT NULL DEFAULT 0,
            favorite INTEGER NOT NULL DEFAULT 0,
            deleted_at INTEGER,
            word_count INTEGER NOT NULL DEFAULT 0,
            excerpt TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at);

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS note_tags (
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (note_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);",
    )?;

    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'",
        [],
        |row| row.get(0),
    )?;
    if exists == 0 {
        let created = conn.execute_batch(
            "CREATE VIRTUAL TABLE notes_fts USING fts5(
                note_id UNINDEXED,
                title,
                content,
                tokenize = 'trigram'
            );",
        );
        if created.is_err() {
            // Older SQLite builds may not ship the trigram tokenizer.
            conn.execute_batch(
                "CREATE VIRTUAL TABLE notes_fts USING fts5(
                    note_id UNINDEXED,
                    title,
                    content
                );",
            )?;
        }
    }
    Ok(())
}

fn map_note(row: &Row<'_>) -> rusqlite::Result<NoteMeta> {
    Ok(NoteMeta {
        id: row.get(0)?,
        title: row.get(1)?,
        file_path: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        file_mtime: row.get(5)?,
        favorite: row.get::<_, i64>(6)? != 0,
        deleted_at: row.get(7)?,
        word_count: row.get(8)?,
        excerpt: row.get(9)?,
        tags: Vec::new(),
    })
}

fn tags_map(conn: &Connection) -> AppResult<HashMap<String, Vec<String>>> {
    let mut stmt = conn.prepare(
        "SELECT nt.note_id, t.name
         FROM note_tags nt
         JOIN tags t ON t.id = nt.tag_id
         ORDER BY t.name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let (note_id, tag) = row?;
        map.entry(note_id).or_default().push(tag);
    }
    Ok(map)
}

pub fn list_notes(conn: &Connection) -> AppResult<Vec<NoteMeta>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {NOTE_COLUMNS} FROM notes ORDER BY updated_at DESC"
    ))?;
    let mut notes = stmt
        .query_map([], map_note)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let tags = tags_map(conn)?;
    for note in &mut notes {
        note.tags = tags.get(&note.id).cloned().unwrap_or_default();
    }
    Ok(notes)
}

pub fn get_note(conn: &Connection, id: &str) -> AppResult<Option<NoteMeta>> {
    let mut note = conn
        .query_row(
            &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1"),
            [id],
            map_note,
        )
        .optional()?;
    if let Some(note) = note.as_mut() {
        note.tags = note_tags(conn, id)?;
    }
    Ok(note)
}

fn note_tags(conn: &Connection, id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE nt.note_id = ?1 ORDER BY t.name",
    )?;
    let rows = stmt.query_map([id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn insert_note(conn: &Connection, note: &NoteMeta, content: &str) -> AppResult<()> {
    conn.execute(
        &format!(
            "INSERT INTO notes ({NOTE_COLUMNS})
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
        ),
        params![
            note.id,
            note.title,
            note.file_path,
            note.created_at,
            note.updated_at,
            note.file_mtime,
            note.favorite as i64,
            note.deleted_at,
            note.word_count,
            note.excerpt,
        ],
    )?;
    index_note(conn, &note.id, &note.title, content)?;
    set_tags(conn, &note.id, &note.tags)?;
    Ok(())
}

pub fn update_note(conn: &Connection, note: &NoteMeta, content: &str) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE notes SET
            title = ?2,
            file_path = ?3,
            created_at = ?4,
            updated_at = ?5,
            file_mtime = ?6,
            favorite = ?7,
            deleted_at = ?8,
            word_count = ?9,
            excerpt = ?10
         WHERE id = ?1",
        params![
            note.id,
            note.title,
            note.file_path,
            note.created_at,
            note.updated_at,
            note.file_mtime,
            note.favorite as i64,
            note.deleted_at,
            note.word_count,
            note.excerpt,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::not_found("这篇笔记已经不存在了。"));
    }
    index_note(conn, &note.id, &note.title, content)?;
    set_tags(conn, &note.id, &note.tags)?;
    Ok(())
}

pub fn update_file_pointer(conn: &Connection, id: &str, path: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE notes SET file_path = ?2 WHERE id = ?1",
        params![id, path],
    )?;
    Ok(())
}

pub fn reindex_external(
    conn: &Connection,
    id: &str,
    path: &str,
    content: &str,
    mtime: i64,
    updated_at: i64,
) -> AppResult<()> {
    let excerpt = excerpt_from(content);
    let words = count_words(content);
    let tags = extract_tags(content);
    let changed = conn.execute(
        "UPDATE notes SET file_path = ?2, file_mtime = ?3, updated_at = ?4,
            word_count = ?5, excerpt = ?6
         WHERE id = ?1",
        params![id, path, mtime, updated_at, words, excerpt],
    )?;
    if changed == 0 {
        return Ok(());
    }
    let title: String = conn.query_row("SELECT title FROM notes WHERE id = ?1", [id], |row| {
        row.get(0)
    })?;
    index_note(conn, id, &title, content)?;
    set_tags(conn, id, &tags)?;
    Ok(())
}

pub fn mark_deleted(conn: &Connection, id: &str, deleted_at: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE notes SET deleted_at = ?2 WHERE id = ?1",
        params![id, deleted_at],
    )?;
    Ok(())
}

pub fn set_deleted_path(
    conn: &Connection,
    id: &str,
    deleted_at: Option<i64>,
    path: &str,
    mtime: i64,
    updated_at: i64,
) -> AppResult<()> {
    conn.execute(
        "UPDATE notes SET deleted_at = ?2, file_path = ?3, file_mtime = ?4,
            updated_at = ?5 WHERE id = ?1",
        params![id, deleted_at, path, mtime, updated_at],
    )?;
    Ok(())
}

pub fn set_favorite(conn: &Connection, id: &str, favorite: bool) -> AppResult<Option<NoteMeta>> {
    conn.execute(
        "UPDATE notes SET favorite = ?2 WHERE id = ?1",
        params![id, favorite as i64],
    )?;
    get_note(conn, id)
}

pub fn delete_note(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [id])?;
    conn.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", [id])?;
    conn.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)",
        [],
    )?;
    Ok(())
}

fn index_note(conn: &Connection, id: &str, title: &str, content: &str) -> AppResult<()> {
    conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", [id])?;
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, content) VALUES (?1, ?2, ?3)",
        params![id, title, content],
    )?;
    Ok(())
}

pub fn set_tags(conn: &Connection, id: &str, tags: &[String]) -> AppResult<()> {
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [id])?;
    let mut seen = std::collections::HashSet::new();
    for raw in tags {
        let tag = raw
            .trim()
            .trim_start_matches('#')
            .trim()
            .chars()
            .take(40)
            .collect::<String>();
        if tag.is_empty() || !seen.insert(tag.clone()) {
            continue;
        }
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [&tag])?;
        let tag_id: i64 = conn.query_row("SELECT id FROM tags WHERE name = ?1", [&tag], |row| {
            row.get(0)
        })?;
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
            params![id, tag_id],
        )?;
    }
    conn.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)",
        [],
    )?;
    Ok(())
}

pub fn all_tags(conn: &Connection) -> AppResult<Vec<TagCount>> {
    let mut stmt = conn.prepare(
        "SELECT t.name, COUNT(nt.note_id)
         FROM tags t
         JOIN note_tags nt ON nt.tag_id = t.id
         JOIN notes n ON n.id = nt.note_id
         WHERE n.deleted_at IS NULL
         GROUP BY t.name
         ORDER BY COUNT(nt.note_id) DESC, t.name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TagCount {
            name: row.get(0)?,
            count: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn fts_query_for(query: &str) -> Option<String> {
    let terms: Vec<&str> = query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .collect();
    if terms.is_empty() {
        return None;
    }
    if terms.iter().all(|term| term.chars().count() >= 3) {
        let quoted = terms
            .iter()
            .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        return Some(quoted);
    }
    if terms.len() == 1 && query.chars().count() >= 3 {
        return Some(format!("\"{}\"", query.replace('"', "\"\"")));
    }
    None
}

pub fn search(conn: &Connection, query: &str, limit: usize) -> AppResult<Vec<SearchHit>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let query: String = query.chars().take(200).collect();
    let limit = limit.clamp(1, 200);

    let mut hits = if let Some(fts) = fts_query_for(&query) {
        fts_search(conn, &fts, limit).unwrap_or_default()
    } else {
        Vec::new()
    };

    if hits.is_empty() {
        hits = like_search(conn, &query, limit)?;
    }

    let mut out = Vec::with_capacity(hits.len());
    for (id, snippet) in hits {
        if let Some(note) = get_note(conn, &id)? {
            if note.deleted_at.is_some() {
                continue;
            }
            let snippet = if snippet.trim().is_empty() {
                note.excerpt.clone()
            } else {
                snippet
            };
            out.push(SearchHit { note, snippet });
        }
    }
    Ok(out)
}

fn fts_search(conn: &Connection, query: &str, limit: usize) -> AppResult<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT notes_fts.note_id,
                snippet(notes_fts, 2, '<mark>', '</mark>', '…', 12)
         FROM notes_fts
         JOIN notes n ON n.id = notes_fts.note_id
         WHERE notes_fts MATCH ?1 AND n.deleted_at IS NULL
         ORDER BY bm25(notes_fts)
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![query, limit as i64], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn like_search(conn: &Connection, query: &str, limit: usize) -> AppResult<Vec<(String, String)>> {
    let terms: Vec<String> = query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| format!("%{}%", term.replace('%', "\\%").replace('_', "\\_")))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let mut clauses = Vec::new();
    let mut values: Vec<String> = Vec::new();
    for term in &terms {
        clauses
            .push("(notes_fts.title LIKE ? ESCAPE '\\' OR notes_fts.content LIKE ? ESCAPE '\\')");
        values.push(term.clone());
        values.push(term.clone());
    }
    let sql = format!(
        "SELECT notes_fts.note_id, notes_fts.content
         FROM notes_fts
         JOIN notes n ON n.id = notes_fts.note_id
         WHERE n.deleted_at IS NULL AND {}
         ORDER BY n.updated_at DESC
         LIMIT {limit}",
        clauses.join(" AND ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(values.iter()), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, content) = row?;
        out.push((id, make_snippet(&content, query)));
    }
    Ok(out)
}

pub fn live_note_files(conn: &Connection) -> AppResult<Vec<(String, String, i64)>> {
    let mut stmt =
        conn.prepare("SELECT id, file_path, file_mtime FROM notes WHERE deleted_at IS NULL")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn deleted_before(conn: &Connection, cutoff: i64) -> AppResult<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
    )?;
    let rows = stmt.query_map([cutoff], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn all_deleted(conn: &Connection) -> AppResult<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT id, file_path FROM notes WHERE deleted_at IS NOT NULL")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
