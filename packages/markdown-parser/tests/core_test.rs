use markdown_parser::parse_content_native;

#[test]
fn test_gfm_basics() {
    let input = "# Header\n\n**Bold** ~Delete~\n\n- List\n\n| H1 | H2 |\n| --- | --- |\n| C1 | C2 |";
    let res = parse_content_native(input).unwrap();
    assert!(res.html.contains("Header"));
    assert!(res.html.contains("<strong>Bold</strong>"));
    assert!(res.html.contains("<del>Delete</del>"));
    assert!(res.html.contains("<table>"));
    assert!(res.has_table);
}

#[test]
fn test_heading_slugs() {
    let input = "## My Awesome Title! (v1.0)";
    let res = parse_content_native(input).unwrap();
    assert!(res.html.contains("id=\"h-my-awesome-title-v10\"") || res.html.contains("id=\"h-my-awesome-title-v1-0\""));
}

#[test]
fn test_html_safety_escaping() {
    let input = r#"<div class="test" data-attr="a > b">Content</div>"#;
    let res = parse_content_native(input).unwrap();
    assert!(res.html.contains("<div class=\"test\" data-attr=\"a > b\">Content</div>"));
}

#[test]
fn test_multiline_callout_body() {
    let input = "> [!note]\n> line 1\n> line 2\n>\n> line 3";
    let res = parse_content_native(input).unwrap();
    assert!(res.html.contains("line 1"));
    assert!(res.html.contains("line 2"));
    assert!(res.html.contains("line 3"));
}
