use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Semaphore;
use sqlx::{Pool, Postgres};
use tokio::fs;
use tokio::io::AsyncReadExt;
use sha2::Digest;
use chrono::{DateTime, Utc, NaiveDate, NaiveDateTime};
use tracing::{info, error, debug, warn};
use markdown_parser::parse_content_native;
use cuid2::cuid;
use walkdir::WalkDir;
use tokio::task::JoinSet;
use reqwest::Client as HttpClient;
use url::Url;
use std::sync::atomic::{AtomicBool, Ordering};
use unicode_normalization::UnicodeNormalization;

use crate::config::SyncConfig;
use crate::types::{FileContext, SyncAction, DocumentMetadata, LinkInstance, SectionMetadata, BlockMetadata, VaultArea, ChunkMetadata};
use crate::utils::{path, frontmatter, mdx};
use crate::db::{documents, links, sections};

pub struct SyncEngine {
    pub pool: Pool<Postgres>,
    pub config: Arc<SyncConfig>,
    pub semaphore: Arc<Semaphore>,
    pub r2_client: Arc<crate::utils::r2::R2Client>,
    pub http_client: HttpClient,
    pub work_area_updated: AtomicBool,
    /// Maps vault path to pre-scanned metadata (slug, title, aliases).
    /// Used for resolving links accurately during sync.
    pub metadata_index: Arc<tokio::sync::RwLock<std::collections::HashMap<String, crate::types::MetadataExcerpt>>>,
    pub rag_chunker: Arc<crate::rag::chunker::Chunker>,
    pub embed_client: Arc<crate::rag::embed::EmbedClient>,
    pub rag_semaphore: Arc<Semaphore>,
}

impl SyncEngine {
    pub fn new(pool: Pool<Postgres>, config: SyncConfig) -> Self {
        let config_arc = Arc::new(config);
        let r2_client = crate::utils::r2::R2Client::new(
            &config_arc.r2_account_id,
            &config_arc.r2_access_key_id,
            &config_arc.r2_secret_access_key,
            &config_arc.r2_bucket_name,
            &config_arc.r2_public_domain,
        );

        Self {
            pool,
            config: config_arc.clone(),
            semaphore: Arc::new(Semaphore::new(config_arc.pool_size as usize)),
            r2_client: Arc::new(r2_client),
            http_client: HttpClient::builder()
                .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Sentinel/1.0")
                .build()
                .unwrap_or_else(|_| HttpClient::new()),
            work_area_updated: AtomicBool::new(false),
            metadata_index: Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
            rag_chunker: Arc::new(crate::rag::chunker::Chunker::new()),
            embed_client: Arc::new(crate::rag::embed::EmbedClient::new(&config_arc)),
            rag_semaphore: Arc::new(Semaphore::new(4)), // Hardcoded 4-way concurrency for Ollama
        }
    }

    /// Full vault scan from config.vault_root.
    pub async fn initial_sync(self: Arc<Self>) {
        info!("🚀 [Lifecycle] Starting full vault synchronization...");

        let vault_root = self.config.vault_root.clone();
        if !vault_root.exists() {
            warn!("⚠️ Vault root does not exist: {}", vault_root.display());
            return;
        }

        // --- Pass 1: Crawl file paths ---
        let mut file_contexts = Vec::new();
        for entry in WalkDir::new(&vault_root).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
            if p.is_file() && (ext == "md" || ext == "mdx") {
                if let Ok(rel) = p.strip_prefix(&vault_root) {
                    let vault_path = rel.to_string_lossy().to_string();
                    let area = path::detect_area(&vault_path);
                    if self.config.should_ingest_to_db(&area) {
                        file_contexts.push(FileContext {
                            vault_path,
                            full_path: p.to_path_buf(),
                            content_hash: String::new(),
                            last_modified: DateTime::<Utc>::from(p.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
                        });
                    }
                }
            }
        }
        
        info!("📂 Discovered {} markdown files in vault.", file_contexts.len());

        // --- Pass 2: High-Speed Metadata Pre-scan (T1 Indexing) ---
        let meta_index = self.pre_scan_metadata(&file_contexts).await;
        {
            let mut global_index = self.metadata_index.write().await;
            let index_count = meta_index.len();
            *global_index = meta_index;
            info!("🧠 [Index] Metadata index built with {} keys.", index_count);
        }

        // --- Pass 3: Parallel Full Sync (T2 Enrichment) ---
        let start_time = std::time::Instant::now();
        let mut count = 0;
        let mut set = JoinSet::new();
        let mut found_paths = HashSet::new();
        
        for ctx in file_contexts {
            if found_paths.insert(ctx.vault_path.clone()) {
                let engine = Arc::clone(&self);
                set.spawn(async move {
                    let _permit = engine.semaphore.acquire().await.ok();
                    if let Err(e) = engine.execute_pipeline(&ctx.vault_path, &ctx.full_path).await {
                        error!("❌ Sync failed for {}: {}", ctx.vault_path, e);
                    }
                });
                count += 1;
            }
        }

        let mut processed = 0;
        while let Some(res) = set.join_next().await {
            processed += 1;
            if processed % 20 == 0 || processed == count {
                let percent = (processed as f32 / count as f32) * 100.0;
                info!("⏳ Progress: {:>3.0}% | {}/{} files synced", percent, processed, count);
            }
            if let Err(e) = res {
                error!("❌ JoinSet error: {}", e);
            }
        }

        let elapsed = start_time.elapsed();
        info!("✅ [Lifecycle] Full sync finished in {:?}: {} files synced.", elapsed, count);

        // --- Pass 4: Orphan Cleanup ---
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
                    info!("✅ [Cleanup] Removed {} orphaned records.", deleted_count);
                }
            }
            Err(e) => warn!("⚠️ [Cleanup] Failed to fetch vault paths: {}", e),
        }

        info!("✨ [Lifecycle] Initial sync completed successfully.");
        self.trigger_revalidation().await;
    }

    async fn pre_scan_metadata(&self, files: &[FileContext]) -> std::collections::HashMap<String, crate::types::MetadataExcerpt> {
        let mut index = std::collections::HashMap::new();
        let mut set = JoinSet::new();
        
        info!("🔭 [Index] Starting metadata pre-scan for {} files...", files.len());

        // 1. Batch fetch existing IDs to minimize DB roundtrips
        let all_paths: Vec<String> = files.iter().map(|f| f.vault_path.clone()).collect();
        let existing_ids = documents::get_ids_by_vault_paths(&self.pool, &all_paths)
            .await
            .unwrap_or_default();

        for file in files {
            let vault_path = file.vault_path.clone();
            let abs_path = file.full_path.clone();
            let area = path::detect_area(&vault_path);
            let semaphore = Arc::clone(&self.semaphore);
            
            // Determine ID: use existing from DB or pre-allocate a new one
            let id = existing_ids.get(&vault_path)
                .cloned()
                .unwrap_or_else(|| cuid());

            set.spawn(async move {
                let _permit = semaphore.acquire().await.ok();
                
                // Read 2KB chunk for frontmatter analysis
                match fs::File::open(&abs_path).await {
                    Ok(mut f) => {
                        let mut buffer = vec![0u8; 2048];
                        let bytes_read = f.read(&mut buffer).await.unwrap_or(0);
                        let content = String::from_utf8_lossy(&buffer[..bytes_read]);
                        
                        let fm = frontmatter::parse_frontmatter(&content);
                        let slug = fm.fields.get("slug")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| path::slugify_publish_path(&vault_path));
                            
                        let title = fm.fields.get("title")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| vault_path.split('/').last().unwrap_or(&vault_path).replace(".md", ""));
                            
                        let aliases = fm.fields.get("aliases")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                            .unwrap_or_default();

                        Some((vault_path, crate::types::MetadataExcerpt {
                            id,
                            vault_path: abs_path.to_string_lossy().to_string(),
                            slug,
                            title,
                            aliases,
                            area,
                        }))
                    }
                    Err(_) => None
                }
            });
        }

        while let Some(res) = set.join_next().await {
            if let Ok(Some((vault_path, excerpt))) = res {
                // 🛡️ [Three-Tier Memory Indexing]
                // 1. Full Vault Path (Canonical)
                index.insert(vault_path.to_lowercase(), excerpt.clone());
                
                // 2. Basename (Obsidian Native)
                let name = vault_path.split('/').last().unwrap_or(&vault_path).replace(".md", "").replace(".mdx", "");
                index.insert(name.nfc().collect::<String>().to_lowercase(), excerpt.clone());
                
                // 3. Slug (Logical)
                index.insert(excerpt.slug.to_lowercase(), excerpt.clone());
                
                // 4. Title (Display)
                index.insert(excerpt.title.to_lowercase(), excerpt.clone());
                
                // 5. Aliases
                for alias in &excerpt.aliases {
                    index.insert(alias.to_lowercase(), excerpt.clone());
                }
            }
        }
        index
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

    /// Deletes a document from the database and cleans up its generated MDX output.
    /// Note: This does NOT touch the source file in the Obsidian vault.
    pub async fn delete_file(&self, vault_path: &str) {
        let _permit = self.semaphore.acquire().await.ok();
        debug!("🗑️ Deleting database record for: {}", vault_path);

        match documents::delete_document(&self.pool, vault_path).await {
            Ok(Some((slug, _db_area))) => {
                info!("✅ Removed database entry: {} (path: {})", slug, vault_path);
                // Clean up generated MDX if this area emits it
                let area = path::detect_area(vault_path);
                if self.config.should_emit_mdx(&area) {
                    let dest = path::get_dest_path_for_vault(&self.config, vault_path, &slug);
                    if dest.exists() {
                        debug!("🗑️ Removing generated output: {:?}", dest);
                        let _ = tokio::fs::remove_file(dest).await;
                    }
                }
            },
            Ok(None) => debug!("Attempted to delete non-existent document: {}", vault_path),
            Err(e) => error!("❌ Failed to delete record {}: {}", vault_path, e),
        }
    }

    async fn execute_pipeline(&self, vault_path: &str, abs_path: &Path) -> anyhow::Result<()> {
        // 1. Domain Policy Check
        let area = crate::utils::path::detect_area(vault_path);
        if !self.config.should_ingest_to_db(&area) {
            info!("⏭️ Skipping (Policy): {} [Area: {:?}]", vault_path, area);
            return Ok(());
        }

        // info!("🔄 Syncing: {} [Area: {:?}]", vault_path, area);
        
        // --- 1. Identify Identity ---
        // Fetch ID from the pre-scan index. If missing (unlikely if pre-scan ran), fallback to a fresh CUID.
        let id = {
            let index = self.metadata_index.read().await;
            index.get(&vault_path.to_lowercase())
                .map(|e| e.id.clone())
                .unwrap_or_else(|| cuid())
        };

        // 2. Read and Context
        let (content, ctx) = match self.read_context(vault_path, abs_path).await {
            Ok(res) => res,
            Err(e) => {
                warn!("❌ Failed to read {}: {}", vault_path, e);
                return Ok(());
            }
        };

        // 3. Extract Metadata
        let (clean_body, mut meta) = match self.extract_metadata(id, &ctx, &content) {
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

        debug!("🔄 Processing: {} [{:?}]", vault_path, action);

        // 4. Parse & Resolve (Heavy lifting)
        let (html, links, sections, blocks) = match self.parse_and_resolve_document(&ctx, &clean_body, &mut meta).await {
            Ok(res) => res,
            Err(e) => {
                warn!("❌ Parse error for {}: {}", vault_path, e);
                return Ok(());
            }
        };

        // 5. RAG Processing (WORK area only)
        let mut chunks = Vec::new();
        if area == VaultArea::Work {
            debug!("🧠 Preparing RAG chunks for: {}", meta.slug);
            match self.process_rag_embedding(&meta, &sections).await {
                Ok(c) => chunks = c,
                Err(e) => {
                    error!("❌ RAG embedding failed for {}: {}. Tip: Ensure the model '{}' supports embeddings and Ollama version is up to date.", 
                        vault_path, e, self.config.embedding_model);
                }
            }
        }

        // 6. Database Persistence (Transactional)
        debug!("💾 Persisting: {} (Area: {})", meta.slug, meta.area.as_db_str());
        if let Err(e) = self.persist_sync(&ctx, &meta, &clean_body, &html, &links, &sections, &blocks, &chunks).await {
            error!("❌ Database persistence failed for {}: {}", vault_path, e);
            return Ok(());
        }

        // 7. Output Generation
        if self.config.should_emit_mdx(&area) {
            let mdx_source = crate::utils::transform::render_publishable_markdown(&clean_body, &links);
            if let Err(e) = self.publish_outputs(&ctx, &meta, &mdx_source).await {
                warn!("❌ Failed to publish outputs for {}: {}", vault_path, e);
            } else {
                debug!("✅ Published: {}", vault_path);
            }
        }
        
        Ok(())
    }

    pub async fn trigger_revalidation(&self) {
        // 🛡️ [Optimization] Only revalidate if WORK area content changed
        if !self.work_area_updated.swap(false, Ordering::SeqCst) {
            return;
        }

        let urls_str = match &self.config.revalidate_url {
            Some(u) => u,
            None => return,
        };

        let secret = self.config.revalidate_secret.as_deref().unwrap_or("");
        
        // 🚀 支持多环境刷新：支持以逗号分隔的多个 URL
        // 为什么这样做：用户希望本地同步后，测试环境和生产环境能同时更新。
        for url_raw in urls_str.split(',') {
            let url_trimmed = url_raw.trim();
            if url_trimmed.is_empty() { continue; }

            let mut target_url = match Url::parse(url_trimmed) {
                Ok(u) => u,
                Err(e) => {
                    error!("❌ Invalid REVALIDATE_URL [{}]: {}", url_trimmed, e);
                    continue;
                }
            };

            target_url.query_pairs_mut()
                .append_pair("tag", "posts")
                .append_pair("secret", secret);

            debug!("📡 Triggering cache revalidation: {}", target_url);

            match self.http_client.get(target_url).send().await {
                Ok(resp) => {
                    if resp.status().is_success() {
                        info!("⚡ Cache revalidated successfully for {}", url_trimmed);
                    } else {
                        warn!("⚠️ Cache revalidation for {} returned status: {}", url_trimmed, resp.status());
                    }
                }
                Err(e) => {
                    error!("❌ Failed to send revalidation request to {}: {}", url_trimmed, e);
                }
            }
        }
    }

    async fn read_context(&self, vault_path: &str, abs_path: &Path) -> anyhow::Result<(String, FileContext)> {
        let raw_content = fs::read_to_string(abs_path).await?;
        let content = raw_content.replace("\r\n", "\n");

        let hash = hex::encode(sha2::Sha256::digest(content.as_bytes()));
        let mtime = abs_path.metadata()?.modified()?;

        debug!("📄 File Read: {} [Hash: {}..., MTime: {:?}]", vault_path, &hash[..8], mtime);

        let ctx = FileContext {
            vault_path: vault_path.to_string(),
            full_path: abs_path.to_path_buf(),
            content_hash: hash,
            last_modified: DateTime::<Utc>::from(mtime),
        };
        Ok((content, ctx))
    }

    fn extract_metadata(&self, id: String, ctx: &FileContext, content: &str) -> anyhow::Result<(String, DocumentMetadata)> {
        let fm = frontmatter::parse_frontmatter(content);
        
        // Diagnostic: list discovered keys
        let keys: Vec<_> = fm.fields.keys().collect();
        debug!("📄 Metadata keys for {}: {:?}", ctx.vault_path, keys);

        let slug = fm.fields.get("slug")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| path::slugify_publish_path(&ctx.vault_path));

        let area = path::detect_area(&ctx.vault_path);
        let section = path::detect_section(&ctx.vault_path);

        let is_published = fm.fields.get("published")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| path::default_is_published(&ctx.vault_path));

        let parse_dt = |val: &serde_json::Value| -> Option<DateTime<Utc>> {
            let s_raw = if let Some(s) = val.as_str() {
                s.to_string()
            } else {
                val.to_string()
            };
            let s = s_raw.trim().trim_matches('"');
            
            DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.with_timezone(&Utc))
                .or_else(|| NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok().map(|dt| dt.and_utc()))
                .or_else(|| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok().map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc()))
        };

        let explicit_date = fm.fields.get("date").and_then(parse_dt);
        let explicit_updated = fm.fields.get("updated").and_then(parse_dt);

        let updated_at = explicit_updated
            .or(explicit_date)
            .unwrap_or(ctx.last_modified);

        let mut meta = DocumentMetadata {
            id,
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
            date: explicit_date,
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
            // 🏷️ Tag Stability: Sort and deduplicate
            meta.tags.sort();
            meta.tags.dedup();
        }

        Ok((fm.clean_body, meta))
    }

    async fn compute_sync_plan(&self, ctx: &FileContext, meta: &DocumentMetadata) -> anyhow::Result<SyncAction> {
        let db_info = documents::get_document_sync_info(&self.pool, &ctx.vault_path).await?;

        if let Some((db_hash, db_ver, slug)) = db_info {
            if db_hash == ctx.content_hash && db_ver == meta.parser_version {
                // 🛡️ [Dual-Gated Publication Logic]
                // We only expect a physical MDX file to exist if:
                // 1. The area is configured to emit MDX (e.g., LEARN area).
                // 2. AND the document is explicitly marked as published (meta.is_published).
                //
                // This prevents the "Infinite Regeneration Loop" where a non-published file 
                // (like a Resource note) would be flagged as "missing" by the plan,
                // but then skipped by the output generator.
                if !self.config.should_emit_mdx(&meta.area) || !meta.is_published {
                    debug!("⏩ [Plan] Skipped {} (Hash match: {})", slug, &db_hash[..8]);
                    return Ok(SyncAction::Skip);
                }
                
                let dest = path::get_dest_path_for_vault(&self.config, &ctx.vault_path, &meta.slug);
                if dest.exists() {
                    debug!("⏩ [Plan] Skipped {} (MDX exists & Hash match)", slug);
                    return Ok(SyncAction::Skip);
                }
                debug!("🔄 [Plan] Regenerating {} (MDX file missing, but required for published content)", slug);
            } else if db_hash == ctx.content_hash {
                debug!("🔄 [Plan] Re-syncing {} (Parser version mismatch: {} -> {})", slug, db_ver, meta.parser_version);
            } else {
                debug!("🔄 [Plan] Update needed for {}: Hash {} -> {}", slug, &db_hash[..8], &ctx.content_hash[..8]);
            }
            Ok(SyncAction::Update)
        } else {
            debug!("🆕 [Plan] Create new document: {}", ctx.vault_path);
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
        meta.tags.sort(); // Ensure stable order

        // 1. Resolve Links (Batch lookup)
        let unique_pages: Vec<String> = result.links.iter()
            .map(|l| l.page.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        let meta_index = self.metadata_index.read().await;
        let resolved_map = links::resolve_targets_batch(&self.pool, &unique_pages, Some(&meta_index)).await;

        let mut resolved_instances = Vec::with_capacity(result.links.len());
        for (idx, link) in result.links.into_iter().enumerate() {
            let kind = if link.is_embed { "EMBED" } else { "WIKI" };
            let target = link.raw_target.clone(); // Keep raw_target for HTML replacement matching
            let resolved = resolved_map.get(&link.page).cloned().flatten();

            let mut attachment_url = None;

            // Attachment resolution logic
            if kind == "EMBED" && is_attachment_target(&link.page) {
                if let Some(path) = self.find_attachment(&link.page) {
                    match self.r2_client.upload_attachment(&path).await {
                        Ok(url) => {
                            info!("☁️ Uploaded attachment: {} -> {}", link.page, url);
                            attachment_url = Some(url);
                        }
                        Err(e) => warn!("⚠️ Failed to upload attachment {}: {}", link.page, e),
                    }
                } else {
                    debug!("🔍 Attachment not found: {}", link.page);
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
        chunks: &[ChunkMetadata],
    ) -> anyhow::Result<()> {
        // 🎯 [Optimization] Mark for revalidation if this is a blog post (WORK area)
        if meta.area == VaultArea::Work {
            self.work_area_updated.store(true, Ordering::SeqCst);
        }

        let mut tx = self.pool.begin().await?;

        let doc_id = documents::upsert_document(&mut tx, ctx, meta, body, html_content).await?;

        links::persist_links(&mut tx, &doc_id, link_instances, &meta.slug).await?;
        sections::upsert_sections(&mut tx, &doc_id, sections).await?;
        sections::upsert_blocks(&mut tx, &doc_id, blocks).await?;
        
        // Always try to update chunks. 
        // If 'chunks' is empty (e.g. non-WORK area), this clears old data.
        crate::db::chunks::upsert_chunks(&mut tx, &doc_id, chunks).await?;

        tx.commit().await?;

        Ok(())
    }

    async fn publish_outputs(&self, ctx: &FileContext, meta: &DocumentMetadata, mdx_source: &str) -> anyhow::Result<()> {
        if self.config.should_emit_mdx(&meta.area) && meta.is_published {
            let dest = path::get_dest_path_for_vault(&self.config, &ctx.vault_path, &meta.slug);
            mdx::publish_mdx(&dest, meta, mdx_source).await?;
            
            // 🧪 [Verification] Confirm the file actually exists and log its absolute location
            if dest.exists() {
                debug!("🎯 [Verification] File confirmed at: {:?}", dest);
            } else {
                warn!("⚠️ [Verification] File written but CANNOT be verified at {:?}", dest);
            }
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

    /// Process specialized RAG embedding: chunking and vectorization.
    async fn process_rag_embedding(&self, meta: &DocumentMetadata, sections: &[SectionMetadata]) -> anyhow::Result<Vec<ChunkMetadata>> {
        // 1. Generate structural chunks from sections
        let mut all_chunks = Vec::new();
        for section in sections {
            let chunks = self.rag_chunker.chunk_section(&meta.title, section);
            all_chunks.extend(chunks);
        }

        if all_chunks.is_empty() {
            return Ok(Vec::new());
        }

        // 2. Parallel Embedding Phase
        let client = Arc::clone(&self.embed_client);
        let semaphore = Arc::clone(&self.rag_semaphore);
        let mut set = JoinSet::new();
        let batch_size = 16;
        
        debug!("🧠 [RAG] Vectorizing {} chunks for {}", all_chunks.len(), meta.slug);

        for (batch_idx, batch) in all_chunks.chunks(batch_size).enumerate() {
            let inputs: Vec<String> = batch.iter().map(|c| c.chunk_text.clone()).collect();
            let sem = Arc::clone(&semaphore);
            let c = Arc::clone(&client);
            
            set.spawn(async move {
                let _permit = sem.acquire().await.ok();
                c.embed_batch(inputs).await.map(|embeddings| (batch_idx, embeddings))
            });
        }

        let mut results = Vec::new();
        while let Some(res) = set.join_next().await {
            match res {
                Ok(Ok((idx, embeddings))) => results.push((idx, embeddings)),
                Ok(Err(e)) => return Err(anyhow::anyhow!("Embedding batch failed: {}", e)),
                Err(e) => return Err(anyhow::anyhow!("JoinSet error during embedding: {}", e)),
            }
        }

        // Reassemble embeddings in original order
        results.sort_by_key(|r| r.0);
        let mut final_embeddings = Vec::new();
        for (_, batch_embeddings) in results {
            final_embeddings.extend(batch_embeddings);
        }

        if final_embeddings.len() != all_chunks.len() {
            return Err(anyhow::anyhow!("Mismatch: chunks={} vs embeddings={}", all_chunks.len(), final_embeddings.len()));
        }

        for (i, embedding) in final_embeddings.into_iter().enumerate() {
            all_chunks[i].embedding = embedding;
        }

        Ok(all_chunks)
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
