use crate::utils::regex::{CODE_TAG_RE, TABLE_TAG_RE};

pub fn render_markdown_html(input: &str) -> Result<String, String> {
    let options = markdown::Options {
        parse: markdown::ParseOptions {
            constructs: markdown::Constructs {
                math_text: false,
                math_flow: false,
                frontmatter: false,
                gfm_task_list_item: false,
                ..markdown::Constructs::gfm()
            },
            ..markdown::ParseOptions::gfm()
        },
        compile: markdown::CompileOptions {
            allow_dangerous_html: true,
            allow_dangerous_protocol: true,
            ..markdown::CompileOptions::gfm()
        },
    };

    markdown::to_html_with_options(input, &options)
        .map_err(|e| format!("Parse error: {}", e))
}

pub fn has_table(html: &str) -> bool {
    TABLE_TAG_RE.is_match(html)
}

pub fn has_code(html: &str) -> bool {
    CODE_TAG_RE.is_match(html)
}
