use once_cell::sync::Lazy;
use regex::Regex;

pub static CODE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<pre\b[^>]*>\s*<code\b"#).unwrap()
});

pub static TABLE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<table\b[^>]*>"#).unwrap()
});

pub static ADMONITION_BLOCK_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?sm)^```ad-([a-zA-Z0-9_-]+)[ \t]*\n(.*?)^```").unwrap()
});

// DECISION: We use fancy_regex ONLY for callouts because it requires negative look-ahead
// to correctly identify the innermost blockquote in nested structures. 
// This is a "localized patch" approach; the rest of the system uses standard crate-regex 
// for performance and safety. Avoid using this pattern for large-scale document scanning.
pub static CALLOUT_RE: Lazy<fancy_regex::Regex> = Lazy::new(|| {

    fancy_regex::Regex::new(r#"(?s)<blockquote>((?:(?!<blockquote>).)*?)<p>\s*\[!([a-zA-Z0-9_\-]+)(?:\|([^\]]+))?\]([+-]?)(.*?)</p>(.*?)</blockquote>"#).unwrap()
});



pub static HIGHLIGHT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"==([^=\n]+)==").unwrap()
});

pub static BLOCK_ID_HTML_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)([ \t]*)(\^)([a-zA-Z0-9-]+)(\s*)(</(?:p|li|blockquote|h[1-6]|div|td|th)>)"#).unwrap()
});

pub static OBSIDIAN_TASK_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<li>\s*\[([ >!xX\-/?\*lb]|&gt;)\]"#).unwrap()
});

pub static HEADING_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<(h[1-6])(\b[^>]*)>(.*?)</(h[1-6])>"#).unwrap()
});

pub static HTML_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<[^>]*>"#).unwrap()
});

pub static EXTRACT_HEADING_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<(h[1-6])\b[^>]*id="([^"]+)"[^>]*>(.*?)</h[1-6]>"#).unwrap()
});

// We'll use a dynamic pattern for EXTRACT_BLOCK_RE in the code if needed or just a placeholder
pub static EXTRACT_BLOCK_PLACEHOLDER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<span[^>]*id="([^"]+)"[^>]*class="[^"]*"[^>]*></span></([a-zA-Z0-9]+)>"#).unwrap()
});
