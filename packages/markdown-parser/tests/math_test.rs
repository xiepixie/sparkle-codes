use markdown_parser::parse_content_native;

#[test]
fn test_math_inline_and_block() {
    let input = r#"
Inline: $E=mc^2$
Block:
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
"#;
    let res = parse_content_native(input).unwrap();
    assert!(res.has_math);
    assert!(res.html.contains("math-inline"));
    assert!(res.html.contains("math-block"));
    assert!(res.html.contains("mc^2"));
}

#[test]
fn test_math_escaping() {
    // Escaped dollar signs should NOT be treated as math
    let input = r#"I have \$100 and \$200 dollars."#;
    let res = parse_content_native(input).unwrap();
    assert!(!res.has_math);
    assert!(res.html.contains("$100"));
    assert!(res.html.contains("$200"));
}

#[test]
fn test_math_in_table() {
    let input = r#"
| Definition | Math |
| :--- | :--- |
| Domain | $(-\infty,-1)\cup(0,+\infty)$ |
| Value | $y=e$ |
"#;
    let res = parse_content_native(input).unwrap();
    assert!(res.has_math);
    assert!(res.html.contains("math-inline"));
    assert!(res.html.contains("\\cup"));
}

#[test]
fn test_math_with_newlines() {
    let input = "$$\n\\begin{aligned}\na &= b \\\\\nc &= d\n\\end{aligned}\n$$";
    let res = parse_content_native(input).unwrap();
    assert!(res.has_math);
    assert!(res.html.contains("math-block"));
    assert!(res.html.contains("aligned"));
}

#[test]
fn test_math_many_placeholders() {
    // Stress test for O(N) placeholder reinjection
    let mut input = String::new();
    for i in 0..100 {
        input.push_str(&format!("Formula {}: ${}$\n", i, i));
    }
    let res = parse_content_native(&input).unwrap();
    assert!(res.has_math);
    for i in 0..100 {
        assert!(res.html.contains(&format!("data-tex=\"{}\"", i)));
    }
}

#[test]
fn test_math_nested_in_other_blocks() {
    let input = "> [!note]\n> Inside callout: $x^2 + y^2 = r^2$\n> And block:\n> $$\n> z = x + iy\n> $$";
    let res = parse_content_native(input).unwrap();
    assert!(res.has_math);
    assert!(res.html.contains("data-tex=\"x^2 + y^2 = r^2\""));
}
