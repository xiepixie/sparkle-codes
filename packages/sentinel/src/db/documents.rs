use sqlx::{Pool, Postgres, Row};
use crate::types::{DocumentMetadata, FileContext};
use chrono::Utc;

pub async fn get_document_sync_info(pool: &Pool<Postgres>, vault_path: &str) -> Result<Option<(String, String, String)>, sqlx::Error> {
    let row = sqlx::query(
        r#"SELECT "contentHash", "parserVersion", "slug" FROM documents WHERE "vaultPath" = $1"#
    )
    .bind(vault_path)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| (
        r.get::<String, _>("contentHash"),
        r.get::<String, _>("parserVersion"),
        r.get::<String, _>("slug"),
    )))
}

pub async fn upsert_document(
    pool: &Pool<Postgres>,
    ctx: &FileContext,
    meta: &DocumentMetadata,
    clean_body: &str,
    html_content: &str,
) -> Result<String, sqlx::Error> {
    let now = Utc::now();
    let row = sqlx::query(
        r#"
        INSERT INTO documents (
            "id", "title", "slug", "vaultPath", "area", "content", "html",
            "contentHash", "parserVersion", "aliases", "metadata", "updatedAt", "publishedAt", "lastSyncedAt", "isPublished"
        )
        VALUES ($1, $2, $3, $4, CAST($5 AS "Area"), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT ("vaultPath") DO UPDATE SET
            "title" = EXCLUDED."title",
            "slug" = EXCLUDED."slug",
            "area" = EXCLUDED."area",
            "content" = EXCLUDED."content",
            "html" = EXCLUDED."html",
            "contentHash" = EXCLUDED."contentHash",
            "parserVersion" = EXCLUDED."parserVersion",
            "aliases" = EXCLUDED."aliases",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = EXCLUDED."updatedAt",
            "publishedAt" = EXCLUDED."publishedAt",
            "lastSyncedAt" = EXCLUDED."lastSyncedAt",
            "isPublished" = EXCLUDED."isPublished"
        RETURNING id
        "#
    )
    .bind(cuid2::create_id())
    .bind(&meta.title)
    .bind(&meta.slug)
    .bind(&ctx.vault_path)
    .bind(meta.area.as_db_str())
    .bind(clean_body)
    .bind(html_content)
    .bind(&ctx.content_hash)
    .bind(&meta.parser_version)
    .bind(serde_json::to_value(&meta.aliases).unwrap_or_default())
    .bind(serde_json::json!({ 
        "tags": meta.tags, 
        "date": meta.date.map(|d| d.to_rfc3339()) 
    }))
    .bind(meta.updated_at)
    .bind(meta.date)
    .bind(now)
    .bind(meta.is_published)
    .fetch_one(pool)
    .await?;

    Ok(row.get("id"))
}

pub async fn delete_document(pool: &Pool<Postgres>, vault_path: &str) -> Result<Option<(String, String)>, sqlx::Error> {
    let row = sqlx::query(
        r#"DELETE FROM documents WHERE "vaultPath" = $1 RETURNING "slug", "area"::text"#
    )
    .bind(vault_path)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| (r.get("slug"), r.get::<String, _>("area"))))
}

pub async fn list_all_vault_paths(pool: &Pool<Postgres>) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query(r#"SELECT "vaultPath" FROM documents"#)
        .fetch_all(pool)
        .await?;
    
    Ok(rows.into_iter().map(|r| r.get("vaultPath")).collect())
}
