use crate::protocol::constants::{
    CLASS_INTERNAL_LINK, CLASS_WIKI_EMBED, CLASS_HASHTAG
};
use crate::protocol::links::{build_wikilink_href, normalize_wikilink_target};
use crate::utils::escape::{escape_html_attr, escape_html_text};
use crate::utils::html::parse_tag;
use crate::structs::WikiLink;
use crate::obsidian::wikilinks::{parse_wikilink_at, is_attachment_ext, push_default_display};

pub struct InlineProcessResult {
    pub html: String,
    pub has_wiki_links: bool,
    pub has_wiki_embeds: bool,
    pub has_hashtags: bool,
    pub links: Vec<WikiLink>,
    pub hashtags: Vec<String>,
}

pub fn process_inline_entities(html: &str) -> InlineProcessResult {
    let bytes = html.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(len + 1024);
    let mut has_wiki_links = false;
    let mut has_wiki_embeds = false;
    let mut has_hashtags = false;
    let mut extracted_hashtags = std::collections::HashSet::new();
    let mut extracted_links = Vec::with_capacity(16);
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
                    let tag_name_raw = if is_closing {
                        tag_html.trim_start_matches("</").trim_end_matches('>').trim()
                    } else {
                        tag_html.trim_start_matches('<').trim_end_matches('>').trim_end_matches('/')
                            .split_whitespace().next().unwrap_or("")
                    };

                    let should_skip = tag_name_raw.eq_ignore_ascii_case("a") || 
                                     tag_name_raw.eq_ignore_ascii_case("code") || 
                                     tag_name_raw.eq_ignore_ascii_case("pre") || 
                                     is_math;

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

                        let is_attachment = is_attachment_ext(parts.page);
                        let escaped_full = escape_html_attr(parts.raw_target);
                        let escaped_page = escape_html_attr(parts.page);
                        let escaped_frag = escape_html_attr(parts.fragment);

                        extracted_links.push(WikiLink {
                            raw_target: parts.raw_target.to_string(),
                            normalized_target: normalize_wikilink_target(parts.raw_target),
                            page: parts.page.to_string(),
                            fragment: parts.fragment.to_string(),
                            label: parts.label.to_string(),
                            is_embed,
                        });

                        if is_embed {
                            has_wiki_embeds = true;
                            let embed_kind = if is_attachment { "image" } else { "note" };
                            out.push_str("<span class=\"");
                            out.push_str(CLASS_WIKI_EMBED);
                            if is_attachment {
                                out.push_str(" resolved-image");
                            }
                            out.push_str("\" data-embed-kind=\"");
                            out.push_str(embed_kind);
                            out.push_str("\" ");

                            if is_attachment {
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
                                let link_type = if parts.fragment.is_empty() { "article" } else if parts.fragment.starts_with('^') { "block" } else { "heading" };
                                out.push_str("data-target=\"");
                                out.push_str(&escaped_full);
                                out.push_str("\" data-page=\"");
                                out.push_str(&escaped_page);
                                out.push_str("\" data-fragment=\"");
                                out.push_str(&escaped_frag);
                                out.push_str("\" data-link-type=\"");
                                out.push_str(link_type);
                                out.push_str("\" ");
                            }
                            out.push('>');
                            out.push_str("</span>");
                        } else {
                            has_wiki_links = true;
                            let final_href = build_wikilink_href(parts.page, parts.fragment);

                            let link_type = if parts.fragment.is_empty() { "article" } else if parts.fragment.starts_with('^') { "block" } else { "heading" };
                            out.push_str("<a class=\"");
                            out.push_str(CLASS_INTERNAL_LINK);
                            out.push_str("\" data-target=\"");
                            out.push_str(&escaped_full);
                            out.push_str("\" data-page=\"");
                            out.push_str(&escaped_page);
                            out.push_str("\" data-fragment=\"");
                            out.push_str(&escaped_frag);
                            out.push_str("\" data-link-type=\"");
                            out.push_str(link_type);
                            out.push_str("\" href=\"");
                            out.push_str(&escape_html_attr(&final_href));
                            out.push_str("\">");

                            if parts.has_explicit_label && !parts.label.is_empty() {
                                out.push_str(&escape_html_text(parts.label));
                            } else {
                                push_default_display(&mut out, parts.page, parts.fragment);
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
                    let is_start = i == 0 || matches!(bytes[i-1], b' ' | b'\t' | b'\n' | b'\r' | b'>' | b'|' | b'(' | b'[' | b'{' | b':' | b',' | b';');

                    if is_start {
                        let start = i + 1;
                        let remaining = &html[start..];
                        let mut end_offset = 0;
                        for c in remaining.chars() {
                            if c.is_alphanumeric() || c == '_' || c == '-' || c == '/' {
                                end_offset += c.len_utf8();
                            } else {
                                break;
                            }
                        }
                        let j = start + end_offset;

                        if j > start {
                            let tag_name = &html[start..j];
                            let is_valid = tag_name.chars().any(|c| !c.is_numeric() || c == '_' || c == '-' || c == '/');
                            
                            if is_valid {
                                if last < i { out.push_str(&html[last..i]); }
                                out.push_str("<span class=\"");
                                out.push_str(CLASS_HASHTAG);
                                out.push_str("\">#");
                                out.push_str(&escape_html_text(tag_name));
                                out.push_str("</span>");
                                i = j;
                                last = i;
                                has_hashtags = true;
                                extracted_hashtags.insert(tag_name.to_string());
                                continue;
                            }
                        }
                    }
                }
                i += 1;
            }
            _ => i += 1,
        }
    }

    if last < len { out.push_str(&html[last..]); }
    
    let mut tags: Vec<String> = extracted_hashtags.into_iter().collect();
    tags.sort();

    InlineProcessResult {
        html: out,
        has_wiki_links,
        has_wiki_embeds,
        has_hashtags,
        links: extracted_links,
        hashtags: tags,
    }
}
