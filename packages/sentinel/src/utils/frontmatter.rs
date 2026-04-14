use std::collections::HashMap;
use serde_json::Value;
use yaml_rust2::{YamlLoader, Yaml};

pub struct ParsedFM {
    pub clean_body: String,
    pub fields: HashMap<String, Value>,
}

pub struct FrontMatterResult<'a> {
    pub raw_yaml: Option<&'a str>,
    pub body: &'a str,
}

/// Decouples raw text separation from YAML parsing for robustness.
pub fn split_frontmatter(content: &str) -> FrontMatterResult<'_> {
    // 1. Check if the file starts with the frontmatter delimiter "---"
    // We allow trailing whitespace after the first "---" before the newline.
    let first_line = content.split('\n').next().unwrap_or("");
    if first_line.trim_end() != "---" {
        return FrontMatterResult { raw_yaml: None, body: content };
    }

    let start_offset = first_line.len() + 1; // skip "---" plus '\n'
    if start_offset >= content.len() {
        return FrontMatterResult { raw_yaml: None, body: content };
    }

    // 2. Find the closing delimiter: a "---" occurring at the start of a line.
    // We search for "\n---" then ensure it's either followed by newline or EOF.
    let mut search_idx = start_offset;
    while let Some(rel_match) = content[search_idx..].find("\n---") {
        let newline_idx = search_idx + rel_match;
        let delimiter_start = newline_idx + 1;
        let after_delimiter = &content[delimiter_start + 3..];

        // Ensure the delimiter line only contains "---" (plus opt whitespace)
        let next_newline = after_delimiter.find('\n').unwrap_or(after_delimiter.len());
        let delimiter_line_remainder = &after_delimiter[..next_newline].trim_end_matches('\r');
        
        if delimiter_line_remainder.trim().is_empty() {
            // Found it!
            let yaml_content = &content[start_offset..newline_idx];
            let body = if next_newline < after_delimiter.len() {
                &after_delimiter[next_newline + 1..]
            } else {
                ""
            };

            return FrontMatterResult {
                raw_yaml: Some(yaml_content),
                body,
            };
        }
        search_idx = delimiter_start + 3;
    }
    
    FrontMatterResult {
        raw_yaml: None,
        body: content,
    }
}

pub fn parse_frontmatter(content: &str) -> ParsedFM {
    let split = split_frontmatter(content);
    let mut fields = HashMap::new();

    if let Some(fm_slice) = split.raw_yaml {
        if let Ok(docs) = YamlLoader::load_from_str(fm_slice) {
            if let Some(Yaml::Hash(hash)) = docs.first() {
                for (k, v) in hash {
                    if let Some(key_str) = k.as_str() {
                        if let Some(json_val) = yaml_to_json(v) {
                            fields.insert(key_str.to_string(), json_val);
                        }
                    }
                }
            }
        }
    }

    ParsedFM {
        clean_body: split.body.to_string(),
        fields,
    }
}

fn yaml_to_json(yaml: &Yaml) -> Option<Value> {
    match yaml {
        Yaml::String(s) => Some(Value::String(s.clone())),
        Yaml::Integer(i) => Some(Value::Number((*i).into())),
        Yaml::Boolean(b) => Some(Value::Bool(*b)),
        Yaml::Array(a) => {
            let arr: Vec<Value> = a.iter().filter_map(yaml_to_json).collect();
            Some(Value::Array(arr))
        },
        Yaml::Hash(h) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in h {
                if let Some(k_str) = k.as_str() {
                    if let Some(v_json) = yaml_to_json(v) {
                        obj.insert(k_str.to_string(), v_json);
                    }
                }
            }
            Some(Value::Object(obj))
        },
        Yaml::Real(s) => Some(Value::String(s.clone())),
        other => {
            // Attempt to stringify unknown types as a last resort
            // This captures Dates or Alias if handled by the parser but not explicitly by us
            other.as_str().map(|s| Value::String(s.to_string()))
        }
    }
}
