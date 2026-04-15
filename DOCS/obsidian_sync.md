# Operation Manual: Rust-Native Obsidian Sync (Sentinel)

This document describes the high-performance Rust-native synchronization pipeline (`sentinel`) used to transform an Obsidian PARA vault into a production-ready Next.js/Fumadocs site.

## 1. Engine: The "Sentinel" Daemon

We have moved away from legacy TypeScript scripts. The core synchronization logic is handled by a native Rust binary located in `packages/sentinel`.

### Core Workflow
1. **Watch/Scan**: Monitors the Obsidian vault (controlled by `OBSIDIAN_SOURCE_PATHS`) for file changes using a debounced `notify` watcher.
2. **Transform**: Uses the `markdown-parser` Rust crate to convert Obsidian Markdown (Wikilinks, Callouts, Extended Tasks) into clean MDX.
3. **Enriched Metadata**: Injects a standardized metadata schema into every `.mdx` file.
4. **Jump Navigation Support**: Automatically generates stable IDs for headings and block anchors (`^id`) to preserve Obsidian's internal linking compatibility.
5. **Distribute**: 
   - **Blogs**: Synchronized to `apps/web/content/blog` (Area: `WORK`).
   - **Docs**: Synchronized to `apps/docs/content/docs` (Area: `LEARN`).
6. **Persistence**: Updates the Neon/Postgres database with document metadata and Wikilink relationships for RAG and search.

---

## 2. Environment Configuration

The following environment variables must be configured in `.env.local`:

```bash
# Source Vault Paths (Comma-separated for multiple roots)
OBSIDIAN_SOURCE_PATHS="/Users/xpx/Data/xpx/Documents/I.P.A.R.A"

# Attachment Root (For Wikilink asset detection)
OBSIDIAN_ATTACHMENT_PATH="/Users/xpx/Data/xpx/Documents/I.P.A.R.A/ATTACHMENTS"

# Destinations
SYNC_BLOG_DEST="/Users/xpx/projects/sparkle-codes/apps/web/content/blog"
SYNC_DOCS_DEST="/Users/xpx/projects/sparkle-codes/apps/docs/content/docs"
SYNC_PUBLIC_ASSET_DEST="/Users/xpx/projects/sparkle-codes/apps/web/public/obsidian-assets"

# Database
DATABASE_URL="postgres://..."

# Cache Revalidation
# Sentinel calls these URLs after syncing WORK-area content to purge the Next.js cache.
# Multiple URLs can be comma-separated for multi-environment invalidation.
REVALIDATE_SECRET="YOUR_REVALIDATE_SECRET"
REVALIDATE_URL="http://localhost:3000/api/revalidate,https://sparkle.codes/api/revalidate"
```

> **Note:** `REVALIDATE_SECRET` must match the value set in the web app's environment (`.env.local` or `.env.production`). If the secrets diverge, Sentinel's revalidation requests will be rejected with `401`.

---

## 3. Metadata & Routing (PARA Mapping)

Sentinel automatically routes notes based on their location in your Obsidian vault:

    *   **B12: 元数据标准化与物理注入 (Metadata Enrichment)**: 实现了全PARA领域的元数据 schema 统一：`(title, description, slug, area, date, updatedAt, tags, published)`。通过 `chrono` 实现高精度时间同步，并将所有元数据（含文件系统时间与 Obsidian Frontmatter）动态注入至生成的 `.mdx` 物理文件中。
    *   **B13: 内容清洗器 (Content Sanitizer)**: Sentinel 内置高性能 Regex 管道，自动转换以下 Obsidian 语法：
        *   `meta-bind-embed` -> `markdown` (标记为嵌入内容)。
        *   `ad-` callouts -> 标准 Markdown admonitions (`> [!INFO]`)。
        *   `[[WikiLinks]]` -> 标准 MD 链接 `[Title](Target)`。
        *   **MDX 兼容性转义**: 自动将正文中的 `{` 和 `}` 转义为 `\{` 和 `\}`，防止 Next.js 静态编译因误判为 JS 表达式而崩溃。
    *   **PARA 自动路由 & 草稿保护**: 逻辑识别 `工作领域` (WORK) 与 `学习领域` (LEARN)，并自动将 `0-收集箱` 或 `生活领域` 的内容标记为 `published: false`。
| Folder / Path Fragment | Area (PARA) | Target App | Default Published |
| :--- | :--- | :--- | :--- |
| `工作领域` | `WORK` | `apps/web` (Blog) | `true` |
| `学习领域` | `LEARN` | `apps/docs` (Docs) | `true` |
| `0-收集箱` / `收集` | `OTHER` | `None` | `false` |
| `生活领域` | `OTHER` | `None` | `false` |

### Injected Metadata Schema (v1.1.7)
Every generated `.mdx` file contains the following frontmatter, ensuring type-safety in Next.js:
- `title`: Extracted from YAML frontmatter or file name.
- `slug`: Path-flattened unique identifier (sanitized).
- `area`: The PARA area (`WORK` or `LEARN`).
- `date`: Creation timestamp (from frontmatter or FS metadata).
- `updatedAt`: Last modified timestamp (ISO-8601).
- `tags`: Merged arrays from Obsidian YAML.
- `published`: Boolean status (defaults to `true` unless in draft folders).

---

## 4. Stability & Safety Measures

- **B7: MDX Fidelity**: Native preservation of HTML tags (`<details>`, `<img>`) within Markdown.
- **B8: Area-Aware Slugs**: Unique constraint on `(slug, area)` allows identical titles in different domains.
- **B9: Transaction Locking**: Database transactions commit *before* physical file I/O to prevent connection pool blocking.
- **B11: Debounced Watcher**: Prevents "infinite loops" during nested directory operations.
- **B13: Obsidian Block Sanitization**: Native Regex-based conversion of `meta-bind-embed` and `ad-` callouts.
- **B14: Extended Task Markers**: Support for `[>]`, `[!]`, `[-]`, etc., integrated directly into the list parsing pipeline.
- **P0: MDX Safety**: Automatic escaping of curly braces `{}` outside code/math blocks to prevent Next.js build crashes.
- **P1: Stable Fragments**: Heading slugs and block-anchor prefixing (`^`) ensure deep-linking stability.

---

## 5. Execution & Troubleshooting

### Logging & Diagnostics
Sentinel uses the `tracing` framework for diagnostic output. To help debug sync issues:
1. **Verbosity Control**: Set `RUST_LOG=debug` for detailed file-by-file logic.
2. **Component Isolation**: Use `RUST_LOG=sentinel=debug,sqlx=error` to focus on sync logic while hiding noisier DB logs.
3. **Log Structure**:
   - `🚀 Sentinel binary starting up...`: Init check.
   - `📝 Debounced event triggered`: Raw file change detection.
   - `🔄 Syncing file`: Starting DB and physical I/O.
   - `✨ Synced [AREA]`: Success confirmation.

### Database Indexing
The system relies on a high-performing index on `vaultPath`. If you see "Slow Statement" warnings in your Neon logs, ensure these indexes are present:
```sql
CREATE INDEX IF NOT EXISTS idx_documents_vault_path ON documents("vaultPath");
CREATE INDEX IF NOT EXISTS idx_documents_slug_area ON documents("slug", "area");
```
(Note: These are pre-configured in the Drizzle schema).

---

> [!TIP]
> **MDX Highlighting**: If some Obsidian-specific blocks still cause the Shiki highlighter to fail, check `apps/docs/source.config.ts` for language aliases.
