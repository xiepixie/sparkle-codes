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
                // Replace image embed data-src
                // We match the data-src attribute specifically to be more robust
                let re_str = format!(r##"(?i)class="wiki-embed"([^>]*)data-src="{}"##, target_escaped);
                if let Ok(re) = Regex::new(&re_str) {
                    let repl = format!("class=\"wiki-embed resolved-image\"$1data-src=\"{}\"", escaped_url);
                    final_html = re.replace_all(&final_html, repl.as_str()).to_string();
                }
            } else {
                // Link to an attachment file
                let re_str = format!(r##"(?i)class="wiki-link"([^>]*)data-target="{}"([^>]*)href="#"##, target_escaped);
                if let Ok(re) = Regex::new(&re_str) {
                    let repl = format!("class=\"wiki-link resolved-attachment\"$1data-target=\"{link_target}\"$2href=\"{url}\"", 
                        link_target = &link.target, 
                        url = &url
                    );
                    final_html = re.replace_all(&final_html, repl.as_str()).to_string();
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
                
                let re_str = format!(r##"(?i)data-target="{}"([^>]*)href="#"##, target_escaped);
                if let Ok(re) = Regex::new(&re_str) {
                    let repl = format!("data-target=\"{link_target}\"$1href=\"{full_href}\"", 
                        link_target = &link.target, 
                        full_href = &full_href
                    );
                    final_html = re.replace_all(&final_html, repl.as_str()).to_string();
                }
            }
        }
    }

    final_html
}
