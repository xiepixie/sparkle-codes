use markdown_parser::parse_content_native;

#[test]
fn test_escape() {
    let input = r#"I spent \$10 and \$20"#;
    let res = parse_content_native(input).unwrap();
    println!("{}", res.html);
}
