use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub file_mtime: i64,
    pub favorite: bool,
    pub deleted_at: Option<i64>,
    pub word_count: i64,
    pub excerpt: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePayload {
    pub note: NoteMeta,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftInfo {
    pub note_id: String,
    pub saved_at: i64,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftFile {
    pub content: String,
    pub saved_at: i64,
    pub base_mtime: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPayload {
    pub note_id: String,
    pub content: String,
    pub saved_at: i64,
    pub base_mtime: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub name: String,
    pub saved_at: i64,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotPayload {
    pub info: SnapshotInfo,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub accent: String,
    pub editor_font: String,
    pub line_height: f64,
    pub last_note_id: Option<String>,
    pub sidebar_collapsed: bool,
    pub sort: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            accent: "slate".into(),
            editor_font: "serif".into(),
            line_height: 1.8,
            last_note_id: None,
            sidebar_collapsed: false,
            sort: "updated".into(),
        }
    }
}

impl Settings {
    pub fn sanitized(mut self) -> Self {
        if !matches!(self.theme.as_str(), "system" | "light" | "dark") {
            self.theme = "system".into();
        }
        if !matches!(self.accent.as_str(), "slate" | "moss" | "amber") {
            self.accent = "slate".into();
        }
        if !matches!(self.editor_font.as_str(), "serif" | "sans" | "mono") {
            self.editor_font = "serif".into();
        }
        if !matches!(self.sort.as_str(), "updated" | "created" | "title") {
            self.sort = "updated".into();
        }
        if !self.line_height.is_finite() {
            self.line_height = 1.8;
        }
        self.line_height = self.line_height.clamp(1.4, 2.4);
        self
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub notes: Vec<NoteMeta>,
    pub settings: Settings,
    pub data_dir: String,
    pub drafts: Vec<DraftInfo>,
    pub tags: Vec<TagCount>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub note: NoteMeta,
    pub saved_at: i64,
    pub snapshot_created: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub note: NoteMeta,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
    pub notes: Vec<NoteMeta>,
}

#[derive(Debug, Clone)]
pub struct ImportedNote {
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
}

pub fn normalize_title(input: &str) -> String {
    let title = input.trim().replace('\r', " ").replace('\n', " ");
    let title = title.trim();
    if title.is_empty() {
        "无标题笔记".to_string()
    } else {
        title.chars().take(200).collect()
    }
}
