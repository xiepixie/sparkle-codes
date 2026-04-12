use sqlx::QueryBuilder;
use crate::types::ChunkMetadata;

/// Persist chunks to the database.
/// 
/// This function first clears any existing chunks for the given document
/// and then performs a bulk insert of the new chunks.
pub async fn upsert_chunks(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    doc_id: &str,
    chunks: &[ChunkMetadata],
) -> Result<(), sqlx::Error> {
    // 1. Clear existing chunks for this document
    sqlx::query(r#"DELETE FROM document_chunks WHERE "documentId" = $1"#)
        .bind(doc_id)
        .execute(&mut **tx)
        .await?;

    if chunks.is_empty() {
        return Ok(());
    }

    // 2. Perform bulk insert
    // Note: The 'embedding' column in Neon is halfvec.
    // We bind it as a string and EXPLICITLY cast to ::halfvec in the SQL
    // to avoid "expression is of type text" errors.
    let mut builder = QueryBuilder::new(
        r#"INSERT INTO document_chunks ("id", "documentId", "chunkIndex", "headingPath", "headingId", "chunkText", "embedding", "tokenCount", "hasCode") "#
    );

    builder.push(" VALUES ");

    for (i, chunk) in chunks.iter().enumerate() {
        if i > 0 {
            builder.push(", ");
        }

        let embedding_str = format!(
            "[{}]",
            chunk.embedding
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<String>>()
                .join(",")
        );

        builder.push("(");
        
        // Finalize the first part of the row
        {
            let mut separated = builder.separated(", ");
            separated.push_bind(&chunk.id);
            separated.push_bind(doc_id);
            separated.push_bind(chunk.index);
            separated.push_bind(&chunk.heading_path);
            separated.push_bind(&chunk.heading_id);
            separated.push_bind(&chunk.chunk_text);
            separated.push_bind(embedding_str);
        }
        
        // Add the cast explicitly to the LAST placeholder added (embedding)
        builder.push("::halfvec, "); 

        {
            let mut separated = builder.separated(", ");
            separated.push_bind(chunk.token_count);
            separated.push_bind(chunk.has_code);
        }
        
        builder.push(")");
    }

    // Execute the bulk insert
    builder.build().execute(&mut **tx).await?;

    // 3. Update searchVector (Postgres FTS)
    // We update it in a separate pass to ensure all chunks are present.
    // 'simple' dictionary is used to match technical content/code patterns.
    sqlx::query(
        r#"
        UPDATE document_chunks 
        SET "searchVector" = to_tsvector('simple', "chunkText")
        WHERE "documentId" = $1
        "#
    )
    .bind(doc_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}
