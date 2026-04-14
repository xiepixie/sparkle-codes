use std::path::PathBuf;
use chrono::{DateTime, Utc};
use std::fmt;

// ── Domain Vocabulary ──────────────────────────────────────────

/// Top-level vault area, derived from the first path component.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultArea {
    Inbox,
    Work,
    Learn,
    Other,
}

impl VaultArea {
    /// Map to the database `Area` enum string.
    ///
    /// DB schema defines: WORK / LEARN / OTHER.
    /// Inbox has no dedicated DB value — maps to OTHER
    /// since Inbox is a transient state, not a permanent classification.
    pub fn as_db_str(&self) -> &'static str {
        match self {
            VaultArea::Work => "WORK",
            VaultArea::Learn => "LEARN",
            VaultArea::Inbox | VaultArea::Other => "OTHER",
        }
    }
}

impl fmt::Display for VaultArea {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VaultArea::Inbox => write!(f, "INBOX"),
            VaultArea::Work => write!(f, "WORK"),
            VaultArea::Learn => write!(f, "LEARN"),
            VaultArea::Other => write!(f, "OTHER"),
        }
    }
}

/// Second-level PARA section inside publishable domains.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultSection {
    Archive,
    Collect,
    Project,
    Resource,
    None,
}

impl fmt::Display for VaultSection {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            VaultSection::Archive => write!(f, "Archive"),
            VaultSection::Collect => write!(f, "Collect"),
            VaultSection::Project => write!(f, "Project"),
            VaultSection::Resource => write!(f, "Resource"),
            VaultSection::None => write!(f, "None"),
        }
    }
}

// ── Sync Data Types ────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct FileContext {
    pub vault_path: String,
    /// Absolute OS path. Combined with vault_path for disambiguation in logs and debugging.
    pub full_path: PathBuf,
    pub content_hash: String,
    pub last_modified: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct DocumentMetadata {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub area: VaultArea,
    /// Second-level PARA classification. Retained for semantic completeness and future aggregation logic.
    #[allow(dead_code)]
    pub section: VaultSection,
    /// Pre-calculated content hash. Used for idempotency checks and cache invalidation.
    #[allow(dead_code)]
    pub content_hash: String,
    pub parser_version: String,
    pub updated_at: DateTime<Utc>,
    pub date: Option<DateTime<Utc>>,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub is_published: bool,
}

#[derive(Debug, Clone)]
pub struct MetadataExcerpt {
    pub id: String,
    pub vault_path: String,
    pub slug: String,
    pub title: String,
    pub aliases: Vec<String>,
    pub area: VaultArea,
}

#[derive(Debug, Clone, Default)]
pub struct ResolvedLink {
    pub target_id: Option<String>,
    pub target_slug: Option<String>,
    pub target_area: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LinkInstance {
    pub kind: String, // "WIKI", "EMBED"
    pub target: String,
    pub anchor: Option<String>,
    pub alias: Option<String>,
    pub resolved: Option<ResolvedLink>,
    pub attachment_url: Option<String>,
    /// Original occurrence order in markdown. Retained for document-order traceability. 
    /// Note: DB persistence currently uses 0-based index for actual ordering.
    #[allow(dead_code)]
    pub source_order: i32,
}

#[derive(Debug, Clone)]
pub struct SectionMetadata {
    pub id: String,
    pub heading_id: Option<String>,
    pub heading_text: String,
    pub heading_level: i32,
    pub html: String,
    pub text_content: String,
    pub index: i32,
    pub is_first: bool,
}

#[derive(Debug, Clone)]
pub struct BlockMetadata {
    pub id: String,
    pub block_id: String,
    pub section_id: String,
    pub html: String,
    pub text_content: String,
    pub index: i32,
}

#[derive(Debug, Clone)]
pub struct ChunkMetadata {
    pub id: String,
    pub index: i32,
    pub heading_path: Option<String>,
    pub heading_id: Option<String>,
    pub chunk_text: String,
    pub embedding: Vec<f32>,
    pub token_count: i32,
    pub has_code: bool,
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum SyncAction {
    Skip,
    Create,
    Update,
    /// File removed from vault. Retained variant for upcoming watcher 'Removed' event integration.
    #[allow(dead_code)]
    Delete,
}

impl fmt::Display for SyncAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyncAction::Skip => write!(f, "SKIP"),
            SyncAction::Create => write!(f, "CREATE"),
            SyncAction::Update => write!(f, "UPDATE"),
            SyncAction::Delete => write!(f, "DELETE"),
        }
    }
}
