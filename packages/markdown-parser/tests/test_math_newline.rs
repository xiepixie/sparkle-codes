use markdown_parser::parse_content_native;

#[test]
fn test_newline() {
    let input = "$$\n\\begin{bmatrix}\na & b \\\\\nc & d\n\\end{bmatrix}\n$$";
    let res = parse_content_native(input).unwrap();
    println!("{}", res.html);
}
