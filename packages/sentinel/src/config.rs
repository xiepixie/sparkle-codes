use std::env;
use std::path::PathBuf;

pub const PARSER_VERSION: &str = "v1.3.6";

use crate::types::VaultArea;

#[derive(Clone, Debug)]
pub struct SyncConfig {
    /// Public blog content root for WORK area.
    pub blog_dest: PathBuf,

    /// Public docs content root for LEARN area.
    pub docs_dest: PathBuf,

    /// Optional local notes output root for non-primary content.
    pub notes_dest: PathBuf,

    /// Database pool size for Sentinel runtime.
    pub pool_size: u32,

    /// Parser/compiler version used for invalidation.
    pub parser_version: String,

    /// Vault root directory — the I.P.A.R.A root that Sentinel watches.
    pub vault_root: PathBuf,

    /// Whether Inbox documents are allowed to persist into the database.
    /// Recommended: true for internal indexing.
    pub ingest_inbox_to_db: bool,

    /// Whether non-product domains ("Other", e.g. 生活领域) may enter the database.
    /// Recommended: false.
    pub ingest_other_to_db: bool,

    /// Obsidian attachment root directory.
    pub attachment_root: PathBuf,

    /// Cloudflare R2 Account ID.
    pub r2_account_id: String,

    /// Cloudflare R2 Access Key ID.
    pub r2_access_key_id: String,

    /// Cloudflare R2 Secret Access Key.
    pub r2_secret_access_key: String,

    /// Cloudflare R2 Bucket name.
    pub r2_bucket_name: String,

    /// Cloudflare R2 Public Domain (for serving assets).
    pub r2_public_domain: String,

    /// Webhook URL for Next.js cache revalidation.
    pub revalidate_url: Option<String>,

    /// Secret token for Next.js cache revalidation.
    pub revalidate_secret: Option<String>,

    /// [AI] Local Ollama Base URL
    pub local_ai_base_url: String,

    /// [AI] Embedding Model Name
    pub embedding_model: String,

    /// [AI] Reranker Model Name
    pub reranker_model: String,

    /// [AI] Embedding Strategy (local | http)
    pub embedding_strategy: String,

    /// [AI] MLX Model Snapshot Path (for local strategy)
    pub mlx_model_path: String,
}

impl SyncConfig {
    pub fn from_env() -> Self {
        let pool_size = env::var("SENTINEL_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(20);

        let ingest_inbox_to_db = env::var("SENTINEL_INGEST_INBOX_TO_DB")
            .ok()
            .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
            .unwrap_or(true);

        let ingest_other_to_db = env::var("SENTINEL_INGEST_OTHER_TO_DB")
            .ok()
            .map(|v| matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
            .unwrap_or(false);

        let revalidate_url = env::var("NEXTJS_REVALIDATE_URL").ok();
        let revalidate_secret = env::var("NEXTJS_REVALIDATE_SECRET").ok();

        Self {
            blog_dest: PathBuf::from(
                env::var("SYNC_BLOG_DEST")
                    .unwrap_or_else(|_| "apps/web/content/blog".to_string()),
            ),
            docs_dest: PathBuf::from(
                env::var("SYNC_DOCS_DEST")
                    .unwrap_or_else(|_| "apps/docs/content/docs".to_string()),
            ),
            notes_dest: PathBuf::from(
                env::var("SYNC_NOTES_DEST")
                    .unwrap_or_else(|_| "apps/web/content/notes".to_string()),
            ),
            pool_size,
            parser_version: PARSER_VERSION.to_string(),
            vault_root: PathBuf::from(
                env::var("IPARA_VAULT_ROOT")
                    .expect("IPARA_VAULT_ROOT must be set"),
            ),
            attachment_root: PathBuf::from(
                env::var("OBSIDIAN_ATTACHMENT_PATH")
                    .unwrap_or_else(|_| "/Users/xpx/Data/xpx/Extras/附件".to_string()),
            ),
            r2_account_id: env::var("R2_ACCOUNT_ID").unwrap_or_default(),
            r2_access_key_id: env::var("R2_ACCESS_KEY_ID").unwrap_or_default(),
            r2_secret_access_key: env::var("R2_SECRET_ACCESS_KEY").unwrap_or_default(),
            r2_bucket_name: env::var("R2_BUCKET_NAME").unwrap_or_else(|_| "sparkle-assets".to_string()),
            r2_public_domain: env::var("R2_PUBLIC_DOMAIN")
                .or_else(|_| env::var("R2_PUBLIC_URL"))
                .map(|v| v.trim_start_matches("https://").trim_start_matches("http://").trim_end_matches('/').to_string())
                .unwrap_or_else(|_| "cdn.sparkle.codes".to_string()),
            ingest_inbox_to_db,
            ingest_other_to_db,
            revalidate_url,
            revalidate_secret,
            local_ai_base_url: env::var("LOCAL_AI_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:11964".to_string()),
            embedding_model: env::var("EMBEDDING_MODEL")
                .unwrap_or_else(|_| "Qwen3-Embedding-4B".to_string()),
            reranker_model: env::var("RERANKER_MODEL")
                .unwrap_or_else(|_| "Qwen3-Reranker-4B".to_string()),
            embedding_strategy: env::var("EMBEDDING_STRATEGY")
                .unwrap_or_else(|_| "http".to_string()),
            mlx_model_path: env::var("MLX_MODEL_PATH")
                .unwrap_or_default(),
        }
    }

    /// Whether a document in this area should be persisted to the database.
    pub fn should_ingest_to_db(&self, area: &VaultArea) -> bool {
        match area {
            VaultArea::Work | VaultArea::Learn => true,
            VaultArea::Inbox => self.ingest_inbox_to_db,
            VaultArea::Other => self.ingest_other_to_db,
        }
    }

    /// Whether MDX file output should be generated for this area.
    /// Only LEARN area emits MDX for Fumadocs.
    pub fn should_emit_mdx(&self, area: &VaultArea) -> bool {
        matches!(area, VaultArea::Learn)
    }

    /// Whether this area represents a publicly publishable domain.
    /// Retained to support future expansion of web publishing strategies and routing logic.
    pub fn should_publish_to_web(&self, area: &VaultArea) -> bool {
        matches!(area, VaultArea::Work | VaultArea::Learn)
    }
}
