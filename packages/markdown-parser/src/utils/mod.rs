pub mod escape;
pub mod hash;
pub mod html;
pub mod regex;
pub mod segmenter;

pub use escape::{escape_html_attr, escape_html_text};
pub use hash::simple_hash;
pub use html::parse_tag;
pub use segmenter::split_by_code_blocks;
