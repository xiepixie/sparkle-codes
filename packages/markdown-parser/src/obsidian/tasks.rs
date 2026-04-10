use crate::protocol::constants::{
    CLASS_TASK_LIST_ITEM, TASK_BOOKMARK, TASK_CANCELLED, TASK_COMPLETED, TASK_CUSTOM, TASK_FORWARD,
    TASK_IMPORTANT, TASK_INCOMPLETE, TASK_IN_PROGRESS, TASK_LOCATION, TASK_QUESTION, TASK_STAR,
};
use crate::utils::regex::OBSIDIAN_TASK_RE;

pub fn transform_extended_tasks(html: &str) -> String {
    OBSIDIAN_TASK_RE.replace_all(html, |caps: &regex::Captures| {
        let marker = &caps[1];
        let task_type = match marker {
            ">" | "&gt;" => TASK_FORWARD,
            "!" => TASK_IMPORTANT,
            "-" => TASK_CANCELLED,
            "/" => TASK_IN_PROGRESS,
            "?" => TASK_QUESTION,
            "*" => TASK_STAR,
            "l" => TASK_LOCATION,
            "b" => TASK_BOOKMARK,
            "x" | "X" => TASK_COMPLETED,
            " " => TASK_INCOMPLETE,
            _ => TASK_CUSTOM,
        };

        format!(
            r#"<li class="{}" data-task="{}">"#,
            CLASS_TASK_LIST_ITEM,
            task_type
        )
    }).to_string()
}
