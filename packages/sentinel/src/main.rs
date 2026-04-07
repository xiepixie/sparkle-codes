use anyhow::Result;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use sqlx::postgres::PgPoolOptions;
use std::env;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::fs;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tracing::{info, error, warn, debug};
use sha2::{Sha256, Digest};
use yaml_rust2::YamlLoader;
use cuid2::cuid;
use once_cell::sync::Lazy;

use chrono::TimeZone;
use regex::Regex;
use markdown_parser;

const PARSER_VERSION: &str = "v1.2.6"; // Bumped for performance optimizations and batch inserts

// ── Static regexes for prepare_shared_body (P0: eliminate per-call compilation) ──
static RE_META_BIND: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^```meta-bind-embed\n(?P<content>[\s\S]*?)```").unwrap()
});
static RE_ADMONITION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?m)^```ad-(?P<type>\w+)\n(?P<content>[\s\S]*?)```").unwrap()
});
static RE_EMBED: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"!(?:\[\[(?P<target>[^|\]]+)(?:\|(?P<title>[^\]]+))?\]\])").unwrap()
});
static RE_WIKI: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[\[(?P<target>[^|\]]+)(?:\|(?P<title>[^\]]+))?\]\]").unwrap()
});

/// Typed startup config — eliminates repeated env::var() in hot paths (P1).
#[derive(Clone)]
struct SyncConfig {
    blog_dest: String,
    docs_dest: String,
    notes_dest: String,
    r2_public_url: String,
    obsidian_attachment_path: Option<String>,
    pool_size: u32,
}

impl SyncConfig {
    fn from_env() -> Self {
        let pool_size: u32 = env::var("SENTINEL_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);

        let mut r2 = env::var("R2_PUBLIC_URL").unwrap_or_else(|_| "/obsidian-assets".to_string());
        if !r2.starts_with("http") && !r2.starts_with('/') {
            r2 = format!("https://{}", r2);
        }
        let r2 = r2.trim_end_matches('/').to_string();

        Self {
            blog_dest: env::var("SYNC_BLOG_DEST")
                .unwrap_or_else(|_| "apps/web/content/blog".to_string()),
            docs_dest: env::var("SYNC_DOCS_DEST")
                .unwrap_or_else(|_| "apps/docs/content/docs".to_string()),
            notes_dest: env::var("SYNC_NOTES_DEST")
                .unwrap_or_else(|_| "apps/web/content/notes".to_string()),
            r2_public_url: r2,
            obsidian_attachment_path: env::var("OBSIDIAN_ATTACHMENT_PATH").ok(),
            pool_size,
        }
    }

    fn dest_for_area(&self, area: &str) -> &str {
        match area {
            "WORK" => &self.blog_dest,
            "LEARN" => &self.docs_dest,
            _ => &self.notes_dest,
        }
    }
}

/// Extracted helper: detect PARA area from vault path.
fn detect_area(vault_path: &str) -> &'static str {
    if vault_path.contains("工作领域") { "WORK" }
    else if vault_path.contains("学习领域") { "LEARN" }
    else { "OTHER" }
}

/// Extracted helper: compute physical MDX destination path.
fn get_dest_path_for_vault(config: &SyncConfig, vault_path: &str, slug: &str) -> PathBuf {
    let area = detect_area(vault_path);
    let dest_base = config.dest_for_area(area);
    let sub_folder = get_sub_folder(vault_path, area);
    Path::new(dest_base).join(sub_folder).join(format!("{}.mdx", slug))
}


#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    
    info!("🚀 Sentinel binary starting up...");
    
    // ✅ Robust search for .env.local in parent directories
    let mut curr = env::current_dir()?;
    loop {
        let env_path = curr.join(".env.local");
        if env_path.exists() {
            if let Err(e) = dotenvy::from_path(&env_path) {
                warn!("⚠️  Failed to parse {}: {}", env_path.display(), e);
            }
            info!("✅ Loaded config from: {}", env_path.display());
            break;
        }
        if !curr.pop() { break; }
    }
    dotenvy::dotenv().ok(); // Fallback for standard .env

    // ── Config & Pool (P1: typed startup config) ──
    let config = SyncConfig::from_env();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(config.pool_size)
        .connect(&db_url)
        .await?;
    
    info!("🚀 Sentinel active: Connected to Neon Knowledge Brain (Pool: {}).", config.pool_size);

    let mut watch_paths = env::args().skip(1).collect::<Vec<String>>();
    if watch_paths.is_empty() {
        watch_paths = env::var("OBSIDIAN_SOURCE_PATHS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<String>>();
    }

    // P1: Semaphore aligned to pool_size * 2 instead of hardcoded 32
    let concurrency_limit = Arc::new(Semaphore::new((config.pool_size * 2) as usize));
    let config = Arc::new(config);

    for path_str in &watch_paths {
        let path = Path::new(path_str);
        if !path.exists() {
            warn!("⚠️  Watch path does not exist: {}", path_str);
            continue;
        }
        
        info!("👀 Monitoring Knowledge Source: {}", path_str);
        
        if let Err(e) = initial_sync(&pool, path, concurrency_limit.clone(), config.clone()).await {
            error!("❌ Initial sync failed for {}: {}", path.display(), e);
        }
    }

    let (tx, mut rx) = tokio::sync::mpsc::channel(100);
    
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                for event in events {
                    if tx.try_send(event.path).is_err() {
                        eprintln!("⚠️  Event channel full, dropping event");
                    }
                }
            }
        },
    )?;

    for path_str in &watch_paths {
        debouncer.watcher().watch(Path::new(path_str), RecursiveMode::Recursive)?;
    }

    info!("🛑 Press Ctrl-C to initiate graceful shutdown.");

    let mut active_tasks = JoinSet::new();

    loop {
        tokio::select! {
            Some(path) = rx.recv() => {
                if path.extension().and_then(|s| s.to_str()) == Some("md") {
                    debug!("📝 Debounced event triggered for: {:?}", path);
                    // Find the watch_root for this path
                    if let Some(root_str) = watch_paths.iter().find(|r| path.starts_with(r)) {
                        let pool = pool.clone();
                        let watch_root = PathBuf::from(root_str);
                        let limit = concurrency_limit.clone();
                        let cfg = config.clone();
                        
                        active_tasks.spawn(async move {
                            let _permit = limit.acquire_owned().await.ok();
                            if let Err(e) = sync_file(&pool, &watch_root, &path, &cfg).await {
                                error!("❌ Sync error for {:?}: {}", path, e);
                            }
                        });
                    }
                }
            }
            // Cleanup finished tasks to free memory
            Some(res) = active_tasks.join_next(), if !active_tasks.is_empty() => {
                if let Err(e) = res {
                    error!("❌ background task panicked: {}", e);
                }
            }
            _ = tokio::signal::ctrl_c() => {
                info!("🛑 Graceful shutdown initiated. Waiting for active sync tasks...");
                active_tasks.shutdown().await;
                break;
            }
        }
    }

    info!("💤 Closing database connections...");
    pool.close().await;
    info!("Sentinel slept peacefully.");

    Ok(())
}


async fn initial_sync(pool: &sqlx::PgPool, root: &Path, limit: Arc<Semaphore>, config: Arc<SyncConfig>) -> Result<()> {
    let root_buf = root.to_path_buf();
    let files: Vec<PathBuf> = tokio::task::spawn_blocking(move || {
        walkdir::WalkDir::new(&root_buf)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file() && e.path().extension().and_then(|s| s.to_str()) == Some("md"))
            .map(|e| e.path().to_path_buf())
            .collect()
    })
    .await?;

    info!("🔍 Discovered {} knowledge nodes in Obsidian Vault.", files.len());

    let mut set = JoinSet::new();
    let watch_root = root.to_path_buf();

    for path in files {
        let pool = pool.clone();
        let limit = limit.clone();
        let watch_root = watch_root.clone();
        let config = config.clone();

        set.spawn(async move {
            let _permit = limit.acquire_owned().await.ok();
            sync_file(&pool, &watch_root, &path, &config).await
        });
        
        // Don't spawn too many futures at once if the number of files is massive (thousands)
        if set.len() > 100 {
            if let Some(res) = set.join_next().await {
                if let Err(e) = res? {
                    error!("❌ Concurrent sync error: {}", e);
                }
            }
        }
    }

    while let Some(res) = set.join_next().await {
        if let Err(e) = res? {
            error!("❌ Final sync cleanup error: {}", e);
        }
    }
    
    Ok(())
}


async fn sync_file(pool: &sqlx::PgPool, watch_root: &Path, path: &Path, config: &SyncConfig) -> Result<()> {
    let relative_path = path.strip_prefix(watch_root).unwrap_or(path);
    let vault_path = relative_path.to_string_lossy().to_string(); // Identity Anchor
    
    // --- DELETION HANDLER ---
    if !path.exists() {
        info!("🗑️  Detected deletion: {}", vault_path);
        
        let mut tx = pool.begin().await?;

        // 1. Database Cleanup
        // B10: Get slug from DB to match original insert; B13: Links auto-cascade
        let row: Option<(String, String, String, String)> = sqlx::query_as(
            r#"DELETE FROM documents WHERE "vaultPath" = $1 RETURNING id, area::text, slug, "vaultPath""#
        )
        .bind(&vault_path)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some((_doc_id, _area_str, db_slug, db_vault_path)) = row {
            tx.commit().await?;

            // Physical File Cleanup (using DB data for consistency)
            let dest_path = get_dest_path_for_vault(config, &db_vault_path, &db_slug);
            if dest_path.exists() {
                fs::remove_file(dest_path).await?;
                info!("🗑️  Deleted physical MDX: {}", vault_path);
            }
        } else {
            tx.rollback().await?;
        }
        
        return Ok(());
    }

    let content = match fs::read_to_string(path).await {
        Ok(c) => c,
        Err(e) => {
            debug!("Skipped: File moved or locked {:?}: {}", path, e);
            return Ok(());
        }
    };
    
    // P2: Normalize line endings before hash and parse
    let content = content.replace("\r\n", "\n");
    
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let content_hash = hex::encode(hasher.finalize());

    let existing: Option<(String, String, String, String)> = sqlx::query_as(
        r#"SELECT "contentHash", "parserVersion", "slug", "area"::text FROM documents WHERE "vaultPath" = $1"#
    )
    .bind(&vault_path)
    .fetch_optional(pool)
    .await?;

    let mut parser_needs_run = true;
    let mut old_mdx_to_cleanup: Option<PathBuf> = None;

    if let Some((existing_hash, existing_version, old_slug, _)) = &existing {
        let expected_path = get_dest_path_for_vault(config, &vault_path, old_slug);
        
        // Check if physical MDX exists - If missing, we MUST re-run even if hash matches
        if existing_hash == &content_hash && existing_version == PARSER_VERSION && expected_path.exists() {
            debug!("⏩ Skipped (Unchanged & MDX Exists): {}", vault_path);
            parser_needs_run = false;
        } else {
            debug!("🔄 Resyncing: {} (Hash mismatch or physical file missing at {:?})", vault_path, expected_path);
        }
    } else {
        info!("🆕 New knowledge node found: {}", vault_path);
    }

    let mut title = vault_path.replace(".md", "");
    let mut slug = vault_path.replace(".md", "").replace('/', "-").replace('\\', "-").to_lowercase();
    let mut description: Option<String> = None;
    let mut is_published = true;
    let mut aliases: Vec<String> = Vec::new();
    let mut tags: Vec<String> = Vec::new();
    let mut date: String = "pending".to_string();

    // B4: Efficiently split frontmatter
    let (fm_raw, body) = if content.starts_with("---\n") {
        if let Some(end) = (&content[4..]).find("---\n") {
            (Some(&content[4..end+4]), &content[end+8..])
        } else {
            (None, content.as_str())
        }
    } else {
        (None, content.as_str())
    };

    if let Some(yaml_str) = fm_raw {
        if let Ok(docs) = YamlLoader::load_from_str(yaml_str) {
            if !docs.is_empty() {
                let doc = &docs[0];
                if let Some(t) = doc["title"].as_str() { title = t.to_string(); }
                if let Some(s) = doc["slug"].as_str() { slug = s.to_string(); }
                if let Some(d) = doc["description"].as_str() { description = Some(d.to_string()); }
                if let Some(p) = doc["published"].as_bool() { is_published = p; }
                if let Some(a_arr) = doc["aliases"].as_vec() {
                    for a in a_arr {
                        if let Some(a_str) = a.as_str() { aliases.push(a_str.to_string()); }
                    }
                }
                if let Some(t_arr) = doc["tags"].as_vec() {
                    for t in t_arr {
                        if let Some(t_str) = t.as_str() { 
                            let tag = t_str.trim_start_matches('#').to_lowercase();
                            if !tag.is_empty() { tags.push(tag); }
                        }
                    }
                }
                if let Some(d_str) = doc["date"].as_str() { date = d_str.to_string(); }
            }
        }
    }

    let (created_iso, modified_iso) = {
        let meta = fs::metadata(path).await?;
        let c = meta.created().unwrap_or(meta.modified().unwrap());
        let m = meta.modified().unwrap();
        (
            chrono::DateTime::<chrono::Utc>::from(c).to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
            chrono::DateTime::<chrono::Utc>::from(m).to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        )
    };

    if date == "pending" { date = created_iso.clone(); }
    let updated_at = modified_iso;
    
    // B8: Robust slugifier
    let default_slug = {
        let base = vault_path.replace(".md", "");
        let mut s = String::new();
        let mut last_was_hyphen = false;
        for c in base.chars() {
            if c.is_alphanumeric() {
                s.push(c.to_ascii_lowercase());
                last_was_hyphen = false;
            } else if !last_was_hyphen {
                if !s.is_empty() && !last_was_hyphen {
                    s.push('-');
                    last_was_hyphen = true;
                }
            }
        }
        s.trim_matches('-').to_string()
    };
    
    if slug == vault_path.replace(".md", "").replace('/', "-").replace('\\', "-").to_lowercase() {
        slug = default_slug;
    }

    let area = detect_area(&vault_path);
    let is_inbox = vault_path.contains("0-收集箱") || vault_path.contains("/收集/");
    let is_life = vault_path.contains("生活领域");

    if let Some((_, _, old_slug, _)) = &existing {
        let current_dest = get_dest_path_for_vault(config, &vault_path, &slug);
        let old_dest = get_dest_path_for_vault(config, &vault_path, old_slug);

        if current_dest != old_dest {
            if old_dest.exists() {
                old_mdx_to_cleanup = Some(old_dest);
            }
            parser_needs_run = true;
        }

        // --- TRANSITION HELPER: Clean up legacy root files for LEARN area ---
        if area == "LEARN" {
            let legacy_root_path = Path::new(&config.docs_dest).join(format!("{}.mdx", slug));
            if legacy_root_path.exists() && legacy_root_path != current_dest {
                let _ = fs::remove_file(&legacy_root_path).await;
                info!("🧹 Cleaned legacy root MDX: {}", vault_path);
            }
        }
    }

    if !parser_needs_run && old_mdx_to_cleanup.is_none() {
        return Ok(());
    }

    if is_inbox || is_life {
        is_published = false;
    }

    info!("🔄 Syncing file: {}", vault_path);

    let res = match markdown_parser::parse_content_native(body) {
        Ok(r) => r,
        Err(e) => {
            error!("Parse error for {}: {}", vault_path, e);
            return Ok(());
        }
    };

    let shared_body = prepare_shared_body(body, config);

    debug!("✅ Parsed content for: {}", vault_path);
    
    // Merge inline hashtags with frontmatter tags (case-insensitive for indexing)
    for tag in res.hashtags {
        let tag_lower = tag.to_lowercase();
        if !tags.contains(&tag_lower) {
            tags.push(tag_lower);
        }
    }
    // Ensure tags are sorted and unique for consistency
    tags.sort();
    tags.dedup();

    let mut tx = pool.begin().await?;
    info!("📑 Transaction started for: {}", vault_path);

    let id = cuid();
    let source_type = "OBSIDIAN";
    let metadata = serde_json::json!({ "tags": tags });

    let parse_date = |d: &str| -> chrono::DateTime<chrono::Utc> {
        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(d) {
            return dt.with_timezone(&chrono::Utc);
        }
        if let Ok(nd) = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            let ndt = nd.and_hms_opt(0, 0, 0).unwrap();
            return chrono::Utc.from_utc_datetime(&ndt);
        }
            if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(d, "%Y-%m-%d %H:%M:%S") {
            return chrono::Utc.from_utc_datetime(&ndt);
        }
        chrono::Utc::now()
    };

    let (row,): (String,) = sqlx::query_as(
        r#"
        INSERT INTO documents (
            "id", "vaultPath", "slug", "title", "description", "aliases",
            "content", "html", "contentHash", "parserVersion", 
            "area", "sourceType", "isPublished", "metadata", "createdAt", "updatedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CAST($11 AS "Area"), CAST($12 AS "SourceType"), $13, $14, $15, $16)
        ON CONFLICT ("vaultPath") DO UPDATE SET
            "slug" = EXCLUDED."slug",
            "title" = EXCLUDED."title",
            "description" = EXCLUDED."description",
            "aliases" = EXCLUDED."aliases",
            "content" = EXCLUDED."content",
            "html" = EXCLUDED."html",
            "contentHash" = EXCLUDED."contentHash",
            "parserVersion" = EXCLUDED."parserVersion",
            "area" = EXCLUDED."area",
            "isPublished" = EXCLUDED."isPublished",
            "metadata" = EXCLUDED."metadata",
            "updatedAt" = EXCLUDED."updatedAt"
        RETURNING id
        "#
    )
    .bind(&id)
    .bind(&vault_path)
    .bind(&slug)
    .bind(&title)
    .bind(&description)
    .bind(serde_json::to_value(&aliases).unwrap_or(serde_json::json!([])))
    .bind(&shared_body)
    .bind(&res.html)
    .bind(&content_hash)
    .bind(PARSER_VERSION)
    .bind(area)
    .bind(source_type)
    .bind(is_published)
    .bind(&metadata)
    .bind(parse_date(&date))
    .bind(parse_date(&updated_at))
    .fetch_one(&mut *tx)
    .await?;

    let final_id = row;

    let assets_to_sync: Vec<String> = res.links.iter()
        .filter(|l| l.is_embed)
        .filter(|l| {
            let p = l.raw_target.to_lowercase();
            p.ends_with(".png") || p.ends_with(".jpg") || 
            p.ends_with(".jpeg") || p.ends_with(".webp") ||
            p.ends_with(".svg") || p.ends_with(".gif")
        })
        .map(|l| l.raw_target.clone())
        .collect();

    // 1. Delete old links
    sqlx::query(r#"DELETE FROM document_links WHERE "fromId" = $1"#)
        .bind(&final_id)
        .execute(&mut *tx)
        .await?;

    // 2. P1: Batch insert links in a single multi-row INSERT
    if !res.links.is_empty() {
        let mut builder: sqlx::QueryBuilder<sqlx::Postgres> = sqlx::QueryBuilder::new(
            r#"INSERT INTO document_links (
                "id", "fromId", "rawTarget", "normalizedTarget",
                "anchor", "displayText", "isResolved", "type"
            ) "#,
        );

        builder.push_values(&res.links, |mut b, link| {
            let anchor: Option<&str> = if link.fragment.is_empty() { None } else { Some(&link.fragment) };
            let display_text: Option<&str> = if link.label.is_empty() { None } else { Some(&link.label) };
            let link_type = if link.is_embed { "embed" } else { "wiki" };

            b.push_bind(cuid())
                .push_bind(final_id.clone())
                .push_bind(link.raw_target.clone())
                .push_bind(link.normalized_target.clone())
                .push_bind(anchor.map(|s| s.to_string()))
                .push_bind(display_text.map(|s| s.to_string()))
                .push_bind(false)
                .push_bind(link_type.to_string());
        });

        builder.build().execute(&mut *tx).await?;
    }

    tx.commit().await?;

    if let Some(old_path) = old_mdx_to_cleanup {
        let _ = fs::remove_file(old_path).await;
        info!("🗑️  Cleaned up moved/renamed MDX: {}", vault_path);
    }

    if is_published {
        if area != "WORK" {
            if let Err(e) = generate_mdx(
                config,
                &vault_path, 
                &slug, 
                area, 
                &shared_body, 
                &title, 
                description.as_deref(), 
                &date, 
                &updated_at, 
                &tags,
                is_published
            ).await {
                error!("❌ MDX generation error for {}: {}", vault_path, e);
            } else {
                let sub_folder = get_sub_folder(&vault_path, area);
                let display_area = if sub_folder.is_empty() { area.to_string() } else { format!("{}/{}", area, sub_folder) };
                info!("✨ Synced [{}]: {}", display_area, title);
            }
        } else {
            info!("✨ Synced [{}]: {} (Database Only)", area, title);
        }
        for asset in &assets_to_sync {
            if let Err(e) = sync_asset(config, asset).await {
                warn!("⚠️  Asset sync warning for {}: {}", asset, e);
            }
        }
    } else {
        let dest_path = get_dest_path_for_vault(config, &vault_path, &slug);
        if dest_path.exists() {
            let _ = fs::remove_file(dest_path).await;
            info!("🔒 Unpublished: {} (Physical MDX removed)", vault_path);
        }
    }

    Ok(())
}


fn get_sub_folder(vault_path: &str, area: &str) -> String {
    if area == "LEARN" || area == "OTHER" {
        if vault_path.contains("项目") {
            "projects".to_string()
        } else if vault_path.contains("资源") {
            "resources".to_string()
        } else if vault_path.contains("杂项") {
            "misc".to_string()
        } else {
            "misc".to_string()
        }
    } else {
        "".to_string()
    }
}

fn prepare_shared_body(content: &str, config: &SyncConfig) -> String {
    let mut intermediate = content.to_string();

    intermediate = RE_META_BIND.replace_all(&intermediate, |caps: &regex::Captures| {
        format!("> (Embedded Content: Use Obsidian to edit)\n\n{}", &caps["content"].trim_end())
    }).to_string();

    intermediate = RE_ADMONITION.replace_all(&intermediate, |caps: &regex::Captures| {
        let raw_type = caps["type"].to_lowercase();
        let callout_type = match raw_type.as_str() {
            "note" | "abstract" | "summary" | "tldr" | "info" | "todo" => "NOTE",
            "tip" | "hint" | "help" | "check" | "done" => "TIP",
            "warning" | "caution" | "attention" => "WARNING",
            "danger" | "error" | "fail" | "missing" => "CAUTION",
            "important" | "quote" | "cite" => "IMPORTANT",
            _ => "NOTE", // Default to NOTE for safety
        };
        
        let content = &caps["content"];
        let mut result = format!("> [!{}] \n", callout_type);
        for line in content.lines() {
            result.push_str("> ");
            result.push_str(line);
            result.push('\n');
        }
        result
    }).to_string();

    // P1: Use config r2 url
    let r2_base = &config.r2_public_url;
    
    intermediate = RE_EMBED.replace_all(&intermediate, |caps: &regex::Captures| {
        let target = &caps["target"];
        let title = caps.name("title").map_or(target, |m| m.as_str());
        let encoded_target = urlencoding::encode(target);
        format!("![{}]({}/{})", title, r2_base, encoded_target)
    }).to_string();

    intermediate = RE_WIKI.replace_all(&intermediate, |caps: &regex::Captures| {
        let target = &caps["target"];
        let title = caps.name("title").map_or(target, |m| m.as_str());
        format!("[{}]({})", title, target)
    }).to_string();

    intermediate
}


fn apply_mdx_safety(content: &str) -> String {
    let mut result = String::new();
    let mut in_code_block = false;
    let mut in_math_block = false;

    for line in content.lines() {
        let trimmed = line.trim();
        
        if !in_code_block && !in_math_block {
            if trimmed.starts_with("```") {
                in_code_block = true;
                if trimmed.len() > 3 && trimmed[3..].contains("```") {
                    in_code_block = false;
                }
                result.push_str(line);
                result.push('\n');
                continue;
            }
            if trimmed.starts_with("$$") {
                in_math_block = true;
                if trimmed.len() > 2 && trimmed[2..].contains("$$") {
                    in_math_block = false;
                }
                result.push_str(line);
                result.push('\n');
                continue;
            }
        } else if in_code_block {
            if trimmed.starts_with("```") {
                in_code_block = false;
            }
            result.push_str(line);
            result.push('\n');
            continue;
        } else if in_math_block {
            if trimmed.starts_with("$$") {
                in_math_block = false;
            }
            // In math blocks, we should still handle < and > for MDX safety
            // but use \lt and \gt which are KaTeX compatible
            let safe_line = line.replace('<', "\\lt ").replace('>', "\\gt ");
            result.push_str(&safe_line);
            result.push('\n');
            continue;
        }

        let mut line_res = String::new();
        let mut in_inline_code = false;
        let mut in_inline_math = false;
        let chars: Vec<char> = line.chars().collect();
        
        let mut i = 0;
        while i < chars.len() {
            let c = chars[i];
            let is_escaped = i > 0 && chars[i-1] == '\\';
            
            match c {
                '`' if !is_escaped && !in_inline_math => {
                    in_inline_code = !in_inline_code;
                    line_res.push(c);
                },
                '$' if !is_escaped && !in_inline_code => {
                    if i + 1 < chars.len() && chars[i+1] == '$' {
                        line_res.push_str("$$");
                        i += 1;
                        in_inline_math = !in_inline_math;
                    } else if !in_inline_math {
                        let mut has_matching_on_line = false;
                        for j in (i + 1)..chars.len() {
                            if chars[j] == '$' && (j == 0 || chars[j-1] != '\\') {
                                if !chars[j-1].is_whitespace() {
                                    has_matching_on_line = true;
                                }
                                break;
                            }
                        }

                        if has_matching_on_line && (i + 1 < chars.len() && !chars[i+1].is_whitespace()) {
                            in_inline_math = true;
                        }
                        line_res.push(c);
                    } else {
                        in_inline_math = false;
                        line_res.push(c);
                    }
                },
                '{' if !in_inline_code && !in_inline_math => {
                    line_res.push_str("&#123;");
                },
                '}' if !in_inline_code && !in_inline_math => {
                    line_res.push_str("&#125;");
                },
                '<' if in_inline_math => {
                    line_res.push_str("\\lt ");
                },
                '>' if in_inline_math => {
                    line_res.push_str("\\gt ");
                },
                '<' if !in_inline_code && !in_inline_math => {
                    line_res.push_str("&lt;");
                },
                '>' if !in_inline_code && !in_inline_math => {
                    line_res.push_str("&gt;");
                },
                '\\' if !in_inline_code && !in_inline_math => {
                    // Check if followed by uXXXX
                    if i + 1 < chars.len() && chars[i+1] == 'u' {
                        line_res.push_str("\\\\");
                    } else {
                        line_res.push('\\');
                    }
                },

                _ => {
                    line_res.push(c);
                }
            }
            i += 1;
        }
        result.push_str(&line_res);
        result.push('\n');
    }
    result
}

async fn generate_mdx(config: &SyncConfig, vault_path: &str, slug: &str, area: &str, shared_body: &str, title: &str, description: Option<&str>, date: &str, updated_at: &str, tags: &[String], is_published: bool) -> Result<()> {
    let dest_path = get_dest_path_for_vault(config, vault_path, slug);
    
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    // Build enriched frontmatter for SEO & Discovery
    let mut fm = String::from("---\n");
    fm.push_str(&format!("title: \"{}\"\n", title.replace("\"", "\\\"")));
    if let Some(desc) = description {
        fm.push_str(&format!("description: \"{}\"\n", desc.replace("\"", "\\\"")));
    }
    fm.push_str(&format!("slug: \"{}\"\n", slug));
    fm.push_str(&format!("area: \"{}\"\n", area));
    fm.push_str(&format!("date: \"{}\"\n", date));
    fm.push_str(&format!("updatedAt: \"{}\"\n", updated_at));
    fm.push_str(&format!("tags: {:?}\n", tags));
    fm.push_str(&format!("published: {}\n", is_published));
    fm.push_str("---\n\n");

    let mdx_safe_content = apply_mdx_safety(shared_body.trim_start());
    let output = format!("{}{}", fm, mdx_safe_content);

    fs::write(dest_path, output).await?;
    Ok(())
}

async fn sync_asset(config: &SyncConfig, file_name: &str) -> Result<()> {
    let source_base = config.obsidian_attachment_path.as_deref()
        .ok_or_else(|| anyhow::anyhow!("OBSIDIAN_ATTACHMENT_PATH environment variable not set"))?;
    let source_path = Path::new(source_base).join(file_name);

    if !source_path.exists() {
        return Err(anyhow::anyhow!("Source asset not found on disk at path: {:?}", source_path));
    }

    info!("☁️  Uploading asset to R2: {}", file_name);

    let curr = env::current_dir().map_err(|e| anyhow::anyhow!("Failed to get current directory: {}", e))?;
    let mut search_root = curr.clone();
    let script_path = loop {
        let p = search_root.join("scripts/upload-to-r2.ts");
        if p.exists() { break p; }
        if !search_root.pop() { 
            return Err(anyhow::anyhow!("Cloudflare upload failure: Could not find 'scripts/upload-to-r2.ts' in project hierarchy."));
        }
    };

    // Use tokio::process::Command for non-blocking execution (P0)
    let mut command = tokio::process::Command::new("pnpm");
    command.arg("exec").arg("tsx").arg(&script_path).arg(source_path.to_string_lossy().to_string());
    
    debug!("Executing upload command: pnpm exec tsx {:?} \"{}\"", script_path.display(), source_path.display());
    
    let spawn_res = command.status().await;
    
    let status = match spawn_res {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            warn!("⚠️  'pnpm' not found in PATH, falling back to 'npx'...");
            tokio::process::Command::new("npx")
                .arg("tsx")
                .arg(&script_path)
                .arg(source_path.to_string_lossy().to_string())
                .status()
                .await
                .map_err(|err| anyhow::anyhow!("Critical: Failed to spawn node runner (neither pnpm nor npx found): {}", err))?
        }
        Err(e) => return Err(anyhow::anyhow!("Failed to execute upload process: {}", e)),
    };

    if !status.success() {
        return Err(anyhow::anyhow!("Asset upload failed for {}: Script exited with non-zero status.", file_name));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_config() -> SyncConfig {
        SyncConfig {
            blog_dest: "apps/web/content/blog".to_string(),
            docs_dest: "apps/docs/content/docs".to_string(),
            notes_dest: "apps/web/content/notes".to_string(),
            r2_public_url: "https://pub.example.com".to_string(),
            obsidian_attachment_path: Some("/vault/attachments".to_string()),
            pool_size: 10,
        }
    }

    #[test]
    fn test_detect_area() {
        assert_eq!(detect_area("Vault/工作领域/Project/Doc.md"), "WORK");
        assert_eq!(detect_area("Vault/学习领域/Rust/Notes.md"), "LEARN");
        assert_eq!(detect_area("Vault/生活领域/Diary.md"), "OTHER");
        assert_eq!(detect_area("Inbox.md"), "OTHER");
    }

    #[test]
    fn test_get_sub_folder() {
        assert_eq!(get_sub_folder("Vault/学习领域/项目/MyProject.md", "LEARN"), "projects");
        assert_eq!(get_sub_folder("Vault/学习领域/资源/Book.md", "LEARN"), "resources");
        assert_eq!(get_sub_folder("Vault/学习领域/知识/Fact.md", "LEARN"), "misc");
        assert_eq!(get_sub_folder("Vault/工作领域/Task.md", "WORK"), "");
    }

    #[test]
    fn test_dest_path_resolution() {
        let config = mock_config();
        
        let path = get_dest_path_for_vault(&config, "Vault/学习领域/项目/MyProj.md", "my-proj");
        assert!(path.to_string_lossy().contains("apps/docs/content/docs/projects/my-proj.mdx"));

        let path = get_dest_path_for_vault(&config, "Vault/工作领域/Blog.md", "slug");
        assert!(path.to_string_lossy().contains("apps/web/content/blog/slug.mdx"));
    }

    #[test]
    fn test_apply_mdx_safety() {
        let input = "Hello {world} <tag>";
        let output = apply_mdx_safety(input);
        assert!(output.contains("&#123;world&#125;"));
        assert!(output.contains("&lt;tag&gt;"));

        let math = "$a < b$";
        let output = apply_mdx_safety(math);
        assert!(output.contains("\\lt"));
    }
}
