use sqlx::{Pool, Postgres, Row};
use crate::types::LinkInstance;


/// Batch resolves multiple link targets in a single DB query.
pub async fn resolve_targets_batch(
    pool: &Pool<Postgres>,
    targets: &[String],
    local_index: Option<&std::collections::HashMap<String, crate::types::MetadataExcerpt>>
) -> std::collections::HashMap<String, Option<crate::types::ResolvedLink>> {
    let mut result_map = std::collections::HashMap::new();
    if targets.is_empty() { return result_map; }
    
    // Clean targets (trim only, preserve case)
    let cleaned_targets: Vec<String> = targets.iter().map(|t| t.trim().trim_start_matches('/').to_string()).collect();
    
    // Exact filenames used for title/alias and basename lookups
    let filenames: Vec<String> = cleaned_targets.iter().map(|t| {
        if let Some(idx) = t.rfind('/') { &t[idx+1..] } else { t }
    }).map(|s| s.to_string()).collect();

    // Prepare search patterns for physical file matching (Priority 1)
    let mut vault_path_patterns = Vec::new();
    for f in &filenames {
        if f.contains('.') {
            vault_path_patterns.push(format!("%{}", f));
        } else {
            vault_path_patterns.push(format!("%{}.md", f));
            vault_path_patterns.push(format!("%{}.mdx", f));
        }
    }

    // Query for all matching documents at once.
    let rows = sqlx::query(
        r#"SELECT id, slug, title, area::text, aliases, "vaultPath" FROM documents d
            WHERE 
                d.title = ANY($1)
                OR d.slug = ANY($1)
                OR d.aliases @> ANY(SELECT jsonb_build_array(x) FROM unnest($1) t(x))
                OR EXISTS (
                    SELECT 1 FROM unnest($1) t 
                    WHERE d."vaultPath" ILIKE '%' || t || '.md'
                    OR d."vaultPath" ILIKE '%' || t || '.mdx'
                )"#
    )
    .bind(&filenames)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = rows {
        let candidates: Vec<_> = rows.into_iter().map(|row| {
            let id: String = row.get("id");
            let slug: String = row.get("slug");
            let area: String = row.get("area");
            let title: String = row.get("title");
            let vault_path: String = row.get("vaultPath");
            let aliases: serde_json::Value = row.get("aliases");
            let alias_list: Vec<String> = aliases.as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            
            (id, slug, area, title, alias_list, vault_path)
        }).collect();
        
        tracing::debug!("✅ [LinkResolver] Found {} candidate DB rows for targets: {:?}", candidates.len(), targets);

        for (idx, target) in targets.iter().enumerate() {
            let _cleaned = &cleaned_targets[idx];
            let fname = &filenames[idx];
            
            let mut best_match: Option<(i32, crate::types::ResolvedLink)> = None;

            for (id, slug, area, _title, _aliases, vault_path) in &candidates {
                let mut vault_basename = vault_path.split('/').last().unwrap_or("");
                if let Some(stripped) = vault_basename.strip_suffix(".md") {
                    vault_basename = stripped;
                } else if let Some(stripped) = vault_basename.strip_suffix(".mdx") {
                    vault_basename = stripped;
                }
                
                // --- Priority 1: Filename Match (Case Sensitive) ---
                if vault_basename == *fname {
                    best_match = Some((1, crate::types::ResolvedLink { target_id: Some(id.clone()), target_slug: Some(slug.clone()), target_area: Some(area.clone()) }));
                    break; 
                }
                
                // Note: Priority 2-4 (Title/Alias/Slug) are handled by the coarse DB query, 
                // but for simplicity we rely on DB being the source of truth if a row exists.
                if best_match.is_none() {
                     best_match = Some((4, crate::types::ResolvedLink { target_id: Some(id.clone()), target_slug: Some(slug.clone()), target_area: Some(area.clone()) }));
                }
            }

            // --- FINAL FALLBACK: Memory Map (Metadata Index) ---
            if best_match.is_none() {
                if let Some(idx_map) = local_index {
                    // Try to find the excerpt by VaultPath match or Filename/Title/Alias
                    for excerpt in idx_map.values() {
                        let mut vault_basename = excerpt.vault_path.split('/').last().unwrap_or("");
                        if let Some(stripped) = vault_basename.strip_suffix(".md") {
                            vault_basename = stripped;
                        }

                        // 🔍 Sophisticated Memory Resolution (Case Insensitive)
                        if vault_basename.to_lowercase() == fname.to_lowercase() || 
                           excerpt.title.to_lowercase() == fname.to_lowercase() || 
                           excerpt.aliases.iter().any(|a| a.to_lowercase() == fname.to_lowercase()) {
                             best_match = Some((5, crate::types::ResolvedLink { 
                                 target_id: Some(excerpt.id.clone()), 
                                 target_slug: Some(excerpt.slug.clone()), 
                                 target_area: Some(excerpt.area.as_db_str().to_string()) 
                             }));
                             tracing::debug!("🔭 [LinkResolver] Resolved via MEMORY: '{}' -> {}", target, excerpt.slug);
                             break;
                        }
                    }
                }
            }

            if let Some((_, resolved)) = best_match {
                result_map.insert(target.clone(), Some(resolved));
            } else {
                result_map.insert(target.clone(), None);
                tracing::debug!("⚠️ [LinkResolver] No match found for target '{}'", target);
            }
        }
    } else if let Err(e) = rows {
        tracing::error!("❌ [LinkResolver] Database query failed for targets {:?}: {}", targets, e);
        for target in targets {
            result_map.insert(target.clone(), None);
        }
    }

    // Ensure all requested targets have an entry (defaulting to None)
    for target in targets {
        result_map.entry(target.clone()).or_insert(None);
    }

    result_map
}

pub async fn persist_links(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    doc_id: &str,
    links: &[LinkInstance],
    doc_label: &str,
) -> Result<(), sqlx::Error> {
    // Clear old links for this document
    sqlx::query(r#"DELETE FROM document_links WHERE "fromId" = $1"#)
        .bind(doc_id)
        .execute(&mut **tx)
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
        
        b.push(format!("'{}'::\"TargetType\"", target_type))
         .push_bind(idx as i32)
         .push_bind(link.anchor.as_ref())
         .push_bind(link.attachment_url.as_ref());
    });

    // Create a savepoint before attempting the potentially failing batch insert.
    // This allows us to rollback the specific error state without aborting the entire document transaction.
    sqlx::query("SAVEPOINT links_insert_sp").execute(&mut **tx).await?;

    let result = builder.build().execute(&mut **tx).await;
    
    match result {
        Ok(_) => {
            // Release savepoint on success to free resources
            sqlx::query("RELEASE SAVEPOINT links_insert_sp").execute(&mut **tx).await?;
            Ok(())
        },
        Err(e) => {
            // 🛡️ [Race Condition Resilience]
            if let Some(db_err) = e.as_database_error() {
                if db_err.code().map(|c| c == "23503").unwrap_or(false) {
                    tracing::debug!("🛡️ Foreign key violation for links in document {}. Falling back to deferred resolution...", doc_label);
                    
                    // ⚠️ CRITICAL: We must rollback to the savepoint to clear the aborted transaction state
                    sqlx::query("ROLLBACK TO SAVEPOINT links_insert_sp").execute(&mut **tx).await?;

                    // Re-try without resolved IDs
                    let mut fallback_builder = sqlx::QueryBuilder::new(
                        r#"INSERT INTO document_links (
                            "id", "fromId", "rawTarget", "normalizedTarget", "resolvedDocumentId",
                            "anchor", "displayText", "isResolved", "type", "targetType", 
                            "sourceOrder", "targetFragmentRaw", "attachmentUrl"
                        ) "#
                    );
                    
                    fallback_builder.push_values(links.iter().enumerate(), |mut b, (idx, link)| {
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
                         .push_bind(None::<&str>) // 🎯 Fallback: skip direct DB reference
                         .push_bind(link.anchor.as_ref())
                         .push_bind(link.alias.as_ref())
                         .push_bind(false) // Not fully resolved anymore
                         .push_bind(link.kind.to_lowercase());
                        
                        b.push(format!("'{}'::\"TargetType\"", target_type))
                         .push_bind(idx as i32)
                         .push_bind(link.anchor.as_ref())
                         .push_bind(link.attachment_url.as_ref());
                    });
                    
                    return fallback_builder.build().execute(&mut **tx).await.map(|_| ());
                }
            }
            // If it's another error, rollback to savepoint anyway just to be safe, though 
            // the transaction is likely doomed.
            let _ = sqlx::query("ROLLBACK TO SAVEPOINT links_insert_sp").execute(&mut **tx).await;
            Err(e)
        }
    }
}
