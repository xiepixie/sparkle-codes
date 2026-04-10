use crate::utils::regex::CODE_TAG_RE;

pub fn has_code(html: &str) -> bool {
    CODE_TAG_RE.is_match(html)
}
