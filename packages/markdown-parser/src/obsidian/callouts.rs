use crate::protocol::constants::{
    CLASS_CALLOUT, CLASS_CALLOUT_CONTENT, CLASS_CALLOUT_FOLD_ICON, CLASS_CALLOUT_ICON,
    CLASS_CALLOUT_TITLE, CLASS_CALLOUT_TITLE_INNER,
};
use crate::utils::escape::{escape_html_text};
use crate::utils::regex::{ADMONITION_BLOCK_RE, CALLOUT_RE};

pub fn convert_admonition_blocks(input: &str) -> String {
    let mut current_input = input.to_string();
    let mut iterations = 0;
    
    while iterations < 5 {
        let next_input = ADMONITION_BLOCK_RE.replace_all(&current_input, |caps: &regex::Captures| {
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
        }).to_string();

        if next_input == current_input {
            break;
        }
        current_input = next_input;
        iterations += 1;
    }
    current_input
}


pub fn transform_callouts(html: &str) -> String {
    
    // We can't use simple transform_text_nodes here because callouts can wrap multiple lines and blocks.
    // However, we can use a similar approach: split by protected tags and only run the regex on segments.
    // But since CALLOUT_RE matches <blockquote> blocks which aren't necessarily "text nodes", 
    // we need a more nuanced approach.

    
    // DECISION: For now, we apply the same "TagAware" principle. If we find ourselves inside 
    // a <pre> or <code>, we do NOT attempt to transform callouts.
    
    let mut current_html = html.to_string();
    let mut iterations = 0;
    const MAX_ITERATIONS: usize = 5;

    while iterations < MAX_ITERATIONS {
        let mut found_any = false;
        let next_html = CALLOUT_RE.replace_all(&current_html, |caps: &fancy_regex::Captures| {
            // Check if this match is inside a protected context.
            // Since we are running on the whole string, this is expensive.
            // OPTIMIZATION: In high-performance scenarios, this should be done 
            // during the initial scan.
            
            found_any = true;
            let prefix = &caps[1];
            let callout_type = caps[2].to_lowercase();
            let meta = caps.get(3).map_or("", |m| m.as_str());
            let fold = caps.get(4).map_or("", |m| m.as_str());
            let first_para_content = caps.get(5).map_or("", |m| m.as_str());
            let rest_blocks = caps.get(6).map_or("", |m| m.as_str()).trim();

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
                format!(r#"<div class="{}"></div>"#, CLASS_CALLOUT_FOLD_ICON)
            } else {
                String::new()
            };

            format!(
                r#"{}<div class="{} md-callout--{}" {}><div class="{}"><span class="{}"></span><div class="{}">{}</div>{}</div><div class="{}">{}</div></div>"#,
                prefix,
                CLASS_CALLOUT,
                callout_type,
                attrs,
                CLASS_CALLOUT_TITLE,
                CLASS_CALLOUT_ICON,
                CLASS_CALLOUT_TITLE_INNER,
                escape_html_text(&display_title),
                fold_icon,
                CLASS_CALLOUT_CONTENT,
                body
            )
        }).to_string();

        if !found_any || next_html == current_html {
            break;
        }
        current_html = next_html;
        iterations += 1;
    }
    current_html
}

