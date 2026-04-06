use markdown_parser::parse_content_native;

#[test]
fn test_math_bug_many() {
    let input = r#"
$0$
$1$
$2$
$3$
$4$
$5$
$6$
$7$
$8$
$9$
$10$
$11$
$12$
"#;

    let res = parse_content_native(input).unwrap();
    println!("{}", res.html);
}
