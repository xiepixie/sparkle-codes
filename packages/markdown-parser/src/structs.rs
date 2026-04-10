use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct HeadingNode {
    pub id: String,
    pub text: String,
    pub level: i32,
}

#[derive(Serialize, Debug, Clone)]
pub struct SectionNode {
    pub heading_id: Option<String>,
    pub heading_text: String,
    pub heading_level: i32,
    pub section_index: i32,
    pub html: String,
    pub text_content: String,
    pub is_first_section: bool,
}

#[derive(Serialize, Debug, Clone)]
pub struct BlockNode {
    pub block_id: String,
    pub section_index: i32,
    pub html: String,
    pub text_content: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct WikiLink {
    pub raw_target: String,
    pub normalized_target: String,
    pub page: String,
    pub fragment: String,
    pub label: String,
    pub is_embed: bool,
}

#[derive(Serialize)]
pub struct ParseResult {
    pub html: String,
    pub hash: String,
    pub has_math: bool,
    pub has_code: bool,
    pub has_table: bool,
    pub has_wiki_links: bool,
    pub has_wiki_embeds: bool,
    pub has_hashtags: bool,
    pub links: Vec<WikiLink>,
    pub hashtags: Vec<String>,
    pub headings: Vec<HeadingNode>,
    pub sections: Vec<SectionNode>,
    pub blocks: Vec<BlockNode>,
}
