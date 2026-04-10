use crate::protocol::constants::CLASS_BLOCK_REF_ANCHOR;
use crate::utils::regex::BLOCK_ID_HTML_RE;

pub fn inject_block_ids(html: &str) -> String {
    BLOCK_ID_HTML_RE.replace_all(html, |caps: &regex::Captures| {
        let id = &caps[3];
        let closing_tag = &caps[5];
        format!("<span id=\"{}\" data-block-ref=\"^{}\" class=\"{}\"></span>{}", id, id, CLASS_BLOCK_REF_ANCHOR, closing_tag)
    }).to_string()
}
