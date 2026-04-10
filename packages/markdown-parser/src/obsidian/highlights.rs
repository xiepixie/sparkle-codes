use crate::utils::regex::HIGHLIGHT_RE;
use crate::utils::html::transform_text_nodes;

pub fn transform_highlights(html: &str) -> String {
    transform_text_nodes(html, &["pre", "code", "a"], |text| {
        HIGHLIGHT_RE.replace_all(text, "<mark>$1</mark>").to_string()
    })
}
