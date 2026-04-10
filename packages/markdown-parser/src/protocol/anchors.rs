use crate::protocol::links::slugify_publish_path;
use crate::utils::hash::simple_hash;
use crate::utils::regex::{HEADING_RE, HTML_TAG_RE};

pub fn inject_heading_ids(html: &str) -> String {
    HEADING_RE.replace_all(html, |caps: &regex::Captures| {
        let tag = &caps[1];
        let attrs = &caps[2];
        let content = &caps[3];
        let closing_tag = &caps[4];

        if !tag.eq_ignore_ascii_case(closing_tag) {
            return caps[0].to_string();
        }
        
        if attrs.contains("id=") {
            return caps[0].to_string();
        }

        let clean_text = HTML_TAG_RE.replace_all(content, "");
        let clean_text_trimmed = clean_text.trim();
        
        let base = slugify_publish_path(clean_text_trimmed);
        let id = if base.is_empty() { 
            format!("h-{}", &simple_hash(content)[..6])
        } else { 
            format!("h-{}", base) 
        };

        format!("<{} id=\"{}\"{}>{}</{}>", tag, id, attrs, content, tag)
    }).to_string()
}

pub fn slugify_heading_id(text: &str) -> String {
    slugify_publish_path(text)
}
