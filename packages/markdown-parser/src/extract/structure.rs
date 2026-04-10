use regex::Regex;
use once_cell::sync::Lazy;
use crate::structs::{HeadingNode, SectionNode, BlockNode};

use crate::protocol::CLASS_BLOCK_REF_ANCHOR;

static EXTRACT_HEADING_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<(h[1-6])\b[^>]*id="([^"]+)"[^>]*>(.*?)</h[1-6]>"#).unwrap()
});
static EXTRACT_BLOCK_RE: Lazy<Regex> = Lazy::new(|| {
    let pattern = format!(r#"(?i)<span[^>]*id="([^"]+)"[^>]*class="[^"]*{}[^"]*"[^>]*></span></([a-zA-Z0-9]+)>"#, CLASS_BLOCK_REF_ANCHOR);
    Regex::new(&pattern).unwrap()
});
static HTML_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<[^>]*>"#).unwrap()
});

pub fn extract_structural_nodes(html: &str) -> (Vec<HeadingNode>, Vec<SectionNode>, Vec<BlockNode>) {
    let mut headings = Vec::new();
    let mut sections = Vec::new();
    let mut blocks = Vec::new();
    
    let mut section_boundaries = Vec::new();
    
    for cap in EXTRACT_HEADING_RE.captures_iter(html) {
        let m = cap.get(0).unwrap();
        let tag = cap.get(1).unwrap().as_str();
        let id = cap.get(2).unwrap().as_str();
        let content = cap.get(3).unwrap().as_str();
        let level = tag[1..].parse::<i32>().unwrap_or(2);
        
        headings.push(HeadingNode {
            id: id.to_string(),
            text: HTML_TAG_RE.replace_all(content, "").trim().to_string(),
            level,
        });
        
        section_boundaries.push(m.start());
    }
    section_boundaries.push(html.len());
    
    let mut last_idx = 0;
    let mut current_heading_id: Option<String> = None;
    let mut current_heading_text = "".to_string();
    let mut current_heading_level = 0;
    let mut section_index = 0_i32;
    
    for cap in EXTRACT_HEADING_RE.captures_iter(html) {
        let start_idx = cap.get(0).unwrap().start();
        
        if start_idx > last_idx || section_index == 0 {
            let html_chunk = &html[last_idx..start_idx];
            if !html_chunk.trim().is_empty() || section_index == 0 {
                sections.push(SectionNode {
                    heading_id: current_heading_id.clone(),
                    heading_text: current_heading_text.clone(),
                    heading_level: current_heading_level,
                    section_index,
                    html: html_chunk.trim().to_string(),
                    text_content: HTML_TAG_RE.replace_all(html_chunk, "").trim().to_string(),
                    is_first_section: section_index == 0,
                });
                section_index += 1;
            }
        }
        
        last_idx = start_idx;
        current_heading_id = Some(cap.get(2).unwrap().as_str().to_string());
        current_heading_text = HTML_TAG_RE.replace_all(cap.get(3).unwrap().as_str(), "").trim().to_string();
        current_heading_level = cap.get(1).unwrap().as_str()[1..].parse::<i32>().unwrap_or(2);
    }
    
    if last_idx < html.len() {
        let html_chunk = &html[last_idx..];
        if !html_chunk.trim().is_empty() || section_index == 0 {
            sections.push(SectionNode {
                heading_id: current_heading_id.clone(),
                heading_text: current_heading_text.clone(),
                heading_level: current_heading_level,
                section_index,
                html: html_chunk.trim().to_string(),
                text_content: HTML_TAG_RE.replace_all(html_chunk, "").trim().to_string(),
                is_first_section: section_index == 0,
            });
        }
    }
    
    for cap in EXTRACT_BLOCK_RE.captures_iter(html) {
        let block_id = cap.get(1).unwrap().as_str().to_string();
        let tag_name = cap.get(2).unwrap().as_str();
        let match_end = cap.get(0).unwrap().end();
        let match_start = cap.get(0).unwrap().start();
        
        let open_tag = format!("<{}", tag_name);
        let close_tag = format!("</{}", tag_name);
        
        let prefix = &html[..match_start];
        let mut depth = 0;
        let mut block_start_idx = None;
        
        let mut events = Vec::new();
        for (i, _) in prefix.rmatch_indices(&open_tag) {
            events.push((i, 1));
        }
        for (i, _) in prefix.rmatch_indices(&close_tag) {
            events.push((i, -1));
        }
        events.sort_by_key(|k| k.0);
        events.reverse();
        
        for (i, diff) in events {
            depth += diff;
            if depth > 0 {
                block_start_idx = Some(i);
                break;
            }
        }
        
        if let Some(start) = block_start_idx {
            let block_html = &html[start..match_end];
            let mut sec_idx = 0;
            for (idx, &bound) in section_boundaries.iter().enumerate() {
                if start < bound {
                    sec_idx = idx as i32;
                    break;
                }
            }
            blocks.push(BlockNode {
                block_id,
                section_index: sec_idx,
                html: block_html.to_string(),
                text_content: HTML_TAG_RE.replace_all(block_html, "").trim().to_string(),
            });
        }
    }
    
    (headings, sections, blocks)
}
