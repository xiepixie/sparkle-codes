# Status Report: Content Pipeline Stability (Sentinel v1.1.7)

## 1. Current State Verification
As of April 4, 2026, the synchronization pipeline from the Obsidian PARA vault to the Next.js frontend is stable.

### ✅ Achievements
*   **Sentinel v1.1.7 Force-Sync**: Bumping redundant `parserVersion` ensures that all existing notes have their metadata updated without requiring manual database wipes.
*   **Schema Consistency**: 
    - **Frontend**: Fumadocs and Blog schemas in `apps/docs` and `apps/web` are unified around `published`, `area`, `date`, `updatedAt`, and `slug`.
    - **Backend**: Sentinel generates frontmatter matching these exact keys.
*   **PARA Routing**: High-fidelity detection of `工作领域` (WORK/Blog) and `学习领域` (LEARN/Docs) paths.
*   **B7: Tag Integrity**: Verified that HTML tags (`<details>`, `<div>`, `<img>`) are preserved as-is, enabling MDX features.
*   **B9: Database Stability**: Connection pools remain healthy by committing transactions *before* file system writes.

### ❓ Remaining Discrepancies
*   **`area` Precision**: Current detection uses `.contains()`. While functional, root-level `.starts_with()` is safer for cases where area names appear within filenames.
*   **Draft Logic**: Folders like `0-收集箱` and `生活领域` are correctly marked as `published: false` but are still physically copied to destination folders (standard behavior for Fumadocs drafts).

---

## 2. Rust Microservice: Current Limitations

| Issue | Impact | Rationale/Fix |
| :--- | :--- | :--- |
| **Asset Leakage** | Low | Images copied to `public/obsidian-assets` are never deleted, even if the source note is removed. |
| **Wikilink Latency** | Med | Cross-note links are stored as `isResolved: false` until a post-sync resolution script runs. |
| **Sync Feedback** | Med | Success/Failure is only visible via Terminal logs. No feedback in the CMS or CMS-like UI. |
| **Duplicate Slugs** | High | Handled by DB Unique Constraint, but requires human intervention to rename sources. |

---

## 3. Logging & Troubleshooting Design

To ensure the system is maintainable, we've implemented the following logging strategy:

### A. Hierarchical Tracing
We utilize `tracing` with different levels to keep logs readable:
- `INFO`: Lifecycle events (Startup, DB Connection, Initial Sync summary).
- `DEBUG`: Per-file processing details (Hash matches, skipped files, parsing status).
- `ERROR`: Unrecoverable file errors or DB failures.

**Debugging Command**:
```bash
# Filter for specific events
RUST_LOG=sentinel=debug cargo run --release
```

### B. Troubleshooting Guide
1. **Metadata not updating?** Bump `PARSER_VERSION` in `main.rs`.
2. **Missing image?** Check `OBSIDIAN_ATTACHMENT_PATH` env var.
3. **Slug collision?** Search `documents` table for `slug` and `area` pairs to identify duplicates.
4. **Build failure in Next.js?** Check `source.config.ts` matches the `sentinel` frontmatter keys.

---

## 4. Next Steps & Enhancements
1. **Automation**: Implement a `healthz` HTTP endpoint (Port 8080) for Sentinel status.
2. **Post-Process**: Add a `resolve_links` job that periodically reconciles `document_links`.
3. **Refinement**: Implement a basic UI dashboard reading from the `documents` table to visualize sync status.
