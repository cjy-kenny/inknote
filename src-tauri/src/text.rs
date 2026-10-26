use std::collections::HashSet;

use chrono::{Local, TimeZone};

#[derive(Debug, Default, Clone)]
pub struct Frontmatter {
    pub title: Option<String>,
    pub tags: Vec<String>,
}

pub fn slugify(title: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;
    for ch in title.chars() {
        let readable_punctuation = matches!(
            ch,
            '·' | '《'
                | '》'
                | '「'
                | '」'
                | '（'
                | '）'
                | '—'
                | '、'
                | '，'
                | '。'
                | '！'
                | '？'
                | '\''
                | '’'
                | '“'
                | '”'
        );
        if ch.is_alphanumeric() || readable_punctuation {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            out.push(ch);
            pending_dash = false;
        } else if !out.is_empty() {
            pending_dash = true;
        }
        if out.chars().count() >= 60 {
            break;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "note".to_string()
    } else {
        trimmed
    }
}

pub fn note_filename(created_ms: i64, title: &str, id: &str) -> String {
    let date = Local
        .timestamp_millis_opt(created_ms)
        .single()
        .unwrap_or_else(Local::now)
        .format("%Y-%m-%d")
        .to_string();
    format!("{date}-{}-{id}.md", slugify(title))
}

pub fn id_from_filename(path: &std::path::Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    let (_, last) = stem.rsplit_once('-')?;
    if last.len() == 8 && last.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(last.to_lowercase())
    } else {
        None
    }
}

pub fn title_from_filename(path: &std::path::Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("无标题笔记");
    let mut rest = stem;
    let bytes = rest.as_bytes();
    if bytes.len() > 11
        && bytes.get(4) == Some(&b'-')
        && bytes.get(7) == Some(&b'-')
        && bytes.get(10) == Some(&b'-')
        && bytes[..4].iter().all(u8::is_ascii_digit)
    {
        rest = &rest[11..];
    }
    if let Some((head, tail)) = rest.rsplit_once('-') {
        if tail.len() == 8 && tail.chars().all(|c| c.is_ascii_hexdigit()) {
            rest = head;
        }
    }
    let title = rest.replace('-', " ").trim().to_string();
    if title.is_empty() {
        "无标题笔记".into()
    } else {
        title
    }
}

pub fn is_cjk(ch: char) -> bool {
    matches!(
        ch as u32,
        0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xf900..=0xfaff | 0x3040..=0x30ff | 0xac00..=0xd7af
    )
}

pub fn count_words(text: &str) -> i64 {
    let mut count = 0i64;
    let mut in_word = false;
    for ch in text.chars() {
        if is_cjk(ch) {
            count += 1;
            in_word = false;
        } else if ch.is_alphanumeric() {
            if !in_word {
                count += 1;
                in_word = true;
            }
        } else {
            in_word = false;
        }
    }
    count
}

pub fn truncate_chars(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let mut out: String = text.chars().take(limit).collect();
    out.push('…');
    out
}

pub fn first_h1(content: &str) -> Option<String> {
    let mut in_fence = false;
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let title = rest.trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        } else if let Some(rest) = trimmed.strip_prefix("#\t") {
            let title = rest.trim();
            if !title.is_empty() {
                return Some(title.to_string());
            }
        }
    }
    None
}

pub fn split_frontmatter(input: &str) -> (Option<Frontmatter>, String) {
    let content = input.strip_prefix('\u{feff}').unwrap_or(input);
    if !content.starts_with("---") {
        return (None, input.to_string());
    }
    let rest = &content[3..];
    let rest = rest
        .strip_prefix("\r\n")
        .or_else(|| rest.strip_prefix('\n'));
    let Some(rest) = rest else {
        return (None, input.to_string());
    };
    let Some((meta, body)) = rest.split_once("\n---") else {
        return (None, input.to_string());
    };

    let mut frontmatter = Frontmatter::default();
    for line in meta.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        match key.as_str() {
            "title" => {
                let cleaned = value.trim_matches(|ch| ch == '"' || ch == '\'').trim();
                if !cleaned.is_empty() {
                    frontmatter.title = Some(cleaned.to_string());
                }
            }
            "tags" => {
                let inner = value
                    .trim_start_matches('[')
                    .trim_end_matches(']')
                    .to_string();
                frontmatter.tags = inner
                    .split(',')
                    .map(|tag| {
                        tag.trim()
                            .trim_matches(|ch| ch == '"' || ch == '\'')
                            .trim()
                            .to_string()
                    })
                    .filter(|tag| !tag.is_empty())
                    .take(20)
                    .collect();
            }
            _ => {}
        }
    }

    let body = body
        .trim_start_matches(|ch| ch == '\r' || ch == '\n')
        .trim_end_matches(|ch| ch == '\r' || ch == '\n')
        .to_string();
    (Some(frontmatter), body)
}

pub fn extract_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut seen = HashSet::new();
    let mut in_fence = false;
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let mut index = 0;
        while index < chars.len() {
            if chars[index] != '#' {
                index += 1;
                continue;
            }
            let preceded_by_space = index == 0 || chars[index - 1].is_whitespace();
            let next = chars.get(index + 1).copied();
            if !preceded_by_space || next.map(|ch| ch.is_whitespace()).unwrap_or(true) {
                index += 1;
                continue;
            }
            let mut end = index + 1;
            while end < chars.len() {
                let ch = chars[end];
                if ch.is_alphanumeric() || ch == '_' || ch == '-' {
                    end += 1;
                } else {
                    break;
                }
            }
            let tag: String = chars[index + 1..end].iter().collect();
            let tag = tag.trim_matches(|ch| ch == '-' || ch == '_').to_string();
            if !tag.is_empty()
                && tag.chars().count() <= 40
                && seen.insert(tag.clone())
                && tags.len() < 20
            {
                tags.push(tag);
            }
            index = end.max(index + 1);
        }
    }
    tags
}

pub fn strip_markdown(content: &str) -> String {
    let mut out = String::new();
    let mut in_fence = false;
    for raw_line in content.lines() {
        let trimmed = raw_line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let mut line = trimmed.to_string();
        loop {
            let stripped = line.trim_start_matches('#').trim_start();
            if stripped.len() == line.len() {
                break;
            }
            line = stripped.to_string();
        }
        if line.starts_with('>') {
            line = line.trim_start_matches('>').trim_start().to_string();
        }
        if line.starts_with("- [ ] ")
            || line.starts_with("- [x] ")
            || line.starts_with("- [X] ")
            || line.starts_with("* [ ] ")
            || line.starts_with("* [x] ")
        {
            line = line[6..].to_string();
        }
        line = line
            .trim_start_matches("- ")
            .trim_start_matches("* ")
            .trim_start_matches("+ ")
            .to_string();
        // Ordered list markers such as "1. ".
        if let Some((number, rest)) = line.split_once(". ") {
            if !number.is_empty() && number.chars().all(|ch| ch.is_ascii_digit()) {
                line = rest.to_string();
            }
        }
        out.push_str(&strip_inline(&line));
        out.push(' ');
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_inline(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::new();
    let mut index = 0;
    while index < chars.len() {
        // Images: ![alt](url) -> alt
        if chars[index] == '!' && chars.get(index + 1) == Some(&'[') {
            if let Some((label, next)) = take_link(&chars, index + 1) {
                out.push_str(&label);
                index = next;
                continue;
            }
        }
        // Links: [label](url) -> label
        if chars[index] == '[' {
            if let Some((label, next)) = take_link(&chars, index) {
                out.push_str(&label);
                index = next;
                continue;
            }
        }
        // Inline HTML-ish tags are dropped.
        if chars[index] == '<' {
            if let Some(close) = chars[index + 1..].iter().position(|ch| *ch == '>') {
                index += close + 2;
                continue;
            }
        }
        let ch = chars[index];
        if !matches!(ch, '*' | '_' | '`' | '~' | '\\') {
            out.push(ch);
        }
        index += 1;
    }
    out
}

fn take_link(chars: &[char], start: usize) -> Option<(String, usize)> {
    if chars.get(start) != Some(&'[') {
        return None;
    }
    let close = chars[start + 1..].iter().position(|ch| *ch == ']')? + start + 1;
    if chars.get(close + 1) != Some(&'(') {
        return None;
    }
    let end = chars[close + 2..].iter().position(|ch| *ch == ')')? + close + 2;
    let label: String = chars[start + 1..close].iter().collect();
    Some((label, end + 1))
}

pub fn excerpt_from(content: &str) -> String {
    let plain = strip_markdown(content);
    truncate_chars(&plain, 160)
}

pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn floor_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

pub fn make_snippet(content: &str, query: &str) -> String {
    let plain = strip_markdown(content);
    if plain.is_empty() {
        return String::new();
    }
    let lower = plain.to_lowercase();
    let needle = query
        .split_whitespace()
        .find(|term| !term.is_empty())
        .unwrap_or(query)
        .to_lowercase();
    let Some(found) = lower.find(&needle) else {
        return escape_html(&truncate_chars(&plain, 180));
    };
    let start = floor_boundary(&plain, found.saturating_sub(52));
    let end = ceil_boundary(&plain, (found + needle.len() + 110).min(plain.len()));
    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < plain.len() { "…" } else { "" };
    format!(
        "{prefix}{}<mark>{}</mark>{}{suffix}",
        escape_html(&plain[start..found]),
        escape_html(&plain[found..found + needle.len()]),
        escape_html(&plain[found + needle.len()..end]),
    )
}

pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_chinese_tags() {
        assert_eq!(
            extract_tags("今天 #工作 和 #产品 的会议\n#阅读"),
            vec!["工作", "产品", "阅读"]
        );
    }

    #[test]
    fn ignores_headings_as_tags() {
        assert_eq!(extract_tags("# 标题\n正文"), Vec::<String>::new());
    }

    #[test]
    fn splits_frontmatter() {
        let (meta, body) = split_frontmatter("---\ntitle: \"你好\"\ntags: [a, b]\n---\n正文");
        let meta = meta.unwrap();
        assert_eq!(meta.title.as_deref(), Some("你好"));
        assert_eq!(meta.tags, vec!["a", "b"]);
        assert_eq!(body, "正文");
    }

    #[test]
    fn builds_snippet() {
        let snippet = make_snippet("一段关于本地搜索的正文，还有更多内容。", "本地");
        assert!(snippet.contains("<mark>本地</mark>"));
    }

    #[test]
    fn counts_mixed_words() {
        assert_eq!(count_words("hello 世界 world"), 4);
    }
}
