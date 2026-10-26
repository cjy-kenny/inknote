use serde::Serialize;
use serde_json::json;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<serde_json::Value>,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", message)
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid_input", message)
    }

    pub fn io(error: impl std::fmt::Display) -> Self {
        Self::new("io_error", format!("文件操作失败：{error}"))
    }

    pub fn conflict(message: impl Into<String>, disk_mtime: i64) -> Self {
        Self {
            code: "external_conflict".into(),
            message: message.into(),
            detail: Some(json!({ "diskMtime": disk_mtime })),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal", message)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::io(value)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::new("index_error", format!("本地索引出错：{value}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::new("serialization_error", format!("数据格式出错：{value}"))
    }
}
