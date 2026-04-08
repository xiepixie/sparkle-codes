use sqlx::{Pool, Postgres};
use crate::types::{SectionMetadata, BlockMetadata};

pub async fn upsert_sections(
    pool: &Pool<Postgres>,
    doc_id: &str,
    sections: &[SectionMetadata],
) -> Result<(), sqlx::Error> {
    // Clear old sections (FK will cascade to blocks)
    sqlx::query(r#"DELETE FROM document_sections WHERE "documentId" = $1"#)
        .bind(doc_id)
        .execute(pool)
        .await?;

    if sections.is_empty() { return Ok(()); }

    let mut builder = sqlx::QueryBuilder::new(
        r#"INSERT INTO document_sections ("id", "documentId", "headingId", "headingText", "headingLevel", "sectionIndex", "html", "textContent", "isFirstSection") "#
    );

    builder.push_values(sections.iter(), |mut b, sec| {
        b.push_bind(&sec.id)
         .push_bind(doc_id)
         .push_bind(&sec.heading_id)
         .push_bind(&sec.heading_text)
         .push_bind(sec.heading_level)
         .push_bind(sec.index)
         .push_bind(&sec.html)
         .push_bind(&sec.text_content)
         .push_bind(sec.is_first);
    });

    builder.build().execute(pool).await?;
    Ok(())
}

pub async fn upsert_blocks(
    pool: &Pool<Postgres>,
    doc_id: &str,
    blocks: &[BlockMetadata],
) -> Result<(), sqlx::Error> {
    if blocks.is_empty() { return Ok(()); }

    let mut builder = sqlx::QueryBuilder::new(
        r#"INSERT INTO document_blocks ("id", "documentId", "blockId", "sectionId", "html", "blockIndex", "textContent") "#
    );

    builder.push_values(blocks, |mut b, block| {
        b.push_bind(&block.id)
         .push_bind(doc_id)
         .push_bind(&block.block_id)
         .push_bind(&block.section_id)
         .push_bind(&block.html)
         .push_bind(block.index)
         .push_bind(&block.text_content);
    });

    builder.build().execute(pool).await?;
    Ok(())
}
