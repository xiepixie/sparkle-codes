use crate::utils::escape::escape_html_text;

pub struct ParsedWikiLink<'a> {
    pub raw_target: &'a str,
    pub page: &'a str,
    pub fragment: &'a str,
    pub label: &'a str,
    pub has_explicit_label: bool,
}

pub fn parse_wikilink_at<'a>(html: &'a str, bytes: &[u8], i: usize) -> Option<(usize, ParsedWikiLink<'a>)> {
    let mut j = i + 2;
    let len = bytes.len();
    let mut pipe = None;
    let mut hash = None;
    
    let max_search = (i + 512).min(len);
    
    while j + 1 < max_search {
        let b = bytes[j];
        if b == b'<' || b == b'>' || b == b'&' || b == b'\n' {
            return None;
        }
        if b == b'|' && pipe.is_none() { pipe = Some(j); }
        else if b == b'#' && hash.is_none() && pipe.is_none() { hash = Some(j); }
        else if b == b']' && bytes[j + 1] == b']' {
            let end = j + 2;
            let raw_target = if let Some(p) = pipe { &html[i+2..p] } else { &html[i+2..j] };
            let label = if let Some(p) = pipe { &html[p+1..j] } else { raw_target };
            let has_explicit_label = pipe.is_some();
            
            let (page, fragment) = if let Some(h) = hash {
                (&html[i+2..h], &html[h+1..pipe.unwrap_or(j)])
            } else {
                (raw_target, "")
            };
            
            return Some((end, ParsedWikiLink {
                raw_target,
                page,
                fragment,
                label,
                has_explicit_label,
            }));
        }
        j += 1;
    }
    None
}

pub fn is_attachment_ext(page: &str) -> bool {
    let page = page.to_lowercase();
    page.ends_with(".png") || page.ends_with(".jpg") || page.ends_with(".jpeg") || 
    page.ends_with(".gif") || page.ends_with(".webp") || page.ends_with(".svg") ||
    page.ends_with(".pdf") || page.ends_with(".mp4") || page.ends_with(".webm") ||
    page.ends_with(".ogv") || page.ends_with(".mp3") || page.ends_with(".wav") ||
    page.ends_with(".mov")
}

pub fn push_default_display(out: &mut String, page: &str, fragment: &str) {
    if !page.is_empty() {
        out.push_str(&escape_html_text(page));
    }
    if !fragment.is_empty() {
        if !page.is_empty() {
            out.push_str(" > ");
        }
        let display_fragment = fragment.strip_prefix('^').unwrap_or(fragment);
        out.push_str(&escape_html_text(display_fragment));
    }
}
