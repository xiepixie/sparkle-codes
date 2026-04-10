pub mod structs;
pub mod utils;
pub mod core;
pub mod obsidian;
pub mod renderers;
pub mod protocol;
pub mod extract;

pub use structs::{HeadingNode, SectionNode, BlockNode, WikiLink, ParseResult};
use utils::hash::simple_hash;
use core::markdown::render_markdown_html;
use renderers::math::{extract_math, reinject_math, MathStore};
use obsidian::{
    blocks::inject_block_ids,
    callouts::{convert_admonition_blocks, transform_callouts},
    highlights::transform_highlights,
    inline::process_inline_entities,
    tasks::transform_extended_tasks,
};
use protocol::anchors::inject_heading_ids;
use extract::structure::extract_structural_nodes;

const MAX_INPUT_SIZE: usize = 512_000;
static ESCAPED_HASH_PLACEHOLDER: &str = "__SPARKLE_ESCAPED_HASH__";

pub fn parse_content_native(input: &str) -> Result<ParseResult, String> {
    if input.len() > MAX_INPUT_SIZE {
        return Err(format!(
            "Content too large ({} bytes). Maximum allowed: {} bytes.",
            input.len(),
            MAX_INPUT_SIZE
        ));
    }

    // Phase 1: Pre-processing
    let input = convert_admonition_blocks(input);

    // Phase 2: Math Extraction
    let mut math_store = MathStore::default();
    let input = extract_math(&input, &mut math_store);

    // Phase 3: Escape protected sequences
    let input = input.replace("\\#", ESCAPED_HASH_PLACEHOLDER);

    // Phase 4: Core Markdown Rendering
    let html = render_markdown_html(&input)?;

    // Phase 5: Pipeline Transformations
    let html = inject_block_ids(&html);
    let html = transform_highlights(&html);
    let html = inject_heading_ids(&html);
    let html = transform_extended_tasks(&html);
    let html = transform_callouts(&html);

    // Phase 6: Inline Entities (Wiki-links, Hashtags)
    let inline_result = process_inline_entities(&html);

    // Phase 7: Post-processing
    let mut html = reinject_math(&inline_result.html, &math_store);
    
    // Split <p> tags wrapping block math elements
    let p_tag_re = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?s)(<p\b[^>]*>)(.*?)</p>"#).unwrap()
    });
    let block_math_inner_re = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?s)(<div class="[^"]*math-block[^"]*"[^>]*></div>)"#).unwrap()
    });
    
    html = p_tag_re.replace_all(&html, |caps: &regex::Captures| {
        let open_tag = &caps[1];
        let inner = &caps[2];
        if inner.contains("math-block") {
            let replaced = block_math_inner_re.replace_all(inner, |m: &regex::Captures| {
                format!("</p>\n{}\n{}", &m[1], open_tag)
            });
            format!("{}{}</p>", open_tag, replaced)
        } else {
            caps[0].to_string()
        }
    }).to_string();

    // Clean up empty paragraphs logically created by the split
    let empty_p_re = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?s)<p\b[^>]*>\s*</p>"#).unwrap()
    });
    html = empty_p_re.replace_all(&html, "").to_string();

    html = html.replace(
        ESCAPED_HASH_PLACEHOLDER,
        r#"<span class="not-a-tag">#</span>"#,
    );

    // Phase 8: Metadata & Structural Extraction
    let has_math = !math_store.is_empty();
    let has_code = renderers::code::has_code(&html);
    let has_table = core::markdown::has_table(&html);
    let hash = simple_hash(&html);

    let (headings, sections, blocks) = extract_structural_nodes(&html);

    Ok(ParseResult {
        html,
        hash,
        has_math,
        has_code,
        has_table,
        has_wiki_links: inline_result.has_wiki_links,
        has_wiki_embeds: inline_result.has_wiki_embeds,
        has_hashtags: inline_result.has_hashtags,
        links: inline_result.links,
        hashtags: inline_result.hashtags,
        headings,
        sections,
        blocks,
    })
}
