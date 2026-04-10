use regex::Regex;
use once_cell::sync::Lazy;
use crate::types::LinkInstance;

static RE_METABIND_INLINE: Lazy<Regex> = Lazy::new(|| {
    // Matches INPUT[...], VIEW[...], button[...]
    Regex::new(r#"(?i)(INPUT|VIEW|BUTTON)\[[^\]]+\]"#).unwrap()
});


/// Cleans up Obsidian-specific syntax that shouldn't be exposed as-is.
pub fn transform_obsidian_to_mdx(content: &str) -> String {
    // 1. Strip Meta Bind inline components (for now, until we have a component for them)
    // Use a unique marker that we'll handle in apply_mdx_safety
    let cleaned = RE_METABIND_INLINE.replace_all(content, "__SENTINEL_METABIND_$[ $1 ]$__");
    cleaned.to_string()
}

/// Renders a version of the markdown optimized for publishing to documentation tools like Fumadocs.
/// This avoids raw HTML output and instead produces clean, standard Markdown/MDX.
pub fn render_publishable_markdown(content: &str, links: &[LinkInstance]) -> String {
    let mut output = transform_obsidian_to_mdx(content);

    // 1. Resolve WikiLinks and Embeds in the markdown source
    for link in links {
        let alias = link.alias.as_deref().unwrap_or(&link.target);
        
        let target_url = if let Some(url) = &link.attachment_url {
            url.clone()
        } else if let Some(resolved) = &link.resolved {
            if let Some(slug) = &resolved.target_slug {
                let area = resolved.target_area.as_deref().unwrap_or("OTHER");
                let base_path = match area {
                    "WORK" => "/blog",
                    "LEARN" => "/docs",
                    _ => "/notes",
                };
                format!("{}/{}", base_path, slug)
            } else {
                continue;
            }
        } else {
            continue;
        };

        // Construct standard markdown link or image
        let md_replacement = if link.kind == "EMBED" {
            format!("![{}]({})", alias, target_url)
        } else {
            format!("[{}]({})", alias, target_url)
        };

        // Create regex to find [[target]] or [[target|alias]] or others
        let mut patterns = vec![
            format!(r#"\[\[{}\]\]"#, regex::escape(&link.target)),
        ];
        if let Some(a) = &link.alias {
             patterns.push(format!(r#"\[\[{}|{}\]\]"#, regex::escape(&link.target), regex::escape(a)));
        }
        
        // Also handle ![[target]]
        if link.kind == "EMBED" {
            patterns = patterns.into_iter().map(|p| format!("!{}", p)).collect();
        }

        for p in patterns {
            if let Ok(re) = Regex::new(&p) {
                 output = re.replace_all(&output, md_replacement.as_str()).to_string();
            }
        }
    }

    output
}

/// Resolves placeholders in HTML using the resolved link instances.
pub fn resolve_placeholders_in_html(html: &str, links: &[LinkInstance]) -> String {
    let mut final_html = html.to_string();

    for link in links {
        let target_escaped = regex::escape(&link.target);

        // Case 1: Attachment URL available (Cloud Storage)
        if let Some(url) = &link.attachment_url {
            let escaped_url = url.replace("\"", "&quot;");
            
            if link.kind == "EMBED" {
                // Replace image embed data-src attribute only, preserving other attributes
                let re_str = format!(r##"(?i)data-src\s*=\s*"{}"([^>]*?)>"##, target_escaped);
                if let Ok(re) = Regex::new(&re_str) {
                    final_html = re.replace_all(&final_html, |caps: &regex::Captures| {
                        let attrs_after = &caps[1];
                        format!("data-src=\"{}\"{} >", escaped_url, attrs_after)
                    }).to_string();
                }
                
                // Also ensure the classes are updated to reflect resolution
                let re_class = format!(r##"(?i)<span([^>]+?)data-src="{}"([^>]*?)>"##, regex::escape(&escaped_url));
                if let Ok(re) = Regex::new(&re_class) {
                    final_html = re.replace_all(&final_html, |caps: &regex::Captures| {
                        let attrs_before = &caps[1];
                        let attrs_after = &caps[2];
                        let mut new_attrs = attrs_before.to_string();
                        if !new_attrs.contains("resolved-image") {
                            new_attrs.push_str(" resolved-image");
                        }
                        format!("<span{}data-src=\"{}\"{}>", new_attrs, escaped_url, attrs_after)
                    }).to_string();
                }
            } else {
                // Link to an attachment file - replace href attribute
                let re_str = format!(r##"(?i)data-target\s*=\s*"{}"([^>]*)href\s*=\s*"#""##, target_escaped);
                if let Ok(re) = Regex::new(&re_str) {
                    final_html = re.replace_all(&final_html, |caps: &regex::Captures| {
                        let attrs_between = &caps[1];
                        format!("data-target=\"{}\"{}href=\"{}\"", &link.target, attrs_between, escaped_url)
                    }).to_string();
                }
            }
        } 
        // Case 2: Internal Document Link
        else if let Some(resolved) = &link.resolved {
            if let Some(slug) = &resolved.target_slug {
                let area = resolved.target_area.as_deref().unwrap_or("OTHER");
                let base_path = match area {
                    "WORK" => "/blog",
                    "LEARN" => "/docs",
                    _ => "/notes",
                };
                
                let full_href = format!("{}/{}", base_path, slug);
                
                // We match any element with data-target and href="#"
                let re_str = format!(r##"(?i)data-target="{}"([^>]*)href="#"##, target_escaped);
                if let Ok(re) = Regex::new(&re_str) {
                    final_html = re.replace_all(&final_html, |caps: &regex::Captures| {
                        let attrs_between = &caps[1];
                        format!(
                            "data-target=\"{}\"{}href=\"{}\"", 
                            &link.target, attrs_between, &full_href
                        )
                    }).to_string();
                }
            }
        }
    }

    final_html
}
