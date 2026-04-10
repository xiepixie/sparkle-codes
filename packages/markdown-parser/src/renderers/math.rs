use crate::utils::escape::escape_html_attr;
use crate::protocol::constants::{CLASS_MATH_INLINE, CLASS_MATH_BLOCK};

#[derive(Default)]
pub struct MathStore {
    items: Vec<(String, bool)>,
}

impl MathStore {
    pub fn push(&mut self, formula: String, is_block: bool) -> usize {
        let idx = self.items.len();
        self.items.push((formula, is_block));
        idx
    }

    pub fn get(&self, idx: usize) -> Option<&(String, bool)> {
        self.items.get(idx)
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }
}

pub fn extract_math(input: &str, store: &mut MathStore) -> String {
    use crate::utils::segmenter::{split_by_code_blocks, MarkdownSegment};
    
    let segments = split_by_code_blocks(input);
    let mut out = String::with_capacity(input.len());

    for segment in segments {
        match segment {
            MarkdownSegment::Code(code) => {
                out.push_str(code);
            }
            MarkdownSegment::Content(content) => {
                let bytes = content.as_bytes();
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
                                out.push_str(&content[last..i]);
                            }
                            let end_content = j;
                            let raw_formula = &content[start_content..end_content];
                            
                            let mut cleaned_formula = String::with_capacity(raw_formula.len());
                            for line in raw_formula.lines() {
                                let mut current = line.trim_start();
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
                            let idx = store.push(formula, is_block);
                            out.push_str(&format!("SPARKLE_MATH_PLACEHOLDER_{}X", idx));
                            
                            i = if is_block { j + 2 } else { j + 1 };
                            last = i;
                            continue;
                        }
                    }
                    i += 1;
                }
                if last < len {
                    out.push_str(&content[last..len]);
                }
            }
        }
    }
    out
}

pub fn reinject_math(html: &str, store: &MathStore) -> String {
    let mut final_html = String::with_capacity(html.len() + store.len() * 128);
    let mut last_pos = 0;
    while let Some(pos) = html[last_pos..].find("SPARKLE_MATH_PLACEHOLDER_") {
        let absolute_pos = last_pos + pos;
        final_html.push_str(&html[last_pos..absolute_pos]);
        
        let tail = &html[absolute_pos + "SPARKLE_MATH_PLACEHOLDER_".len()..];
        if let Some(x_pos) = tail.find('X') {
            if let Ok(idx) = tail[..x_pos].parse::<usize>() {
                if let Some((formula, is_block)) = store.get(idx) {
                    if *is_block {
                        final_html.push_str(r#"<div class=""#);
                        final_html.push_str(CLASS_MATH_BLOCK);
                        final_html.push_str(r#"" data-tex=""#);
                        final_html.push_str(&escape_html_attr(formula));
                        final_html.push_str(r#""></div>"#);
                    } else {
                        final_html.push_str(r#"<span class=""#);
                        final_html.push_str(CLASS_MATH_INLINE);
                        final_html.push_str(r#"" data-tex=""#);
                        final_html.push_str(&escape_html_attr(formula));
                        final_html.push_str(r#""></span>"#);
                    }
                }
                last_pos = absolute_pos + "SPARKLE_MATH_PLACEHOLDER_".len() + x_pos + 1;
                continue;
            }
        }
        final_html.push_str("SPARKLE_MATH_PLACEHOLDER_");
        last_pos = absolute_pos + "SPARKLE_MATH_PLACEHOLDER_".len();
    }
    final_html.push_str(&html[last_pos..]);
    final_html
}
