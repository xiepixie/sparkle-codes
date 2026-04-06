use serde::Serialize;
use once_cell::sync::Lazy;
use regex::Regex;

/// Maximum input size to prevent DoS (~500 KiB)
const MAX_INPUT_SIZE: usize = 512_000;

static CODE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<pre\b[^>]*>\s*<code\b"#).unwrap()
});
static TABLE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<table\b[^>]*>"#).unwrap()
});
static BLOCK_ID_HTML_RE: Lazy<Regex> = Lazy::new(|| {
    // Matches Obsidian-style block IDs like " ^id" before a closing tag of a block element.
    Regex::new(r#"(?i)([ \t]*)(\^)([a-zA-Z0-9-]+)(\s*)(</(?:p|li|blockquote|h[1-6]|div|td|th)>)"#).unwrap()
});
static HEADING_RE: Lazy<Regex> = Lazy::new(|| {
    // Note: Rust 'regex' crate does not support backreferences like \1.
    // We match any h1-h6 tag and verify they match in the callback below.
    Regex::new(r#"(?i)<(h[1-6])(\b[^>]*)>(.*?)</(h[1-6])>"#).unwrap()
});
static HTML_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<[^>]*>"#).unwrap()
});
static OBSIDIAN_TASK_RE: Lazy<Regex> = Lazy::new(|| {
    // Matches Obsidian-style extended task markers at the start of a list item.
    // Handles markers like [>], [!], [-], [/], [?], [x], and HTML entities like &gt;.
    Regex::new(r#"(?i)<li>\s*\[([>!xX\-/?]|&gt;)\]"#).unwrap()
});
static ADMONITION_BLOCK_RE: Lazy<Regex> = Lazy::new(|| {
    // Matches Obsidian Admonition code block syntax: ```ad-type \n content \n ```
    Regex::new(r"(?sm)^```ad-([a-zA-Z0-9_-]+)[ \t]*\n(.*?)^```").unwrap()
});
static ESCAPED_HASH_PLACEHOLDER: &str = "__SPARKLE_ESCAPED_HASH__";

#[derive(Serialize, Debug, Clone)]
pub struct WikiLink {
    pub raw_target: String,
    pub normalized_target: String,
    pub page: String,
    pub fragment: String,
    pub label: String,
    pub is_embed: bool,
}

#[derive(Serialize)]
pub struct ParseResult {
    pub html: String,
    pub hash: String,
    pub has_math: bool,
    pub has_code: bool,
    pub has_table: bool,
    pub has_wiki_links: bool,
    pub has_wiki_embeds: bool,
    pub has_hashtags: bool,
    pub links: Vec<WikiLink>,
}
fn parse_tag(bytes: &[u8], i: usize) -> (usize, Option<u8>, bool, bool) {
    let mut j = i + 1;
    let len = bytes.len();
    if j < len && bytes[j] == b'/' {
        j += 1;
        let mut kind = None;
        if j < len { kind = Some(bytes[j]); }
        while j < len && bytes[j] != b'>' { j += 1; }
        return (if j < len { j + 1 } else { len }, kind, true, false);
    }
    
    let mut kind = None;
    if j < len { kind = Some(bytes[j]); }
    let mut is_self_closing = false;
    while j < len && bytes[j] != b'>' {
        if bytes[j] == b'/' && j + 1 < len && bytes[j + 1] == b'>' {
            is_self_closing = true;
            break;
        }
        j += 1;
    }
    (if j < len { if is_self_closing { j + 2 } else { j + 1 } } else { len }, kind, false, is_self_closing)
}

struct ParsedWikiLink<'a> {
    raw_target: &'a str,
    full_target: String,
    page: &'a str,
    fragment: &'a str,
    label: &'a str,
    has_explicit_label: bool,
}

fn parse_wikilink_at<'a>(html: &'a str, bytes: &[u8], i: usize) -> Option<(usize, ParsedWikiLink<'a>)> {
    let mut j = i + 2;
    let len = bytes.len();
    let mut pipe = None;
    let mut hash = None;
    
    // Safety limit to avoid scanning entire document for unclosed [[
    let max_search = (i + 512).min(len);
    
    while j + 1 < max_search {
        let b = bytes[j];
        if b == b'<' || b == b'>' || b == b'&' || b == b'\n' {
            // STOP: Wiki links must not cross HTML tag boundaries, entities, or newlines!
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
                full_target: raw_target.to_string(),
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

fn is_image_ext(page: &str) -> bool {
    let page = page.to_lowercase();
    page.ends_with(".png") || page.ends_with(".jpg") || page.ends_with(".jpeg") || 
    page.ends_with(".gif") || page.ends_with(".webp") || page.ends_with(".svg") ||
    page.ends_with(".pdf")
}

fn escape_html_attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("&quot;"),
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn escape_html_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

fn push_default_display(out: &mut String, page: &str, fragment: &str) {
    if !page.is_empty() {
        out.push_str(&escape_html_text(page));
    }
    if !fragment.is_empty() {
        if !page.is_empty() { out.push_str(" > "); }
        out.push_str(&escape_html_text(fragment));
    }
}

fn process_inline_entities(html: &str) -> (String, bool, bool, Vec<WikiLink>, bool) {
    let bytes = html.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(len + 1024);
    let mut has_wiki_links = false;
    let mut has_wiki_embeds = false;
    let mut has_hashtags = false;
    let mut extracted_links = Vec::new();
    let mut last = 0;
    let mut skip_depth: i32 = 0;
    let mut i = 0;

    while i < len {
        match bytes[i] {
            b'<' => {
                if last < i { out.push_str(&html[last..i]); }
                let (tag_end, _kind, is_closing, is_self_closing) = parse_tag(bytes, i);
                
                let tag_html = &html[i..tag_end];
                let is_math = tag_html.contains("math-inline") || 
                             tag_html.contains("math-block") || 
                             tag_html.contains("math-display") ||
                             tag_html.contains("language-math");

                if !is_self_closing {
                    let tag_name = if is_closing {
                        tag_html.trim_start_matches("</").trim_end_matches('>').trim().to_lowercase()
                    } else {
                        tag_html.trim_start_matches('<').trim_end_matches('>').trim_end_matches('/').trim()
                            .split_whitespace().next().unwrap_or("").to_lowercase()
                    };

                    let should_skip = tag_name == "a" || tag_name == "code" || tag_name == "pre" || is_math;

                    if should_skip {
                        if is_closing {
                            skip_depth = (skip_depth - 1).max(0);
                        } else {
                            skip_depth += 1;
                        }
                    }
                }
                
                out.push_str(tag_html);
                i = tag_end;
                last = i;
            }
            b'[' => {
                if i + 1 < len && bytes[i + 1] == b'[' && skip_depth == 0 {
                    let is_embed = i > 0 && bytes[i - 1] == b'!';
                    let start_idx = if is_embed { i - 1 } else { i };

                    if let Some((end, parts)) = parse_wikilink_at(html, bytes, i) {
                        if last < start_idx { out.push_str(&html[last..start_idx]); }

                        let is_image = is_image_ext(parts.page);
                        let escaped_full = escape_html_attr(&parts.full_target);
                        let escaped_page = escape_html_attr(parts.page);
                        let escaped_frag = escape_html_attr(&parts.fragment);
                        
                        extracted_links.push(WikiLink {
                            raw_target: parts.raw_target.to_string(),
                            normalized_target: parts.full_target.to_lowercase(),
                            page: parts.page.to_string(),
                            fragment: parts.fragment.to_string(),
                            label: parts.label.to_string(),
                            is_embed,
                        });

                        if is_embed {
                            has_wiki_embeds = true;
                            let embed_kind = if is_image { "image" } else { "note" };
                            out.push_str("<span class=\"wiki-embed\" data-embed-kind=\"");
                            out.push_str(embed_kind);
                            out.push_str("\" ");

                            if is_image {
                                out.push_str("data-src=\"");
                                out.push_str(&escaped_full);
                                out.push_str("\" ");
                                if parts.has_explicit_label {
                                    let escaped_alt = escape_html_attr(parts.label);
                                    out.push_str("data-alt=\"");
                                    out.push_str(&escaped_alt);
                                    out.push_str("\" ");
                                }
                            } else {
                                out.push_str("data-target=\"");
                                out.push_str(&escaped_full);
                                out.push_str("\" data-page=\"");
                                out.push_str(&escaped_page);
                                out.push_str("\" data-fragment=\"");
                                out.push_str(&escaped_frag);
                                out.push_str("\" ");
                            }
                            out.push_str(">");
                            
                            if is_image { out.push_str("<span class=\"wiki-embed-image-placeholder\">🖼️ "); }
                            else { out.push_str("<span class=\"wiki-embed-note-placeholder\">📄 "); }
                            
                            if parts.has_explicit_label && !parts.label.is_empty() {
                                out.push_str(&escape_html_text(parts.label));
                            } else {
                                push_default_display(&mut out, parts.page, &parts.fragment);
                            }
                            out.push_str("</span></span>");
                        } else {
                            has_wiki_links = true;
                            out.push_str("<a class=\"wiki-link\" data-target=\"");
                            out.push_str(&escaped_full);
                            out.push_str("\" data-page=\"");
                            out.push_str(&escaped_page);
                            out.push_str("\" data-fragment=\"");
                            out.push_str(&escaped_frag);
                            out.push_str("\" href=\"#\" title=\"Link to: ");
                            out.push_str(&escaped_full);
                            out.push_str("\">");

                            if parts.has_explicit_label && !parts.label.is_empty() {
                                out.push_str(&escape_html_text(parts.label));
                            } else {
                                push_default_display(&mut out, parts.page, &parts.fragment);
                            }
                            out.push_str("</a>");
                        }

                        i = end;
                        last = i;
                        continue;
                    }
                }
                i += 1;
            }
            b'#' => {
                if skip_depth == 0 {
                    let is_start = i == 0 || match bytes[i-1] {
                        b' ' | b'\t' | b'\n' | b'\r' | b'>' | b'|' | b'(' | b'[' | b'{' | b':' | b',' | b';' => true,
                        _ => false,
                    };

                    if is_start {
                        let start = i + 1;
                        let mut j = start;
                        while j < len {
                            let b = bytes[j];
                            if b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'/' {
                                j += 1;
                            } else {
                                break;
                            }
                        }

                        if j > start {
                            let tag_name = &html[start..j];
                            let has_alpha = tag_name.bytes().any(|b| b.is_ascii_alphabetic() || b == b'_' || b == b'-' || b == b'/');
                            
                            if has_alpha {
                                if last < i { out.push_str(&html[last..i]); }
                                out.push_str("<span class=\"premium-tag md-hashtag\">#");
                                out.push_str(&escape_html_text(tag_name));
                                out.push_str("</span>");
                                i = j;
                                last = i;
                                has_hashtags = true;
                                continue;
                            }
                        }
                    }
                }
                i += 1;
            }
            _ => { i += 1; }
        }
    }

    if last < len { out.push_str(&html[last..len]); }
    (out, has_wiki_links, has_wiki_embeds, extracted_links, has_hashtags)
}

fn convert_admonition_blocks(input: &str) -> String {
    ADMONITION_BLOCK_RE.replace_all(input, |caps: &regex::Captures| {
        let ad_type = &caps[1];
        let content = &caps[2];
        
        let mut title = String::new();
        let mut body = String::new();
        let mut collapse = String::new();
        let mut color = String::new();
        let mut icon = String::new();
        
        for line in content.lines() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("title:") && title.is_empty() && body.is_empty() {
                title = trimmed["title:".len()..].trim().to_string();
            } else if trimmed.starts_with("collapse:") && body.is_empty() {
                let val = trimmed["collapse:".len()..].trim().to_lowercase();
                if val == "open" || val == "true" {
                    collapse = "+".to_string();
                } else if val == "closed" || val == "false" {
                    collapse = "-".to_string();
                }
            } else if trimmed.starts_with("color:") && body.is_empty() {
                color = trimmed["color:".len()..].trim().to_string();
            } else if trimmed.starts_with("icon:") && body.is_empty() {
                icon = trimmed["icon:".len()..].trim().to_string();
            } else {
                body.push_str("> ");
                body.push_str(line);
                body.push('\n');
            }
        }
        
        let mut out = format!("> [!{}", ad_type);
        if !color.is_empty() || !icon.is_empty() {
            out.push('|');
            if !color.is_empty() {
                out.push_str("color=");
                out.push_str(&color);
            }
            if !icon.is_empty() {
                if !color.is_empty() { out.push(','); }
                out.push_str("icon=");
                out.push_str(&icon);
            }
        }
        out.push(']');
        out.push_str(&collapse);

        if !title.is_empty() {
            out.push(' ');
            out.push_str(&title);
        }
        out.push('\n');
        
        out.push_str(&body);
        out
    }).to_string()
}

fn extract_math(input: &str, math_store: &mut Vec<(String, bool)>) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let len = bytes.len();
    let mut i = 0;
    let mut last = 0;

    while i < len {
        if bytes[i] == b'\\' && i + 1 < len {
            i += 2;
            continue;
        }

        if bytes[i] == b'$' {
            let is_block = i + 1 < len && bytes[i + 1] == b'$';
            let start_content = if is_block { i + 2 } else { i + 1 };
            
            let mut j = start_content;
            let mut found = false;
            while j < len {
                if bytes[j] == b'\\' && j + 1 < len {
                    j += 2;
                    continue;
                }
                if bytes[j] == b'$' {
                    if is_block {
                        if j + 1 < len && bytes[j + 1] == b'$' {
                            found = true;
                            break;
                        } else {
                            j += 1;
                            continue;
                        }
                    } else {
                        found = true;
                        break;
                    }
                }
                if !is_block && bytes[j] == b'\n' {
                    break;
                }
                j += 1;
            }

            if found {
                if last < i {
                    out.push_str(&input[last..i]);
                }
                let end_content = j;
                let raw_formula = &input[start_content..end_content];
                
                let mut cleaned_formula = String::with_capacity(raw_formula.len());
                for line in raw_formula.lines() {
                    let mut current = line.trim_start();
                    // Recursively strip Obsidian blockquote markers (e.g., "> > ")
                    while current.starts_with('>') {
                        current = &current[1..];
                        if current.starts_with(' ') {
                            current = &current[1..];
                        }
                    }
                    cleaned_formula.push_str(current);
                    cleaned_formula.push('\n');
                }
                let formula = cleaned_formula.trim().to_string();
                let idx = math_store.len();
                math_store.push((formula, is_block));
                out.push_str(&format!("SPARKLE_MATH_PLACEHOLDER_{}X", idx));
                
                i = if is_block { j + 2 } else { j + 1 };
                last = i;
                continue;
            }
        }
        i += 1;
    }

    if last < len {
        out.push_str(&input[last..len]);
    }
    out
}

pub fn parse_content_native(input: &str) -> Result<ParseResult, String> {
    if input.len() > MAX_INPUT_SIZE {
        return Err(format!(
            "Content too large ({} bytes). Maximum allowed: {} bytes. Please split into smaller sections.",
            input.len(),
            MAX_INPUT_SIZE
        ));
    }

    let mut math_store = Vec::new();

    // Pass 0: Convert Obsidian Admonition code blocks ```ad-* to native blockquotes
    let input_converted = convert_admonition_blocks(input);

    // Pass 1: Capture and hide math
    let content = extract_math(&input_converted, &mut math_store);
    
    // Pass 1.2: Protect escaped hashtags \# to prevent them from being identified as tags
    let content = content.replace("\\#", ESCAPED_HASH_PLACEHOLDER);

    // Pass 2: Markdown Processing
    let options = markdown::Options {
        parse: markdown::ParseOptions {
            constructs: markdown::Constructs {
                math_text: false, // Disable built-in math to avoid escaping placeholders
                math_flow: false,
                frontmatter: false,
                ..markdown::Constructs::gfm()
            },
            ..markdown::ParseOptions::gfm()
        },
        compile: markdown::CompileOptions {
            allow_dangerous_html: true, 
            allow_dangerous_protocol: true, 
            ..markdown::CompileOptions::gfm()
        },
    };

    let html = markdown::to_html_with_options(&content, &options)
        .map_err(|e| format!("Parse error: {}", e))?;

    // Pass 2.5: Process Obsidian Block IDs (^id at end of blocks)
    // Convert "<p>content ^id</p>" to "<p id=\"id\">content</p>"
    let html = BLOCK_ID_HTML_RE.replace_all(&html, |caps: &regex::Captures| {
        let id = &caps[3];
        let closing_tag = &caps[5];
        // We keep the ^ in the ID to match browser selection exactly when using #^id
        format!("<span id=\"^{}\" class=\"block-anchor\"></span>{}", id, closing_tag)
    }).to_string();

    // Pass 2.5.5: Generate Heading IDs for Jump Navigation
    let html = HEADING_RE.replace_all(&html, |caps: &regex::Captures| {
        let tag = &caps[1];
        let attrs = &caps[2];
        let content = &caps[3];
        let closing_tag = &caps[4];

        // Ensure the opening and closing tags match (h1-h6)
        if tag.to_lowercase() != closing_tag.to_lowercase() {
            return caps[0].to_string();
        }
        
        if attrs.contains("id=") {
            return caps[0].to_string();
        }

        let clean_text = HTML_TAG_RE.replace_all(content, "").trim().to_lowercase();
        let mut slug = String::with_capacity(clean_text.len());
        for c in clean_text.chars() {
            if c.is_alphanumeric() {
                slug.push(c);
            } else if c.is_whitespace() || c == '-' || c == '_' {
                if !slug.ends_with('-') && !slug.is_empty() {
                    slug.push('-');
                }
            }
        }
        if slug.ends_with('-') { slug.pop(); }
        
        let id = if slug.is_empty() { 
            format!("h-{}", simple_hash(content)[..6].to_string())
        } else { 
            format!("h-{}", slug) 
        };

        format!("<{} id=\"{}\"{}>{}</{}>", tag, id, attrs, content, tag)
    }).to_string();

    // Pass 2.6: Obsidian Extended Task Markers ([>], [!], [-], etc.)
    let html = OBSIDIAN_TASK_RE.replace_all(&html, |caps: &regex::Captures| {
        let marker = &caps[1];
        let (class, _checked) = match marker {
            ">" | "&gt;" => ("task-in-progress", false),
            "!" => ("task-important", false),
            "-" => ("task-cancelled", true),
            "/" => ("task-incomplete", false),
            "?" => ("task-question", false),
            "x" | "X" => ("task-completed", true),
            _ => ("task-custom", false),
        };
        format!(
            r#"<li class="obsidian-task {}" data-task="{}">"#,
            class,
            if marker == "&gt;" { ">" } else { marker }
        )
    }).to_string();

    // Pass 2.7: Obsidian Callout Transformation (P0 Fix)
    // GFM output for blockquotes: <blockquote>\n<p>[!type] Title\nbody line 1\nbody line 2</p>\n</blockquote>
    // Key insight: lines are separated by \n (not <br>) inside <p> tags
    static CALLOUT_RE: Lazy<Regex> = Lazy::new(|| {
        // Match: <blockquote>\n<p>[!type|metadata]fold<rest-of-first-para></p><rest></blockquote>
        Regex::new(r#"(?s)<blockquote>\s*<p>\s*\[!([a-zA-Z0-9_\-]+)(?:\|([^\]]+))?\]([+-]?)(.*?)</p>(.*?)</blockquote>"#).unwrap()
    });

    let html = CALLOUT_RE.replace_all(&html, |caps: &regex::Captures| {
        let callout_type = caps[1].to_lowercase();
        let meta = caps.get(2).map_or("", |m| m.as_str());
        let fold = caps.get(3).map_or("", |m| m.as_str());
        let first_para_content = caps.get(4).map_or("", |m| m.as_str());
        let rest_blocks = caps.get(5).map_or("", |m| m.as_str()).trim();

        let mut meta_color = String::new();
        let mut meta_icon = String::new();
        for pair in meta.split(',') {
            let mut parts = pair.splitn(2, '=');
            if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
                let k = k.trim();
                let v = v.trim();
                if k == "color" { meta_color = v.to_string(); }
                else if k == "icon" { meta_icon = v.to_string(); }
            }
        }

        // Split the first paragraph content by the first \n to separate title from body
        let (title, first_body) = if let Some(newline_pos) = first_para_content.find('\n') {
            let t = first_para_content[..newline_pos].trim();
            let b = first_para_content[newline_pos + 1..].trim();
            (t, b)
        } else {
            (first_para_content.trim(), "")
        };

        let display_title = if title.is_empty() {
            let mut c = callout_type.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        } else {
            title.to_string()
        };

        let mut body = String::new();
        if !first_body.is_empty() {
            body.push_str("<p>");
            body.push_str(first_body);
            body.push_str("</p>");
        }
        if !rest_blocks.is_empty() {
            body.push_str(rest_blocks);
        }

        let mut attrs = format!(r#"data-callout-type="{}""#, callout_type);
        if !fold.is_empty() {
            attrs.push_str(&format!(r#" data-callout-fold="{}""#, fold));
        }
        if !meta_icon.is_empty() {
            attrs.push_str(&format!(r#" data-callout-icon="{}""#, meta_icon));
        }

        let mut style = String::new();
        if !meta_color.is_empty() {
            let c = if meta_color.starts_with('#') || meta_color.starts_with("rgb") {
                meta_color.clone()
            } else if meta_color.split(',').count() == 3 {
                format!("rgb({})", meta_color)
            } else {
                meta_color.clone()
            };
            style.push_str(&format!("--md-callout-color: {};", c));
        }
        if !style.is_empty() {
            attrs.push_str(&format!(r#" style="{}""#, style));
        }

        let fold_icon = if !fold.is_empty() {
            r#"<div class="md-callout-fold-icon"></div>"#
        } else {
            ""
        };

        format!(
            r#"<blockquote class="md-callout" {}><div class="md-callout-header"><span class="md-callout-icon"></span><span class="md-callout-title">{}</span>{}</div><div class="md-callout-body">{}</div></blockquote>"#,
            attrs,
            escape_html_text(&display_title),
            fold_icon,
            body
        )
    }).to_string();

    // Pass 3: Wiki Links, Hashtags & Math Re-injection
    let (mut html, has_wiki_links, has_wiki_embeds, links, has_hashtags) = process_inline_entities(&html);

    for (idx, (formula, is_block)) in math_store.iter().enumerate() {
        let placeholder = format!("SPARKLE_MATH_PLACEHOLDER_{}X", idx);
        let element = if *is_block {
            format!(
                r#"<span class="sparkle-math math-block sentinel-math-block not-prose" data-tex="{}"></span>"#,
                escape_html_attr(formula)
            )
        } else {
            format!(
                r#"<span class="sparkle-math math-inline sentinel-math-inline" data-tex="{}"></span>"#,
                escape_html_attr(formula)
            )
        };
        html = html.replace(&placeholder, &element);
    }
    
    // Pass 4: Restore escaped hashtags
    html = html.replace(ESCAPED_HASH_PLACEHOLDER, r#"<span class="not-a-tag">#</span>"#);

    let has_math = !math_store.is_empty();
    let has_code = CODE_TAG_RE.is_match(&html);
    let has_table = TABLE_TAG_RE.is_match(&html);
    let hash = simple_hash(&html);

    Ok(ParseResult {
        html,
        hash,
        has_math,
        has_code,
        has_table,
        has_wiki_links,
        has_wiki_embeds,
        has_hashtags,
        links,
    })
}

// NOTE: Math detection uses regex on HTML output from markdown-rs.
// Future: Extract from MDAST directly via markdown::to_mdast().

fn simple_hash(input: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_max_input_size() {
        let large = "x".repeat(MAX_INPUT_SIZE + 1);
        assert!(parse_content_native(&large).is_err());
    }

    #[test]
    fn test_wikilink_basic() {
        let res = parse_content_native("[[Page]]").unwrap();
        assert!(res.has_wiki_links);
        assert_eq!(res.links.len(), 1);
        assert_eq!(res.links[0].page, "Page");
    }

    #[test]
    fn test_hashtags() {
        let res = parse_content_native("Hello #world, this is a #tag-name and #/path/tag.").unwrap();
        assert!(res.has_hashtags);
        assert!(res.html.contains("class=\"premium-tag md-hashtag\""));
        assert!(res.html.contains("#world"));
        assert!(res.html.contains("#tag-name"));
        assert!(res.html.contains("#/path/tag"));
        
        // Should not match pure numbers (IDs usually start with letter in hashtag specs)
        let res2 = parse_content_native("Not a hashtag: #123").unwrap();
        assert!(!res2.has_hashtags);
    }

    #[test]
    fn test_callout_basic() {
        let input = "> [!note] My Title\n> Content here";
        let res = parse_content_native(input).unwrap();
        eprintln!("[DEBUG CALLOUT HTML]: {}", res.html);
        assert!(res.html.contains("md-callout"), "Missing md-callout class");
        assert!(res.html.contains("data-callout-type=\"note\""), "Missing data-callout-type attribute");
        assert!(res.html.contains("My Title"), "Missing title");
        assert!(res.html.contains("Content here"), "Missing content in body");
        // Content should be in body, NOT in title
        assert!(res.html.contains("md-callout-body"), "Missing body div");
    }

    #[test]
    fn test_callout_no_title() {
        let input = "> [!note]\n> 这是一个 note callout。";
        let res = parse_content_native(input).unwrap();
        eprintln!("[DEBUG CALLOUT NO-TITLE HTML]: {}", res.html);
        assert!(res.html.contains("md-callout"), "Missing md-callout class");
        assert!(res.html.contains("data-callout-type=\"note\""), "Missing data-callout-type attribute");
        // Body should contain the content, title should be "Note"
        assert!(res.html.contains(">Note<"), "Missing default title 'Note'");
        assert!(res.html.contains("这是一个 note callout。"), "Missing body content");
    }

    #[test]
    fn test_raw_gfm_callout_output() {
        // Debug: see what markdown-rs produces for blockquote [!type]
        let options = markdown::Options {
            parse: markdown::ParseOptions {
                constructs: markdown::Constructs {
                    math_text: false,
                    math_flow: false,
                    frontmatter: false,
                    ..markdown::Constructs::gfm()
                },
                ..markdown::ParseOptions::gfm()
            },
            compile: markdown::CompileOptions {
                allow_dangerous_html: true,
                allow_dangerous_protocol: true,
                ..markdown::CompileOptions::gfm()
            },
        };

        let input1 = "> [!note] My Title\n> Content here";
        let html1 = markdown::to_html_with_options(input1, &options).unwrap();
        eprintln!("[RAW GFM with-title]: {:?}", html1);

        let input2 = "> [!note]\n> 这是一个 note callout。";
        let html2 = markdown::to_html_with_options(input2, &options).unwrap();
        eprintln!("[RAW GFM no-title]: {:?}", html2);

        let input3 = "> [!example] 示例标题\n> 下面给出公式\n> more content";
        let html3 = markdown::to_html_with_options(input3, &options).unwrap();
        eprintln!("[RAW GFM multi-line]: {:?}", html3);
    }

    #[test]
    fn test_callout_with_math() {
        let input = "> [!example] 示例标题\n> 下面给出行间公式：\n> $$\n> f''(x)=\\frac{-x}{(x^2+1)^{3/2}}\n> $$";
        let res = parse_content_native(input).unwrap();
        eprintln!("[DEBUG CALLOUT+MATH HTML]: {}", res.html);
        assert!(res.html.contains("md-callout"), "Missing md-callout class");
        assert!(res.html.contains("data-callout-type=\"example\""), "Missing data-callout-type attribute");
    }
}
