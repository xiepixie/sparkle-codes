use std::path::Path;
use crate::types::DocumentMetadata;
use anyhow::Result;
use once_cell::sync::Lazy;
use regex::{Regex, Captures};

/// 识别需要受保护不进行 MDX 转义的区段
/// 优先级：代码块 > 数学块 > 占位符 > 行内代码 > 行内数学
static PROTECT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?x)
        (?P<fenced>(?m)^```[\s\S]*?^```$) |
        (?P<math_block>\$\$[\s\S]*?\$\$) |
        (?P<placeholder>__SENTINEL_METABIND_\$\[[\s\S]*?\]\$__) |
        (?P<inline_code>`+[^`\n]+`+) |
        (?P<inline_math>\$[^$\s(][^$\n]*?\$|(?m)\$[^$\s(][^$\n]+?\$(\s|$))
    ").unwrap()
});

/// 识别还原标记的正则
static RESTORE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"__MDX_PROTECTED_ID_(?P<id>\d+)__").unwrap()
});

/// 优雅降级获取标题
fn fallback_title(meta: &DocumentMetadata, dest: &Path) -> String {
    let raw = meta.title.trim();
    if !raw.is_empty() {
        return raw.to_string();
    }
    if !meta.slug.trim().is_empty() {
        return meta.slug.trim().to_string();
    }
    dest.file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Untitled")
        .to_string()
}

/// 将 Markdown 转换为安全的 MDX 文本，采用“提取-转义-还原”模式
pub fn apply_mdx_safety(content: &str) -> String {
    let mut protected_segments = Vec::new();

    // 阶段 1：提取受保护片段并占位
    let placeholder_text = PROTECT_RE.replace_all(content, |caps: &Captures| {
        let matched = caps.get(0).unwrap().as_str();
        let id = protected_segments.len();
        protected_segments.push(matched.to_string());
        format!("__MDX_PROTECTED_ID_{}__", id)
    });

    // 阶段 2：对剩余内容进行 MDX 安全字符转义 (HTML Entities)
    let mut escaped = String::with_capacity(placeholder_text.len());
    for c in placeholder_text.chars() {
        match c {
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '{' => escaped.push_str("&#123;"),
            '}' => escaped.push_str("&#125;"),
            _ => escaped.push(c),
        }
    }

    // 阶段 3：还原受保护片段，将其中的占位符替换回原始代码/数学公式
    let result = RESTORE_RE.replace_all(&escaped, |caps: &Captures| {
        let id_str = caps.name("id").unwrap().as_str();
        if let Ok(id) = id_str.parse::<usize>() {
            if let Some(original) = protected_segments.get(id) {
                return original.clone();
            }
        }
        caps.get(0).unwrap().as_str().to_string()
    });

    result.to_string()
}

/// 发布 MDX 文件，包含原子写入逻辑和格式化 Frontmatter
pub async fn publish_mdx(
    dest: &Path,
    meta: &DocumentMetadata,
    mdx_source: &str,
) -> Result<()> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let title = fallback_title(meta, dest);
    let date_iso = meta.updated_at.to_rfc3339();

    // 手动构建 YAML 以避免日期被解析器误认为是 Date 对象
    let mut yaml = String::new();
    yaml.push_str(&format!("title: {:?}\n", title));
    yaml.push_str(&format!("slug: {:?}\n", meta.slug));
    yaml.push_str(&format!("area: {}\n", meta.area.as_db_str()));
    yaml.push_str(&format!("date: \"{}\"\n", date_iso));
    yaml.push_str(&format!("updatedAt: \"{}\"\n", date_iso));
    yaml.push_str(&format!("published: {}\n", meta.is_published));
    
    if !meta.tags.is_empty() {
        yaml.push_str("tags:\n");
        for tag in &meta.tags {
            yaml.push_str(&format!("  - {:?}\n", tag));
        }
    }

    let mut final_output = String::new();
    final_output.push_str("---\n");
    final_output.push_str(&yaml);
    final_output.push_str("---\n\n");
    final_output.push_str(&apply_mdx_safety(mdx_source));

    // 原子写入：先写临时文件再重命名
    let tmp_dest = dest.with_extension("tmp");
    tokio::fs::write(&tmp_dest, final_output).await?;
    tokio::fs::rename(&tmp_dest, dest).await?;
    
    Ok(())
}
