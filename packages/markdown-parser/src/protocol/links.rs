use unicode_normalization::UnicodeNormalization;

pub fn slugify_publish_path(input: &str) -> String {
    let input = input.nfc().collect::<String>();
    let input = input.strip_suffix(".md").unwrap_or(&input);

    let mut out = String::with_capacity(input.len());
    let mut last_dash = false;

    for ch in input.chars() {
        let mapped = match ch {
            '/' | '\\' | ' ' | '_' => '-',
            '-' => '-',
            c if c.is_alphanumeric() => {
                for lower in c.to_lowercase() {
                    out.push(lower);
                }
                last_dash = false;
                continue;
            }
            _ => continue,
        };

        if !out.is_empty() && !last_dash {
            out.push(mapped);
            last_dash = true;
        }
    }

    out.trim_matches('-').to_string()
}

pub fn normalize_wikilink_target(input: &str) -> String {
    input.nfc().collect::<String>()
}

pub fn build_wikilink_href(page: &str, fragment: &str) -> String {
    let slug = slugify_publish_path(page);
    let base = if slug.is_empty() {
        String::new()
    } else {
        match path_to_area(page) {
            "WORK" => format!("/blog/{}", slug),
            "LEARN" => format!("/docs/{}", slug),
            _ => format!("/blog/{}", slug),
        }
    };

    if fragment.is_empty() {
        base
    } else if let Some(block_id) = fragment.strip_prefix('^') {
        // Block anchor: Obsidian uses ^id, but DOM ID is just the id
        if base.is_empty() {
            format!("#{}", block_id)
        } else {
            format!("{}#{}", base, block_id)
        }
    } else {
        // Heading: slug-ify to match inject_heading_ids output (h-slug)
        let heading_id = format!("h-{}", slugify_publish_path(fragment));
        if base.is_empty() {
            format!("#{}", heading_id)
        } else {
            format!("{}#{}", base, heading_id)
        }
    }
}

fn path_to_area(path: &str) -> &'static str {
    if path.starts_with("Work/") || path.starts_with("work/") { "WORK" }
    else if path.starts_with("Learn/") || path.starts_with("learn/") { "LEARN" }
    else { "OTHER" }
}
