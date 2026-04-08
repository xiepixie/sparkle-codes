use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Semaphore;
use sqlx::{Pool, Postgres};
use tokio::fs;
use sha2::Digest;
use chrono::{DateTime, Utc};
use tracing::{info, error, debug, warn};
use markdown_parser::parse_content_native;
use cuid2::cuid;
use walkdir::WalkDir;
use tokio::task::JoinSet;

use crate::config::SyncConfig;
use crate::types::{FileContext, SyncAction, DocumentMetadata, LinkInstance, SectionMetadata, BlockMetadata};
use crate::utils::{path, frontmatter, mdx};
use crate::db::{documents, links, sections};

pub struct SyncEngine {
    pub pool: Pool<Postgres>,
    pub config: Arc<SyncConfig>,
    pub semaphore: Arc<Semaphore>,
    pub r2_client: Arc<crate::utils::r2::R2Client>,
}

impl SyncEngine {
    pub fn new(pool: Pool<Postgres>, config: SyncConfig) -> Self {
        let pool_size = config.pool_size;
        let r2_client = crate::utils::r2::R2Client::new(
            &config.r2_account_id,
            &config.r2_access_key_id,
            &config.r2_secret_access_key,
            &config.r2_bucket_name,
            &config.r2_public_domain,
        );

        Self {
            pool,
            config: Arc::new(config),
            semaphore: Arc::new(Semaphore::new(pool_size as usize)),
            r2_client: Arc::new(r2_client),
        }
    }

    /// Full vault scan from config.vault_root.
    pub async fn initial_sync(self: Arc<Self>) {
        info!("🚀 [Lifecycle] Starting full vault synchronization...");

        let vault_root = &self.config.vault_root;
        if !vault_root.exists() {
            warn!("⚠️ Vault root does not exist: {}", vault_root.display());
            return;
        }

        let mut count = 0;
        let mut set = JoinSet::new();
        let mut found_paths = HashSet::new();

        for entry in WalkDir::new(vault_root).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(rel) = p.strip_prefix(vault_root) {
                    let vault_path = rel.to_string_lossy().to_string();
                    found_paths.insert(vault_path.clone());
                    
                    let engine = Arc::clone(&self);
                    let abs_path = p.to_path_buf();

                    set.spawn(async move {
                        engine.sync_file(&vault_path, &abs_path).await;
                    });
                    count += 1;
                }
            }
        }
        info!("✅ Queued {} files from vault", count);
        
        // --- Attachment Sync ---
        let attachment_root = &self.config.attachment_root;
        if attachment_root.exists() {
            info!("📷 [Lifecycle] Starting attachment synchronization: {}", attachment_root.display());
            let mut asset_count = 0;
            for entry in WalkDir::new(attachment_root).into_iter().filter_map(|e| e.ok()) {
                let p = entry.path();
                if p.is_file() && is_attachment_target(p.to_str().unwrap_or("")) {
                    let engine = Arc::clone(&self);
                    let abs_path = p.to_path_buf();
                    set.spawn(async move {
                        engine.sync_attachment(&abs_path).await;
                    });
                    asset_count += 1;
                }
            }
            info!("✅ Queued {} attachments from extras", asset_count);
        } else {
            warn!("⚠️ Attachment root not found: {}", attachment_root.display());
        }

        info!("⏳ Waiting for all tasks to finish...");
        while let Some(res) = set.join_next().await {
            if let Err(e) = res {
                warn!("⚠️ Task panicked during sync: {}", e);
            }
        }

        // --- Cleanup Orphans ---
        info!("🔍 Checking for orphaned records in database...");
        match documents::list_all_vault_paths(&self.pool).await {
            Ok(db_paths) => {
                let mut deleted_count = 0;
                for vault_path in db_paths {
                    if !found_paths.contains(&vault_path) {
                        info!("🗑️ Orphan found: {}. Deleting...", vault_path);
                        self.delete_file(&vault_path).await;
                        deleted_count += 1;
                    }
                }
                if deleted_count > 0 {
                    info!("✅ Cleaned up {} orphaned records.", deleted_count);
                }
            }
            Err(e) => warn!("⚠️ Failed to fetch vault paths for cleanup: {}", e),
        }

        info!("✨ Initial sync completed successfully.");
    }

    /// Entry point for syncing a single file.
    pub async fn sync_file(&self, vault_path: &str, abs_path: &Path) {
        let area = path::detect_area(vault_path);

        // Early exit for non-ingested domains
        if !self.config.should_ingest_to_db(&area) {
            debug!("⏭️ Skipping non-ingested domain: {} ({})", vault_path, area);
            return;
        }

        let _permit = self.semaphore.acquire().await.ok();
        debug!("Processing file: {}", vault_path);

        if let Err(e) = self.execute_pipeline(vault_path, abs_path).await {
            error!("❌ Sync failed for {}: {}", vault_path, e);
        }
    }

    /// Entry point for syncing a single attachment.
    pub async fn sync_attachment(&self, abs_path: &Path) {
        let _permit = self.semaphore.acquire().await.ok();
        match self.r2_client.upload_attachment(abs_path).await {
            Ok(url) => {
                info!("☁️ Attachment ready: {} -> {}", abs_path.display(), url);
            }
            Err(e) => error!("❌ Failed to upload attachment {:?}: {}", abs_path, e),
        }
    }

    /// Deletes a file from the database and cleans up MDX output.
    pub async fn delete_file(&self, vault_path: &str) {
        let _permit = self.semaphore.acquire().await.ok();
        info!("🗑️ Deleting file: {}", vault_path);

        match documents::delete_document(&self.pool, vault_path).await {
            Ok(Some((slug, _db_area))) => {
                info!("✅ Deleted document: {} ({})", slug, vault_path);
                // Clean up generated MDX if this area emits it
                let area = path::detect_area(vault_path);
                if self.config.should_emit_mdx(&area) {
                    let dest = path::get_dest_path_for_vault(&self.config, vault_path, &slug);
                    if dest.exists() {
                        let _ = tokio::fs::remove_file(dest).await;
                    }
                }
            },
            Ok(None) => debug!("Attempted to delete non-existent document: {}", vault_path),
            Err(e) => error!("❌ Failed to delete document {}: {}", vault_path, e),
        }
    }

    async fn execute_pipeline(&self, vault_path: &str, abs_path: &Path) -> anyhow::Result<()> {
        // 1. Domain Policy Check
        let area = crate::utils::path::detect_area(vault_path);
        if !self.config.should_ingest_to_db(&area) {
            info!("⏭️ Skipping (Policy): {} [Area: {:?}]", vault_path, area);
            return Ok(());
        }

        info!("🔄 Syncing: {} [Area: {:?}]", vault_path, area);

        // 1. Read and Context
        let (content, ctx) = match self.read_context(vault_path, abs_path).await {
            Ok(res) => res,
            Err(e) => {
                warn!("❌ Failed to read {}: {}", vault_path, e);
                return Ok(());
            }
        };

        // 2. Extract Metadata
        let (clean_body, mut meta) = match self.extract_metadata(&ctx, &content) {
            Ok(res) => res,
            Err(e) => {
                warn!("❌ Failed to parse metadata for {}: {}", vault_path, e);
                return Ok(());
            }
        };

        // 3. Sync Plan
        let action = match self.compute_sync_plan(&ctx, &meta).await {
            Ok(a) => a,
            Err(e) => {
                warn!("❌ Failed to compute sync plan for {}: {}", vault_path, e);
                return Ok(());
            }
        };

        if action == SyncAction::Skip {
            debug!("⏩ Skipped: {}", vault_path);
            return Ok(());
        }

        info!("🔄 Syncing: {} [Action: {:?}]", vault_path, action);

        // 4. Parse & Resolve (Heavy lifting)
        let (html, links, sections, blocks) = match self.parse_and_resolve_document(&ctx, &clean_body, &mut meta).await {
            Ok(res) => res,
            Err(e) => {
                warn!("❌ Parse error for {}: {}", vault_path, e);
                return Ok(());
            }
        };

        // 5. Database Persistence
        if let Err(e) = self.persist_sync(&ctx, &meta, &clean_body, &html, &links, &sections, &blocks).await {
            error!("❌ Database persistence failed for {}: {}", vault_path, e);
            return Ok(());
        }

        // 6. Output Generation
        if self.config.should_emit_mdx(&area) {
            let mdx_source = crate::utils::transform::render_publishable_markdown(&clean_body, &links);
            if let Err(e) = self.publish_outputs(&ctx, &meta, &mdx_source).await {
                warn!("❌ Failed to publish outputs for {}: {}", vault_path, e);
            } else {
                info!("✅ Finished: {} -> {}/{}", vault_path, meta.area.as_db_str(), meta.slug);
            }
        }
        
        Ok(())

    }

    async fn read_context(&self, vault_path: &str, abs_path: &Path) -> anyhow::Result<(String, FileContext)> {
        let raw_content = fs::read_to_string(abs_path).await?;
        let content = raw_content.replace("\r\n", "\n");

        let hash = hex::encode(sha2::Sha256::digest(content.as_bytes()));
        let mtime = abs_path.metadata()?.modified()?;

        let ctx = FileContext {
            vault_path: vault_path.to_string(),
            full_path: abs_path.to_path_buf(),
            content_hash: hash,
            last_modified: DateTime::<Utc>::from(mtime),
        };
        Ok((content, ctx))
    }

    fn extract_metadata(&self, ctx: &FileContext, content: &str) -> anyhow::Result<(String, DocumentMetadata)> {
        let fm = frontmatter::parse_frontmatter(content);

        let slug = fm.fields.get("slug")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| path::slugify_publish_path(&ctx.vault_path));

        let area = path::detect_area(&ctx.vault_path);
        let section = path::detect_section(&ctx.vault_path);

        // Publication state: explicit frontmatter > folder-based default
        let is_published = fm.fields.get("published")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| path::default_is_published(&ctx.vault_path));

        // Prefer explicit 'updated' or 'date' from frontmatter, otherwise fallback to FS mtime.
        let updated_at = fm.fields.get("updated")
            .or_else(|| fm.fields.get("date"))
            .and_then(|v| v.as_str())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok().or_else(|| DateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok()))
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or(ctx.last_modified);

        let mut meta = DocumentMetadata {
            title: fm.fields.get("title")
                .and_then(|v| v.as_str())
                .unwrap_or_else(|| ctx.vault_path.split('/').last().unwrap_or("Untitled").trim_end_matches(".md"))
                .to_string(),
            slug,
            area,
            section,
            content_hash: ctx.content_hash.clone(),
            parser_version: self.config.parser_version.clone(),
            updated_at,
            aliases: vec![],
            tags: vec![],
            is_published,
        };

        if let Some(val) = fm.fields.get("aliases") {
            if let Some(arr) = val.as_array() {
                meta.aliases = arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect();
            } else if let Some(s) = val.as_str() {
                meta.aliases = s.split(',').map(|a| a.trim().to_string()).filter(|a| !a.is_empty()).collect();
            }
        }

        if let Some(val) = fm.fields.get("tags") {
            if let Some(arr) = val.as_array() {
                meta.tags = arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect();
            } else if let Some(s) = val.as_str() {
                meta.tags = s.split(',').map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();
            }
        }

        Ok((fm.clean_body, meta))
    }

    async fn compute_sync_plan(&self, ctx: &FileContext, meta: &DocumentMetadata) -> anyhow::Result<SyncAction> {
        let db_info = documents::get_document_sync_info(&self.pool, &ctx.vault_path).await?;

        if let Some((db_hash, db_ver, _)) = db_info {
            if db_hash == ctx.content_hash && db_ver == meta.parser_version {
                // Content unchanged — check if MDX output still needs generating
                if !self.config.should_emit_mdx(&meta.area) {
                    return Ok(SyncAction::Skip);
                }
                let dest = path::get_dest_path_for_vault(&self.config, &ctx.vault_path, &meta.slug);
                if dest.exists() {
                    return Ok(SyncAction::Skip);
                }
            }
            Ok(SyncAction::Update)
        } else {
            Ok(SyncAction::Create)
        }
    }

    async fn parse_and_resolve_document(&self, _ctx: &FileContext, clean_body: &str, meta: &mut DocumentMetadata) -> anyhow::Result<(String, Vec<LinkInstance>, Vec<SectionMetadata>, Vec<BlockMetadata>)> {
        // Pre-transform content: Strip Meta Bind and other Obsidian features not handled by parser
        let transformed_body = crate::utils::transform::transform_obsidian_to_mdx(clean_body);

        let result = parse_content_native(&transformed_body).map_err(|e| anyhow::anyhow!("Parse error: {}", e))?;

        // Merge hashtags
        let mut all_tags: std::collections::HashSet<String> = meta.tags.drain(..).collect();
        for t in result.hashtags {
            all_tags.insert(t.trim_start_matches('#').to_string());
        }
        meta.tags = all_tags.into_iter().collect();

        // 1. Resolve Links (Batch lookup)
        let unique_targets: Vec<String> = result.links.iter()
            .map(|l| l.raw_target.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        let resolved_map = links::resolve_targets_batch(&self.pool, &unique_targets).await;

        let mut resolved_instances = Vec::with_capacity(result.links.len());
        for (idx, link) in result.links.into_iter().enumerate() {
            let kind = if link.is_embed { "EMBED" } else { "WIKI" };
            let target = link.raw_target.clone();
            let resolved = resolved_map.get(&target).cloned().flatten();

            let mut attachment_url = None;

            // Attachment resolution logic
            if kind == "EMBED" && is_attachment_target(&target) {
                if let Some(path) = self.find_attachment(&target) {
                    match self.r2_client.upload_attachment(&path).await {
                        Ok(url) => {
                            info!("☁️ Uploaded attachment: {} -> {}", target, url);
                            attachment_url = Some(url);
                        }
                        Err(e) => warn!("⚠️ Failed to upload attachment {}: {}", target, e),
                    }
                } else {
                    debug!("🔍 Attachment not found: {}", target);
                }
            }

            resolved_instances.push(LinkInstance {
                kind: kind.to_string(),
                target,
                anchor: if !link.fragment.is_empty() { Some(link.fragment) } else { None },
                alias: if !link.label.is_empty() { Some(link.label) } else { None },
                resolved,
                attachment_url,
                source_order: idx as i32,
            });
        }

        // 2. Parse Sections
        let mut sections = Vec::with_capacity(result.sections.len());
        let mut section_index_to_id = std::collections::HashMap::new();

        for sec in result.sections {
            let sec_id = cuid();
            section_index_to_id.insert(sec.section_index, sec_id.clone());
            sections.push(SectionMetadata {
                id: sec_id,
                heading_id: sec.heading_id,
                heading_text: if sec.heading_text.is_empty() { meta.title.clone() } else { sec.heading_text },
                heading_level: if sec.heading_level == 0 { 1 } else { sec.heading_level },
                html: sec.html,
                text_content: sec.text_content,
                index: sec.section_index,
                is_first: sec.is_first_section,
            });
        }

        // 3. Parse Blocks
        let mut blocks = Vec::with_capacity(result.blocks.len());
        let mut section_block_counts = std::collections::HashMap::new();

        for blk in result.blocks {
            let fallback_section_id = sections.first().map(|s| s.id.clone()).unwrap_or_else(|| cuid());
            let section_id = section_index_to_id.get(&blk.section_index).cloned().unwrap_or(fallback_section_id);
            let index = section_block_counts.entry(blk.section_index).or_insert(0);
            
            blocks.push(BlockMetadata {
                id: cuid(),
                block_id: blk.block_id,
                section_id,
                html: blk.html,
                text_content: blk.text_content,
                index: *index,
            });
            *index += 1;
        }


        // 4. Resolve placeholders in HTML
        let resolved_html = crate::utils::transform::resolve_placeholders_in_html(&result.html, &resolved_instances);

        Ok((resolved_html, resolved_instances, sections, blocks))
    }

    async fn persist_sync(
        &self,
        ctx: &FileContext,
        meta: &DocumentMetadata,
        body: &str,
        html_content: &str,
        link_instances: &[LinkInstance],
        sections: &[SectionMetadata],
        blocks: &[BlockMetadata],
    ) -> anyhow::Result<()> {
        let doc_id = documents::upsert_document(&self.pool, ctx, meta, body, html_content).await?;

        links::persist_links(&self.pool, &doc_id, link_instances).await?;
        sections::upsert_sections(&self.pool, &doc_id, sections).await?;
        sections::upsert_blocks(&self.pool, &doc_id, blocks).await?;

        Ok(())
    }

    async fn publish_outputs(&self, ctx: &FileContext, meta: &DocumentMetadata, mdx_source: &str) -> anyhow::Result<()> {
        if self.config.should_emit_mdx(&meta.area) && meta.is_published {
            let dest = path::get_dest_path_for_vault(&self.config, &ctx.vault_path, &meta.slug);
            mdx::publish_mdx(&dest, meta, mdx_source).await?;
        }
        Ok(())
    }

    /// Recursively search for an attachment in config.attachment_root.
    /// Supports both filename-only and relative paths.
    fn find_attachment(&self, target: &str) -> Option<std::path::PathBuf> {
        let attachment_root = &self.config.attachment_root;
        if !attachment_root.exists() { return None; }

        // 1. Direct path check
        let direct = attachment_root.join(target);
        if direct.exists() && direct.is_file() {
            return Some(direct);
        }

        // 2. Filename-only search (Fall back to walkdir)
        let filename = if let Some(idx) = target.rfind('/') { &target[idx+1..] } else { target };

        for entry in WalkDir::new(attachment_root).into_iter().filter_map(|e| e.ok()) {
            if entry.file_name().to_string_lossy() == filename {
                return Some(entry.path().to_path_buf());
            }
        }

        None
    }
}

pub fn is_attachment_target(target: &str) -> bool {
    let t = target.to_lowercase();
    t.ends_with(".png") || t.ends_with(".jpg") || t.ends_with(".jpeg") || 
    t.ends_with(".gif") || t.ends_with(".webp") || t.ends_with(".svg") ||
    t.ends_with(".pdf") || t.ends_with(".mp4") || t.ends_with(".webm") ||
    t.ends_with(".ogv") || t.ends_with(".mp3") || t.ends_with(".wav") ||
    t.ends_with(".mov")
}
