# 🏛️ High-Performance Knowledge Pipeline Architecture (V1.0)

## 0. Executive Summary
This document outlines the implementation plan for the **Sparkle Codes Content Pipeline**. The objective is to bridge a local Obsidian P.A.R.A. vault with a cloud-native Next.js platform using a high-performance **Native Rust Sentinel** and a **Dual-Target Parser**. 

Our focus is on **Industrial Stability** and **Latency Minimization**, prioritizing foundational data-integrity over AI/Vector features in the initial phase.

---

## 1. Core Philosophy: The PARA-Domain Mapping
We classify knowledge into two distinct operational domains, each with its own rendering and discovery strategy:

| Domain | Source (Obsidian) | Destination (Platform) | Content Strategy |
| :--- | :--- | :--- | :--- |
| **Blog (工作领域)** | `PARA/Work/Projects` | `apps/web/blog` | **Production-grade Output**. Focus on technical deep-dives, storytelling, and professional branding. High interactivity. |
| **Docs (学习领域)** | `PARA/Learn/Study` | `apps/docs/docs` | **Reference-grade Knowledge**. Focus on structured curricula, technical specs, and quick lookup. Sidebar-centric navigation. |

---

## 2. Technical Stack & Infrastructure
The system architecture follows a **Producer-Consumer** model decoupled by a relational cloud layer.

### A. The Producer: Native Sentinel (`packages/sentinel`)
*   **Engine**: Native Rust Daemon (Runtime: `Tokio`).
*   **Event Model**: OS-level FS events (`notify-rs`) for zero-polling monitoring.
*   **Mechanism**: Performs atomic "Upserts" into the Neon Database.
*   **Shared Logic**: Direct linking to `markdown-parser` for consistent AST processing.

### B. The Processor: Dual-Target Parser (`packages/markdown-parser`)
*   **Compiler**: `wasm-bindgen` (WASM) for Browser + `rlib` (Native) for Sentinel.
*   **Capabilities**:
    *   **Obsidian Wikilinks**: `[[Page#Frag|Alias]]` resolution.
    *   **High-Fidelity Math**: LaTeX environment detection and normalization.
    *   **Static Pre-rendering**: Outputs optimized HTML nodes for DB storage, reducing Next.js SSR overhead.

### C. The Storage: Neon Brain (`packages/database`)
*   **Database**: Neon Serverless Postgres (with `pgvector` reserved).
*   **Knowledge Schema**:
    *   `documents`: Stores raw MD, pre-rendered HTML, and PARA-area metadata.
    *   `documentLinks`: Maps the "Synaptic Graph" (edges) for bidirectional linking.

---

## 3. Implementation Roadmap: The Composite Compiler Model

### A. Data Philosophy: Single Source of Truth (SSOT)
*   **Source of Truth**: `documents.content` (Raw Markdown in Vault).
*   **Render Artifacts**: `documents.html` (Pre-rendered by Sentinel).
*   **Derivative Data**: `document_links`, `document_chunks`, `metadata`. 
*   *Note: All artifacts and derivatives are strictly versioned (`parserVersion`) and hash-tracked (`contentHash`) for atomic invalidation. If the compiler version increments, the whole artifact chain is invalidated.*

### Phase 1: Foundation (Current - Building the Reactor)
*   **Sentinel Native Runtime**: Decoupled from WASM for ingestion. Sentinel acts as a pure Rust daemon.
*   **Identity Decoupling**: Anchor identity to `vaultPath` (stable) while allowing `slug` and `aliases` (dynamic).
*   **Synaptic Resolution**: Implement the 3-layer link model (`raw` -> `normalized` -> `resolved`).

---

## 4. Acceptance Criteria (Definition of Done)

### ⚙️ Sentinel & Data Integrity
- [ ] **Hash-Based Delta**: Updates are ONLY written if `contentHash` differs from the DB record.
- [ ] **Parser Versioning**: System must be capable of triggered batch re-parsing upon `parserVersion` increment.
- [ ] **Atomic Consistency**: DB updates (Content + Links + Chunks) must occur within a single database transaction.

### 🍱 Performance Tiers
- [ ] **Local Incremental Compile**: Single file modification (Obsidian) to native Sentinel processing completion (P50 < 100ms).
- [ ] **End-to-End Consistency**: Local file save to Remote DB Visibility / Web Reflection (P95 < 500ms).

### 🧬 Link & Name Resolution
- [ ] **Reference Robustness**: Links must be tracked via `rawTarget` and resolved to `resolvedDocumentId`.
- [ ] **Rename Awareness**: System handled via `vaultPath` index; renaming a file updates its `vaultPath` while maintaining the internal `id` consistency.
- [ ] **Unresolved Awareness**: `document_links` must flag `isResolved = false` for broken links, enabling the "Missing Node" UI state.

### 🧪 Markdown Logic
- [ ] **Wikilink Accuracy**: All `[[Links]]` must be transformed into `data-target` attributes correctly, handling fragments (`#`) and aliases (`|`).
- [ ] **Math Environment Stability**: LaTeX formulas must be wrapped in `math-inline` or `math-block` classes without character escaping corruption.

### 🍱 Data Persistence
- [ ] **PARA Classification**: Documents must be assigned to `WORK` (Blog) or `LEARN` (Docs) area automatically based on their source path.
- [ ] **Relation Correctness**: The `documentLinks` table must accurately reflect all outgoing links from a newly synced document.

---

## 5. Rust Implementation Notes

**Performance & Architecture Tactics (Sentinel 1.0):**
- **Dual-Target Parser**: The `markdown-parser` uses standard Rust `#[cfg(feature = "wasm")]` gating to compile natively without JS interop overhead when called by Sentinel.
- **Event Debouncing**: Filesystem events from `notify` are debounced within a `500ms` window using `notify-debouncer-mini` to prevent redundant computations on rapid Saves/Renames.
- **Graceful Shutdown**: The asynchronous Tokio runtime utilizes `tokio::select!` handling `tokio::signal::ctrl_c()`. Active database transactions are allowed to complete before connection pool shutdown.
- **Hash-Based Skip**: SHA-256 hashes of the Raw Markdown contents are computed. Neon is only contacted for an `UPSERT` if the `contentHash` diverges from the stored truth, drastically reducing I/O friction.
- **Atomic Upserts**: Content updating and document_links invalidation/creation are wrapped in standard `sqlx` `PgPool` transactions, ensuring data integrity.

---

> [!IMPORTANT]
> All development must adhere to the **"English-First"** branding strategy for code comments and metadata while maintaining full support for UTF-8 (Chinese/Math) content within the documents.
