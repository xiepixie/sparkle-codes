use markdown_parser::parse_content_native;

fn main() {
    let inputs = vec![
        "Inline: $E=mc^2$",
        "Block:\n$$\n\\frac{a}{b}\n$$",
    ];

    for input in inputs {
        println!("--- Input ---");
        println!("{}", input);
        match parse_content_native(input) {
            Ok(res) => {
                println!("--- HTML ---");
                println!("{}", res.html);
                println!("Has Math: {}", res.has_math);
            },
            Err(e) => println!("Error: {}", e),
        }
    }
}
