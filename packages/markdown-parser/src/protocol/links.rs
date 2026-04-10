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
        format!("/blog/{}", slug)
    };

    let fragment = fragment.strip_prefix('^').unwrap_or(fragment);

    if fragment.is_empty() {
        base
    } else if base.is_empty() {
        format!("#{}", fragment)
    } else {
        format!("{}#{}", base, fragment)
    }
}
