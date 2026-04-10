use markdown_parser::parse_content_native;

#[test]
fn test_wikilinks_and_embeds() {
    let input = "Visit [[Page]] or [[Page|Label]]. Fragment: [[Page#^id]]. Embed: ![[Note]] and ![[Pasted image.png]].";
    let res = parse_content_native(input).unwrap();
    assert!(res.has_wiki_links);
    assert!(res.has_wiki_embeds);
    assert!(res.html.contains("wiki-link"));
    assert!(res.html.contains("wiki-embed"));
    assert!(res.html.contains("data-page=\"Page\""));
    assert!(res.html.contains("Label"));
    assert!(res.html.contains("data-fragment=\"^id\""));
    assert!(res.html.contains("data-embed-kind=\"note\""));
    assert!(res.html.contains("data-embed-kind=\"image\""));
}

#[test]
fn test_hashtags() {
    let input = "#tag1 #tag2/subtag #_tag3";
    let res = parse_content_native(input).unwrap();
    assert!(res.has_hashtags);
    assert!(res.html.contains("#tag1"));
    assert!(res.html.contains("#tag2/subtag"));
    assert!(res.html.contains("#_tag3"));
}

#[test]
fn test_callouts() {
    let input = "> [!note] My Title\n> My body content.";
    let res = parse_content_native(input).unwrap();
    assert!(res.html.contains("md-callout"));
    assert!(res.html.contains("My Title"));
    assert!(res.html.contains("My body content."));
}

#[test]
fn test_tasks() {
    let input = "- [ ] todo\n- [x] done\n- [/] progress\n- [>] forward\n- [!] important\n- [-] cancel\n- [?] question";
    let res = parse_content_native(input).unwrap();
    assert!(res.html.contains("obsidian-task"));
    assert!(res.html.contains("todo"));
    assert!(res.html.contains("done"));
    assert!(res.html.contains("in-progress"));
    assert!(res.html.contains("important"));
    assert!(res.html.contains("cancelled"));
    assert!(res.html.contains("question"));
}

#[test]
fn test_block_ids() {
    let input = "This is a block. ^block-id-1\n\n- list item ^item-id";
    let res = parse_content_native(input).unwrap();
    assert!(res.html.contains("id=\"block-id-1\""));
    assert!(res.html.contains("id=\"item-id\""));
}

#[test]
fn test_admonition_conversion() {
    let input = "```ad-info\ntitle: My Admonition\nMy content\n```";
    let res = parse_content_native(input).unwrap();
    // Should be converted to a native callout
    assert!(res.html.contains("md-callout"));
    assert!(res.html.contains("data-callout-type=\"info\""));
    assert!(res.html.contains("My Admonition"));
}

#[test]
fn test_chinese_hashtags() {
    let input = "#数学 #markdown/obsidian";
    let res = parse_content_native(input).unwrap();
    println!("DEBUG: CHINESE HASHTAGS HTML=\n{}", res.html);
    assert!(res.has_hashtags);
    assert!(res.html.contains("premium-tag"));
    assert!(res.html.contains("#数学"));
    assert!(res.html.contains("#markdown/obsidian"));
}
