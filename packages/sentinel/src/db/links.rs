use sqlx::{Pool, Postgres, Row};
use crate::types::{ResolvedLink, LinkInstance};


/// Batch resolves multiple link targets in a single DB query.
pub async fn resolve_targets_batch(
    pool: &Pool<Postgres>,
    targets: &[String]
) -> std::collections::HashMap<String, Option<ResolvedLink>> {
    let mut result_map = std::collections::HashMap::new();
    if targets.is_empty() { return result_map; }
    
    // Normalize targets for search (slugify-style)
    let normalized_targets: Vec<String> = targets.iter().map(|t| t.trim_start_matches('/').to_lowercase()).collect();
    let filenames: Vec<String> = normalized_targets.iter().map(|t| {
        if let Some(idx) = t.rfind('/') { &t[idx+1..] } else { t }
    }).map(|s| s.to_string()).collect();

    // Query for all matching documents at once.
    // We check for slug matches, title matches, or alias matches.
    let rows = sqlx::query(
        r#"SELECT id, slug, title, area::text, aliases FROM documents 
           WHERE "slug" = ANY($1) 
           OR "title" = ANY($2)
           OR "aliases" ??| $2"#
    )
    .bind(&normalized_targets)
    .bind(&filenames)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = rows {
        // Build a list of all candidate documents
        let candidates: Vec<_> = rows.into_iter().map(|row| {
            let id: String = row.get("id");
            let slug: String = row.get("slug");
            let area: String = row.get("area");
            let title: String = row.get("title");
            let aliases: serde_json::Value = row.get("aliases");
            let alias_list: Vec<String> = aliases.as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            
            (id, slug, area, title, alias_list)
        }).collect();

        for (idx, target) in targets.iter().enumerate() {
            let norm = &normalized_targets[idx];
            let fname = &filenames[idx];
            
            let mut best_match: Option<(i32, ResolvedLink)> = None;

            for (id, slug, area, title, aliases) in &candidates {
                // Priority 1: Exact slug match
                if norm == slug {
                    best_match = Some((1, ResolvedLink {
                        target_id: Some(id.clone()),
                        target_slug: Some(slug.clone()),
                        target_area: Some(area.clone()),
                    }));
                    break; // Highest priority found
                }
                
                // Priority 2: Title match
                if fname == title {
                    if best_match.as_ref().map_or(true, |(p, _)| *p > 2) {
                        best_match = Some((2, ResolvedLink {
                            target_id: Some(id.clone()),
                            target_slug: Some(slug.clone()),
                            target_area: Some(area.clone()),
                        }));
                    }
                }
                
                // Priority 3: Alias match
                if aliases.iter().any(|a| a == fname) {
                    if best_match.as_ref().map_or(true, |(p, _)| *p > 3) {
                        best_match = Some((3, ResolvedLink {
                            target_id: Some(id.clone()),
                            target_slug: Some(slug.clone()),
                            target_area: Some(area.clone()),
                        }));
                    }
                }
            }

            
            if let Some((_, resolved)) = best_match {
                result_map.insert(target.clone(), Some(resolved));
            }
        }
    }

    
    // Ensure all requested targets have an entry (defaulting to None)
    for target in targets {
        result_map.entry(target.clone()).or_insert(None);
    }

    result_map
}

pub async fn persist_links(
    pool: &Pool<Postgres>,
    doc_id: &str,
    links: &[LinkInstance],
) -> Result<(), sqlx::Error> {
    // Clear old links for this document
    sqlx::query(r#"DELETE FROM document_links WHERE "fromId" = $1"#)
        .bind(doc_id)
        .execute(pool)
        .await?;

    if links.is_empty() { return Ok(()); }

    let mut builder = sqlx::QueryBuilder::new(
        r#"INSERT INTO document_links (
            "id", "fromId", "rawTarget", "normalizedTarget", "resolvedDocumentId",
            "anchor", "displayText", "isResolved", "type", "targetType", 
            "sourceOrder", "targetFragmentRaw", "attachmentUrl"
        ) "#
    );

    builder.push_values(links.iter().enumerate(), |mut b, (idx, link)| {
        let is_resolved = link.resolved.is_some();
        let target_type = if let Some(a) = &link.anchor {
            if a.starts_with('^') { "BLOCK" } else { "HEADING" }
        } else {
            "ARTICLE"
        };
        
        let normalized = link.resolved.as_ref()
            .and_then(|r| r.target_slug.clone())
            .unwrap_or_else(|| crate::utils::path::slugify_publish_path(&link.target));

        b.push_bind(cuid2::create_id())
         .push_bind(doc_id)
         .push_bind(&link.target)
         .push_bind(normalized)
         .push_bind(link.resolved.as_ref().and_then(|r| r.target_id.as_ref()))
         .push_bind(link.anchor.as_ref())
         .push_bind(link.alias.as_ref())
         .push_bind(is_resolved)
         .push_bind(link.kind.to_lowercase());
        
        // Complex expression for TargetType enum
        // We use format! since target_type is a trusted internal enum string ("BLOCK" | "HEADING" | "ARTICLE")
        b.push(format!("'{}'::\"TargetType\"", target_type))
         .push_bind(idx as i32)
         .push_bind(link.anchor.as_ref())
         .push_bind(link.attachment_url.as_ref());
    });

    builder.build().execute(pool).await?;
    Ok(())
}
