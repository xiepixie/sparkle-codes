/// Represents a segment of a Markdown document with its context type.
#[derive(Debug, PartialEq)]
pub enum MarkdownSegment<'a> {
    /// Normal text that can be transformed (math, highlights, etc.)
    Content(&'a str),
    /// Protected code block content (fenced or inline) that must be preserved literally
    Code(&'a str),
}

/// Splits a markdown string into segments that are either code-protected or normal content.
/// This is the "Core Truth" utility for any pre-processing task.
pub fn split_by_code_blocks(input: &str) -> Vec<MarkdownSegment<'_>> {
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut segments = Vec::new();
    let mut last = 0;
    let mut i = 0;

    let mut in_fenced_code = false;
    let mut in_inline_code = false;

    while i < len {
        // Handle escaping
        if bytes[i] == b'\\' && i + 1 < len {
            i += 2;
            continue;
        }

        // Fenced code block detection (```)
        if !in_inline_code && i + 2 < len && &bytes[i..i + 3] == b"```" {
            if in_fenced_code {
                // Ending fenced code
                segments.push(MarkdownSegment::Code(&input[last..i + 3]));
                i += 3;
                last = i;
                in_fenced_code = false;
            } else {
                // Starting fenced code
                if last < i {
                    segments.push(MarkdownSegment::Content(&input[last..i]));
                }
                last = i;
                i += 3;
                in_fenced_code = true;
            }
            continue;
        }

        // Inline code detection (`)
        if !in_fenced_code && bytes[i] == b'`' {
            if in_inline_code {
                // Ending inline code
                segments.push(MarkdownSegment::Code(&input[last..i + 1]));
                i += 1;
                last = i;
                in_inline_code = false;
            } else {
                // Starting inline code
                if last < i {
                    segments.push(MarkdownSegment::Content(&input[last..i]));
                }
                last = i;
                i += 1;
                in_inline_code = true;
            }
            continue;
        }

        i += 1;
    }

    if last < len {
        let text = &input[last..len];
        if in_fenced_code || in_inline_code {
            segments.push(MarkdownSegment::Code(text));
        } else {
            segments.push(MarkdownSegment::Content(text));
        }
    }

    segments
}
