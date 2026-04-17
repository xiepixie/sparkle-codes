# 🏛️ Sparkle Codes Knowledge Pipeline Architecture (V1.1)

## 0. Executive Summary

This document defines the architecture, domain model, publication rules, and implementation boundaries for the **Sparkle Codes Content Pipeline**.

The system bridges a local Obsidian-based **I.P.A.R.A.** knowledge vault with a cloud-native web platform using:

* a **Native Rust Sentinel** for ingestion and synchronization,
* a **shared Rust markdown-parser** for structural parsing and transformation,
* and a **Neon Postgres** database as the canonical cloud persistence layer.

The primary goals of the current phase are:

* **Data integrity**
* **Deterministic publishing behavior**
* **Stable incremental synchronization**
* **Clear domain-driven routing**
* **Low-latency local-to-cloud propagation**

AI retrieval, embeddings, and vector features are explicitly **out of scope for the current foundation phase**.

---

# 1. Vault Domain Model: I.P.A.R.A.

## 1.1 Root Structure

The local knowledge vault lives under:

```text
/Users/xpx/Data/xpx/Documents/I.P.A.R.A/
```

It contains **four first-level domains**:

1. `0-收集箱`
2. `工作领域`
3. `生活领域`
4. `学习领域`

These are the only top-level domains relevant to classification.

---

## 1.2 Monitoring Scope

The Sentinel monitors:

* `0-收集箱`
* `工作领域`
* `学习领域`

`生活领域` exists in the vault, but it is **not part of the current product publishing strategy** and is therefore treated as **non-project content**.

### Current operational interpretation

| Top-Level Domain |            Monitored | Product-Relevant | Publishing Role                       |
| ---------------- | -------------------: | ---------------: | ------------------------------------- |
| `0-收集箱`          |                  Yes |        Partially | Ingestion-only, non-public by default |
| `工作领域`           |                  Yes |              Yes | Blog domain                           |
| `学习领域`           |                  Yes |              Yes | Docs / Notes domain                   |
| `生活领域`           | No for product logic |               No | Ignored by publishing pipeline        |

> If `生活领域` is still physically watched for indexing or backup reasons in some environments, it must still remain **outside public publishing logic**.

---

## 1.3 Second-Level Structure Inside Product Domains

Both `工作领域` and `学习领域` contain four second-level sections:

* `归档`
* `收集`
* `项目`
* `资源`

These second-level sections are part of the **publication policy**, not just taxonomy.

---

# 2. Domain-to-Platform Mapping

## 2.1 First-Level Domain Mapping

The first-level business mapping is:

| Vault Domain | Internal Area                | Platform Target  | Strategy                                                           |
| ------------ | ---------------------------- | ---------------- | ------------------------------------------------------------------ |
| `工作领域`       | `WORK`                       | Blog             | Public-facing content, stored in Neon and rendered by web platform |
| `学习领域`       | `LEARN`                      | Docs / Notes     | Fumadocs-managed MDX output under `apps/docs/content/docs`         |
| `0-收集箱`      | `INBOX` or non-public bucket | No public target | Private ingestion and staging only                                 |
| `生活领域`       | `LIFE` or ignored            | No public target | Explicitly outside current project scope                           |

### Important clarification

The system is **not** a simple two-domain model.
It is a **four-root vault model**, with only two roots currently mapped to public product surfaces.

---

## 2.2 Product Output Targets

### `工作领域` → Blog

Content in `工作领域` is treated as blog-oriented or public-facing work knowledge.

Primary behavior:

* synced into Neon
* participates in structured document graph
* may be rendered by the main web app
* is routed as **blog/work content**

### `学习领域` → Docs

Content in `学习领域` is treated as docs / notes / learning material.

Primary behavior:

* synced into Neon
* emitted as MDX
* managed through **Fumadocs**
* generated under:

```text
apps/docs/content/docs
```

---

# 3. Publication Policy

This is the most important business rule in the current system.

## 3.1 Default Publication Rules

Within both `工作领域` and `学习领域`, the default publication state depends on the second-level section.

### Default rule set

| Section | Default `isPublished` |
| ------- | --------------------: |
| `项目`    |                `true` |
| `归档`    |                `true` |
| `收集`    |               `false` |
| `资源`    |               `false` |

This means:

* **Projects** and **Archives** are public by default
* **Collections** and **Resources** are private by default

---

## 3.2 Publication Promotion by Reference

A private document may become publishable if it is referenced by a public document.

### Promotion rule

If a public document references a non-public document through an internal wiki-link or equivalent document relation, the referenced document becomes **eligible for publication**.

This rule exists to prevent broken knowledge graphs in public content.

### Current intended behavior

If:

* Document A is public
* Document B is private by default
* Document A links to Document B

Then Document B should be treated as publishable, because otherwise the public graph becomes incomplete.

---

## 3.3 Implication of Promotion Rule

This means `isPublished` is not purely static frontmatter or folder-derived metadata.
It is effectively:

```text
effective_publish_state =
    default_publish_state(section/domain)
    OR explicitly_published
    OR transitively promoted by public references
```

At minimum, current implementation should support:

1. **default publication by folder**
2. **explicit overrides where supported**
3. **promotion by inbound public references**

---

## 3.4 Recommended Constraint on Promotion Depth

To keep behavior understandable, the recommended policy is:

* **direct public-reference promotion only**, unless transitive propagation is explicitly implemented and tested

That is:

* Public A → Private B ⇒ B becomes public
* But whether B → C also promotes C should be a deliberate design choice, not an accidental consequence

### Recommended V1 rule

Use **one-hop promotion** first.
Only move to transitive graph promotion once graph invalidation and recompute rules are stable.

---

# 4. Single Source of Truth (SSOT)

## 4.1 Canonical Content Source

The canonical source of truth is always the local vault markdown file content.

At the database layer:

* `documents.content` stores the canonical markdown body used for synchronization
* `documents.html` stores a derived render artifact
* `document_links` stores derived graph edges
* future artifacts such as chunks, headings, blocks, metadata projections, or vectors remain derivative

---

## 4.2 Artifact Validity Rules

All derivative artifacts must be invalidated when any of the following changes:

* source file content changes
* parser behavior changes
* parser version changes
* publication routing changes that affect output materialization

This is why the system tracks:

* `contentHash`
* `parserVersion`

---

# 5. System Architecture

## 5.1 Producer: Sentinel (`packages/sentinel`)

Sentinel is a native Rust daemon responsible for:

* filesystem monitoring
* incremental sync orchestration
* frontmatter extraction
* metadata derivation
* parser invocation
* persistence into Neon
* MDX artifact publication
* asset upload orchestration

It is built on:

* `Tokio`
* `notify`
* `notify-debouncer-mini`
* `sqlx`

---

## 5.2 Processor: markdown-parser (`packages/markdown-parser`)

The parser crate is shared logic, compiled for:

* native Rust usage by Sentinel
* optional WASM/browser usage where needed

Responsibilities include:

* Obsidian-flavored markdown parsing
* wiki-link extraction
* fragment extraction
* math handling
* HTML generation
* structural metadata extraction

The parser must remain reusable and side-effect free.

---

## 5.3 Storage: Neon (`packages/database`)

Neon Postgres is the cloud persistence layer.

Core tables include:

* `documents`
* `document_links`

Potential future tables include:

* `document_sections`
* `document_blocks`
* `document_chunks`

Neon is the authoritative cloud state, but not the authoring source of truth.

---

# 6. Rust Module Ownership

The Sentinel codebase is organized into a layered Rust module model.

## 6.1 Current Module Map

```text
src/
├── app.rs
├── config.rs
├── db/
│   ├── documents.rs
│   ├── links.rs
│   └── mod.rs
├── main.rs
├── sync.rs
├── sync_engine.rs
├── types.rs
├── utils/
│   ├── frontmatter.rs
│   ├── mdx.rs
│   ├── mod.rs
│   └── path.rs
└── watcher.rs
```

---

## 6.2 Responsibilities by File

### `main.rs`

Binary entry only.

Must:

* call `app::run().await`

Must not:

* contain business logic
* contain SQL
* contain markdown transformation logic

---

### `app.rs`

Application bootstrap layer.

Must:

* initialize tracing
* load `.env` / `.env.local`
* construct `SyncConfig`
* initialize DB pool
* load watch paths
* start watcher runtime

Must not:

* implement per-file sync behavior
* implement markdown parsing logic
* contain detailed persistence rules

---

### `watcher.rs`

Filesystem event intake and task orchestration layer.

Must:

* initialize `notify`
* debounce events
* manage channels
* manage task fan-out and shutdown
* invoke sync entrypoints

Must not:

* contain SQL queries
* contain markdown transformation logic
* determine publication semantics

---

### `sync.rs`

High-level sync orchestration API.

Must:

* expose top-level synchronization entrypoints such as:

  * `initial_sync(...)`
  * `sync_file(...)`
* define the high-level lifecycle order
* coordinate context loading, parsing, persistence, and publishing

Must not:

* reimplement low-level helpers already living in `utils/*`
* accumulate raw SQL strings
* become a giant mixed-responsibility file again

---

### `sync_engine.rs`

Concrete execution layer for a single-file synchronization lifecycle.

Must:

* implement sync stages
* call into `utils/*`
* call into `db/*`
* perform the real work behind `sync.rs`

Typical responsibilities:

* load file context
* split frontmatter/body
* build metadata
* compute sync plan
* parse and resolve links
* persist document state
* publish outputs

---

### `config.rs`

Runtime configuration and environment-derived policy.

Must:

* define `SyncConfig`
* read environment variables
* define destination roots
* define pool sizing and related runtime config

Should also contain:

* high-level routing configuration values
* root path mapping constants

Must not:

* perform raw DB access
* implement markdown rewrite logic

---

### `types.rs`

Shared domain models and contracts.

Must contain:

* `FileContext`
* `ParsedMetadata`
* `ParsedDocument`
* `ResolvedLink`
* `LinkInstance`
* `SyncAction`
* `FrontmatterData` or equivalent

Must not:

* contain heavy side-effect logic
* become a dumping ground for utility functions

---

### `db/documents.rs`

Document-table persistence logic.

Must:

* fetch existing document state
* upsert documents
* delete documents
* load hash/version/slug/publication-related state

Must not:

* rewrite markdown
* contain watcher logic

---

### `db/links.rs`

Link persistence and resolution logic.

Must:

* batch resolve wiki links
* persist link instances
* manage resolved/unresolved graph state

Must not:

* rewrite markdown body text
* own MDX rendering concerns

---

### `utils/path.rs`

Pure path and routing logic.

Must:

* detect top-level vault domain
* detect second-level publication section
* derive destination path
* generate stable slug candidates
* normalize path-derived routing data

Must not:

* depend on database pools
* perform filesystem watching
* perform uploads

---

### `utils/frontmatter.rs`

Robust frontmatter extraction.

Must:

* split frontmatter from body using line-aware scanning
* support LF / CRLF safely
* parse YAML-facing payload cleanly

Must not:

* be mixed with DB logic
* parse the whole document pipeline

---

### `utils/mdx.rs`

Pure MDX safety and text-level transformation support.

Must:

* handle MDX escaping
* preserve code blocks and math blocks correctly
* remain pure

Must not:

* perform DB resolution
* own overall document synchronization

---

# 7. Layer Boundaries

These boundaries are mandatory.

## 7.1 Boundary Rules

* `watcher.rs` **must not** contain SQL.
* `watcher.rs` **must not** contain markdown transformation logic.
* `db/*` **must not** perform markdown or MDX rewriting.
* `utils/*` **must remain pure** and **must not** depend on `PgPool`.
* `app.rs` **must not** implement per-file sync logic.
* `sync.rs` orchestrates; `sync_engine.rs` executes.
* Frontmatter extraction **must occur before** markdown parsing.
* Rendered link output and persisted link graph state **must remain semantically aligned**.
* Publication classification rules **must not** be hand-coded inconsistently across multiple files.

---

# 8. Data Flow

## 8.1 Single File Sync Lifecycle

The canonical sync lifecycle is:

```text
Filesystem Event
-> watcher
-> sync::sync_file
-> sync_engine::load_file_context
-> utils::frontmatter::split_frontmatter
-> sync_engine::build_metadata
-> sync_engine::compute_sync_plan
-> markdown_parser::parse_content_native(body)
-> db::links::resolve_wiki_links_batch(...)
-> utils::mdx::apply_mdx_safety(...)
-> db::documents::upsert_document(...)
-> db::links::replace_document_links(...)
-> publish MDX / DB-only render outputs
-> optional asset sync
```

---

## 8.2 Ordering Rules

The following order is required:

1. **Split frontmatter before parse**
2. **Determine publication state before publish**
3. **Persist structured data before generating derivative files where consistency matters**
4. **Keep DB graph state and rendered link state aligned**
5. **Do not let watcher shortcuts bypass sync policy evaluation**

---

# 9. Publication Logic Model

## 9.1 Routing Inputs

Publication state is determined from three classes of inputs:

1. **Top-level domain**

   * `0-收集箱`
   * `工作领域`
   * `学习领域`
   * `生活领域`

2. **Second-level section**

   * `归档`
   * `收集`
   * `项目`
   * `资源`

3. **Graph-based visibility promotion**

   * public documents referencing private documents

---

## 9.2 Default Effective State

### `工作领域`

* `项目` → public by default
* `归档` → public by default
* `收集` → private by default
* `资源` → private by default

### `学习领域`

* `项目` → public by default
* `归档` → public by default
* `收集` → private by default
* `资源` → private by default

### `0-收集箱`

* always private by default

### `生活领域`

* outside project publishing scope
* treated as non-public / ignored for product output

---

## 9.3 Recommended Internal Enums

The system should distinguish at least:

### Domain / Area

* `WORK`
* `LEARN`
* `INBOX`
* `LIFE`
* optionally `OTHER` only as a fallback, not as the primary business classification

### Publication Section

* `ARCHIVE`
* `COLLECT`
* `PROJECT`
* `RESOURCE`

This is preferable to relying only on free-form path string matching throughout the codebase.

---

# 10. Link Resolution Model

## 10.1 Three-Layer Link Model

The system should model internal links using three states:

1. **Raw**

   * exactly what appears in the markdown source

2. **Normalized**

   * canonicalized for matching
   * path/fragment/name cleanup applied

3. **Resolved**

   * matched to a known document identity in the database

---

## 10.2 Required Link Persistence Fields

Each link instance should preserve enough information for both graph correctness and rendering.

Recommended minimum fields:

* `rawTarget`
* `normalizedTarget`
* `displayText`
* `anchor`
* `isResolved`
* `resolvedDocumentId` or equivalent identity reference
* `sourceOrder`
* link type (`wiki`, `embed`, etc.)

### Important

The database must store **link instances**, not just unique targets per document, because:

* the same target may appear multiple times
* order matters
* display text matters
* anchors matter
* unresolved state matters

---

## 10.3 Public-to-Private Promotion

Promotion behavior should use the persisted graph, not ad hoc text scans after the fact.

Recommended V1 algorithm:

1. derive default publication state from folder/domain
2. persist link graph
3. compute which private nodes are referenced by public nodes
4. promote those nodes to effective public visibility
5. publish accordingly

If this promotion is not yet fully implemented, it must be documented as **partial** rather than implied as complete.

---

# 11. Performance and Runtime Strategy

## 11.1 Core Runtime Tactics

* Native Sentinel runs on `Tokio`
* `notify-debouncer-mini` debounces noisy FS events
* bounded concurrency is enforced with `Semaphore`
* graceful shutdown uses `tokio::select!` + `ctrl_c`
* parser is linked natively to avoid JS interop overhead
* DB updates use transactions for atomicity

---

## 11.2 Hash-Based Incremental Sync

A document should only be reparsed and rewritten when required by one of:

* `contentHash` change
* `parserVersion` change
* derived artifact missing
* publication-state-impacting graph change
* routing change that changes output destination

### Important caveat

Skip logic must respect domain behavior.
For example, DB-only `WORK` documents must not fail skip checks merely because no MDX artifact is expected.

---

# 12. Acceptance Criteria

## 12.1 Sentinel and Data Integrity

* [ ] Hash-based delta writes occur only when document state actually requires reprocessing
* [ ] Parser version increments can trigger full artifact invalidation
* [ ] Content, links, and related derived records are updated atomically
* [ ] Frontmatter is excluded from parsed body content
* [ ] CRLF and LF input produce equivalent parsing semantics

---

## 12.2 Domain and Publication Logic

* [ ] `工作领域` routes to `WORK`
* [ ] `学习领域` routes to `LEARN`
* [ ] `0-收集箱` routes to non-public ingestion state
* [ ] `生活领域` is excluded from product publishing
* [ ] `项目` and `归档` default to published
* [ ] `收集` and `资源` default to private
* [ ] public-to-private reference promotion works according to defined scope

---

## 12.3 Link and Graph Correctness

* [ ] all wiki links are captured as link instances
* [ ] unresolved links are explicitly marked
* [ ] rendered output and persisted graph state agree on resolved vs unresolved behavior
* [ ] fragment and display text are preserved
* [ ] rename and path changes do not silently corrupt graph continuity

---

## 12.4 Output Behavior

* [ ] `学习领域` public content generates valid MDX under `apps/docs/content/docs`
* [ ] `工作领域` content is persisted correctly for blog rendering strategy
* [ ] non-public content does not leak to public outputs
* [ ] promoted documents become publishable when required by graph rules

---

## 12.5 Performance Targets

These are target goals under normal local development conditions, not hard protocol guarantees:

* [ ] small-to-medium incremental note processing should target `P50 < 100ms`
* [ ] local save to cloud-visible state should target `P95 < 500ms` where network conditions are normal
* [ ] upload-heavy paths may exceed those targets and should be measured separately

---

# 13. Recommended Improvements to the Current Architecture

The current architecture is solid, but the following refinements are recommended.

## 13.1 Introduce Explicit Domain Enums

Do not collapse everything outside `WORK` / `LEARN` into a generic `OTHER`.

Preferred:

* `INBOX`
* `WORK`
* `LEARN`
* `LIFE`

This will make publication logic and routing much clearer.

---

## 13.2 Introduce Explicit Section Enums

Do not repeatedly infer publication semantics from raw folder name strings scattered across the codebase.

Preferred:

* `ARCHIVE`
* `COLLECT`
* `PROJECT`
* `RESOURCE`

---

## 13.3 Separate Default Publication from Effective Publication

The system should distinguish:

* `default_is_published`
* `effective_is_published`

This is necessary because graph-based promotion changes visibility.

---

## 13.4 Persist Link Instances, Not Only Resolved Target Maps

A `HashMap<target, resolved>` is not sufficient as the persistence model.
It may still be useful as a lookup cache, but not as the final graph record.

---

## 13.5 Keep `生活领域` Explicitly Out of Public Product Logic

Even if the watcher layer ever sees it, business logic must treat it as outside the current publishing scope.

---

# 14. Development Principles

## 14.1 English-First Engineering

All code comments, architecture notes, identifiers, and metadata strategy should remain English-first.

## 14.2 UTF-8 Native Content Support

The system must fully support:

* Chinese text
* mathematical notation
* mixed UTF-8 note content

## 14.3 Purity Before Cleverness

Prefer:

* explicit routing rules
* testable pure helpers
* stable transactional boundaries

over:

* hidden magic
* over-abstracted DSLs
* premature AI-centric complexity

---

# 15. Final Statement

The Sparkle Codes pipeline is not just a markdown sync tool.
It is a **domain-aware knowledge compiler** with explicit publication semantics.

Its correctness depends on four things being kept aligned:

1. **vault domain structure**
2. **publication policy**
3. **link graph integrity**
4. **artifact generation consistency**

The architecture is good and worth continuing, but it should be implemented with stronger explicitness around:

* four-root vault classification
* second-level publication rules
* graph-based visibility promotion
* strict module boundaries in Sentinel

That explicitness will prevent the system from drifting into a fragile collection of path hacks and accidental side effects.
