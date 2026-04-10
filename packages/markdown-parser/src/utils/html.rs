pub fn parse_tag(bytes: &[u8], i: usize) -> (usize, Option<String>, bool, bool) {
    let mut j = i + 1;
    let len = bytes.len();
    
    // Closing tag case: </span>
    if j < len && bytes[j] == b'/' {
        j += 1;
        let start = j;
        while j < len && bytes[j] != b'>' && !bytes[j].is_ascii_whitespace() { j += 1; }
        let name = String::from_utf8_lossy(&bytes[start..j]).to_lowercase();
        while j < len && bytes[j] != b'>' { j += 1; }
        return (if j < len { j + 1 } else { len }, Some(name), true, false);
    }
    
    // Opening tag case: <span class="...">
    let start = j;
    while j < len && bytes[j] != b'>' && bytes[j] != b'/' && !bytes[j].is_ascii_whitespace() { j += 1; }
    let name = String::from_utf8_lossy(&bytes[start..j]).to_lowercase();
    
    let mut is_self_closing = false;
    let mut in_quotes = None;

    while j < len {
        let b = bytes[j];
        if let Some(q) = in_quotes {
            if b == q { in_quotes = None; }
        } else if b == b'"' || b == b'\'' {
            in_quotes = Some(b);
        } else if b == b'>' {
            break;
        } else if b == b'/' && j + 1 < len && bytes[j + 1] == b'>' {
            is_self_closing = true;
            break;
        }
        j += 1;
    }
    (if j < len { if is_self_closing { j + 2 } else { j + 1 } } else { len }, Some(name), false, is_self_closing)
}

/// A robust HTML processor that applies a transformation only to text nodes 
/// while respecting and skipping protected internal structures (code, pre, a, etc.).
pub fn transform_text_nodes<F>(html: &str, protected_tags: &[&str], transform: F) -> String 
where F: Fn(&str) -> String {
    let bytes = html.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(len);
    let mut last = 0;
    let mut i = 0;
    
    let mut active_protected_tags = std::collections::HashMap::new();

    while i < len {
        if bytes[i] == b'<' {
            // Process the text before the tag
            if last < i {
                let text_segment = &html[last..i];
                let is_protected = active_protected_tags.values().any(|&v: &i32| v > 0);
                if is_protected {
                    out.push_str(text_segment);
                } else {
                    out.push_str(&transform(text_segment));
                }
            }

            // Process the tag itself
            let (tag_end, name, is_closing, is_self_closing) = parse_tag(bytes, i);
            let tag_content = &html[i..tag_end];
            out.push_str(tag_content);

            if let Some(tag_name) = name {
                if protected_tags.contains(&tag_name.as_str()) {
                    if is_self_closing {
                        // No-op for self-closing tags
                    } else if is_closing {
                        let count = active_protected_tags.entry(tag_name).or_insert(0);
                        *count = (*count - 1).max(0);
                    } else {
                        let count = active_protected_tags.entry(tag_name).or_insert(0);
                        *count += 1;
                    }
                }
            }

            i = tag_end;
            last = i;
        } else {
            i += 1;
        }
    }

    if last < len {
        let text_segment = &html[last..];
        let is_protected = active_protected_tags.values().any(|&v: &i32| v > 0);
        if is_protected {
            out.push_str(text_segment);
        } else {
            out.push_str(&transform(text_segment));
        }
    }

    out
}
