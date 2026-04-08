use std::path::PathBuf;

use crate::config::SyncConfig;
use crate::types::{VaultArea, VaultSection};

/// Detect the top-level vault area from a relative vault path.
///
/// Business rules:
/// - "0-收集箱" => Inbox
/// - "工作领域" => Work
/// - "学习领域" => Learn
/// - everything else => Other
///
/// Note:
/// "生活领域" intentionally falls into Other and is not treated as a publishable domain.
pub fn detect_area(vault_path: &str) -> VaultArea {
    let normalized = normalize_vault_path(vault_path);

    if normalized.starts_with("0-收集箱/") || normalized == "0-收集箱" {
        VaultArea::Inbox
    } else if normalized.starts_with("工作领域/") || normalized == "工作领域" {
        VaultArea::Work
    } else if normalized.starts_with("学习领域/") || normalized == "学习领域" {
        VaultArea::Learn
    } else {
        VaultArea::Other
    }
}

/// Detect the second-level section inside publishable domains.
///
/// Supported sections:
/// - 归档 => Archive
/// - 收集 => Collect
/// - 项目 => Project
/// - 资源 => Resource
///
/// Returns VaultSection::None for Inbox, Other, or malformed paths.
pub fn detect_section(vault_path: &str) -> VaultSection {
    let normalized = normalize_vault_path(vault_path);
    let mut parts = normalized.split('/');

    let first = parts.next();
    let second = parts.next();

    match (first, second) {
        (Some("工作领域"), Some("归档")) | (Some("学习领域"), Some("归档")) => VaultSection::Archive,
        (Some("工作领域"), Some("收集")) | (Some("学习领域"), Some("收集")) => VaultSection::Collect,
        (Some("工作领域"), Some("项目")) | (Some("学习领域"), Some("项目")) => VaultSection::Project,
        (Some("工作领域"), Some("资源")) | (Some("学习领域"), Some("资源")) => VaultSection::Resource,
        _ => VaultSection::None,
    }
}

/// Default publication rule derived from folder semantics only.
///
/// Business rules:
/// - Work/Project | Work/Archive => published
/// - Learn/Project | Learn/Archive => published
/// - Everything else => private
///
/// Important:
/// This is only the *default* publication state.
/// Frontmatter `published: true/false` overrides this.
pub fn default_is_published(vault_path: &str) -> bool {
    let area = detect_area(vault_path);
    let section = detect_section(vault_path);

    matches!(
        (area, section),
        (VaultArea::Work, VaultSection::Project)
            | (VaultArea::Work, VaultSection::Archive)
            | (VaultArea::Learn, VaultSection::Project)
            | (VaultArea::Learn, VaultSection::Archive)
    )
}

/// Map a section to its docs sub-folder name.
pub fn get_docs_sub_folder(vault_path: &str) -> String {
    match detect_section(vault_path) {
        VaultSection::Archive => "archives".to_string(),
        VaultSection::Collect => "collect".to_string(),
        VaultSection::Project => "projects".to_string(),
        VaultSection::Resource => "resources".to_string(),
        VaultSection::None => String::new(),
    }
}

/// Compute the final MDX destination path for a document.
///
/// Only call this after higher-level policy has decided the document should emit output.
pub fn get_dest_path_for_vault(config: &SyncConfig, vault_path: &str, slug: &str) -> PathBuf {
    match detect_area(vault_path) {
        VaultArea::Work => config.blog_dest.join(format!("{slug}.mdx")),
        VaultArea::Learn => {
            let sub = get_docs_sub_folder(vault_path);
            if sub.is_empty() {
                config.docs_dest.join(format!("{slug}.mdx"))
            } else {
                config.docs_dest.join(sub).join(format!("{slug}.mdx"))
            }
        }
        VaultArea::Inbox | VaultArea::Other => {
            config.notes_dest.join(format!("{slug}.mdx"))
        }
    }
}

/// Generate a stable slug from a relative vault path or link target.
///
/// - deterministic, lowercase, kebab-case
/// - slash/space/underscore → '-'
/// - repeated separators collapsed
/// - ".md" suffix removed
/// - Chinese characters preserved (Rust char::is_alphanumeric)
pub fn slugify_publish_path(input: &str) -> String {
    let normalized = normalize_vault_path(input);
    let without_ext = normalized.strip_suffix(".md").unwrap_or(&normalized);

    let mut out = String::with_capacity(without_ext.len());
    let mut last_was_dash = false;

    for ch in without_ext.chars() {
        let mapped = match ch {
            '/' | '\\' | ' ' | '_' => '-',
            c if c.is_alphanumeric() => {
                for lower in c.to_lowercase() {
                    out.push(lower);
                }
                last_was_dash = false;
                continue;
            }
            '-' => '-',
            _ => continue,
        };

        if mapped == '-' && !out.is_empty() && !last_was_dash {
            out.push('-');
            last_was_dash = true;
        }
    }

    out.trim_matches('-').to_string()
}

/// Normalize path separators and clean up for internal routing logic.
/// Guaranteed to use '/' separators, no redundant slashes, and trimmed whitespace.
pub fn normalize_vault_path(input: &str) -> String {
    let mut normalized = input.replace('\\', "/").trim().to_string();
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    normalized.strip_prefix('/').unwrap_or(&normalized).strip_suffix('/').unwrap_or(&normalized).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_vault_path() {
        assert_eq!(normalize_vault_path("Foo\\Bar.md"), "Foo/Bar.md");
        assert_eq!(normalize_vault_path("  Foo/Bar.md  "), "Foo/Bar.md");
        assert_eq!(normalize_vault_path("Foo//Bar///Baz.md"), "Foo/Bar/Baz.md");
        assert_eq!(normalize_vault_path("/Foo/Bar.md/"), "Foo/Bar.md");
    }

    #[test]
    fn test_slugify_publish_path() {
        assert_eq!(slugify_publish_path("Projects/My Super Secret.md"), "projects-my-super-secret");
        assert_eq!(slugify_publish_path("Ideas_And_Thoughts.md"), "ideas-and-thoughts");
        assert_eq!(slugify_publish_path("hello___world"), "hello-world");
        assert_eq!(slugify_publish_path("你好 世界.md"), "你好-世界");
        assert_eq!(slugify_publish_path(".hidden-file"), "hidden-file");
        assert_eq!(slugify_publish_path("a-b--c"), "a-b-c");
    }
}
