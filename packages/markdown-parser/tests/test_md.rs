use markdown::{to_html_with_options, Options, ParseOptions, CompileOptions, Constructs};

#[test]
fn test_md() {
    let content = "SPARKLE_MATH_PLACEHOLDER_7X（要求基座 SPARKLE_MATH_PLACEHOLDER_8X）";
    let options = Options {
        parse: ParseOptions {
            constructs: Constructs {
                math_text: false,
                math_flow: false,
                frontmatter: false,
                ..Constructs::gfm()
            },
            ..ParseOptions::gfm()
        },
        compile: CompileOptions {
            allow_dangerous_html: true, 
            allow_dangerous_protocol: true, 
            ..CompileOptions::gfm()
        },
    };
    let html = to_html_with_options(content, &options).unwrap();
    println!("HTML: {}", html);
}
