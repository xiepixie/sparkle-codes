# Rust Layer Technical Review

Date: 2026-04-07

Scope:
- `packages/sentinel/src/main.rs`
- `packages/markdown-parser/src/lib.rs`

## 1. Overall architecture

The Rust layer is split into two clear roles:

- `sentinel`: async file watcher + sync orchestrator. It watches Obsidian vault paths, reads markdown files, parses metadata, invokes the parser crate, persists document data into Postgres through `sqlx`, and emits MDX files plus asset uploads.
- `markdown-parser`: pure Rust markdown transformation pipeline. It converts Obsidian-flavored markdown into HTML and extracts structural metadata such as math, wiki links, embeds, hashtags, heading ids, and callouts.

This split is directionally correct:

- Parsing logic is isolated from watcher and persistence logic.
- `markdown-parser` remains reusable and testable.
- `sentinel` is responsible for I/O, process coordination, and data synchronization.

The main weaknesses are not architectural collapse, but execution quality:

- `sentinel` has several expensive operations in hot paths that are repeated per file sync.
- `markdown-parser` performs many whole-string rewrites, which increases allocation churn and worst-case CPU cost.
- Test density is unbalanced: parser coverage exists, daemon coverage is effectively zero.

## 2. `sentinel` technical notes

### 2.1 Execution model

`sentinel` uses:

- a Tokio runtime,
- `notify` + `notify-debouncer-mini` for filesystem events,
- a bounded `Semaphore` for background sync fan-out,
- `JoinSet` for task lifecycle tracking,
- a shared `sqlx::PgPool`.

This is a sensible baseline for a daemon. The concurrency guard is especially important because it prevents the watcher from overwhelming the database pool.

### 2.2 Memory and allocation profile

Per file, the current flow performs several full-content allocations:

- `tokio::fs::read_to_string` loads the whole file into a fresh `String`.
- SHA-256 hashes the full content buffer.
- frontmatter parsing creates multiple owned `String`s for title, slug, description, aliases, tags.
- `markdown_parser::parse_content_native(body)` creates multiple intermediate `String`s internally.
- `prepare_shared_body(body)` clones and rewrites the body multiple times.
- `generate_mdx` creates another full output `String` before writing.

This means one markdown file may transiently exist in 4-7 materialized string forms across the pipeline, depending on features used. With the 512 KiB parser ceiling in `markdown-parser`, memory use is still bounded per file, but burst concurrency multiplies peak RSS. A semaphore of 32 therefore effectively authorizes dozens of medium-sized documents to be resident in transformed form at once.

### 2.3 Performance hotspots

The main hotspots are:

1. repeated environment lookups in sync hot paths
2. repeated regex compilation in helper functions
3. per-link SQL insertion loops
4. synchronous child-process asset uploads
5. path and slug recomputation with avoidable temporary strings

Recommended direction:

- Move all environment-derived config into a typed startup config struct and pass shared references.
- Promote hot regexes in `prepare_shared_body` to `static Lazy<Regex>`.
- Batch link inserts instead of one `INSERT` per link.
- Move asset uploads behind an async queue or dedicated worker pool.
- Lower daemon concurrency to align with database connections and CPU reality unless profiling proves 32 is beneficial.

## 3. `sentinel` detailed risks and optimization advice

### 3.1 Regex compilation inside `prepare_shared_body`

Relevant area:
- `packages/sentinel/src/main.rs:576`

Three `Regex::new(...).unwrap()` calls occur on every parsed file:

- `re_meta`
- `re_ad`
- `re_embed`
- `re_wiki`

This is a pure waste in the steady state. Regex compilation is much more expensive than matching, and those patterns are invariant.

Recommendation:

- Move them to `static Lazy<Regex>`.
- Keep `prepare_shared_body` purely matching and rewriting.

Expected gain:

- Lower CPU per sync.
- Less allocator pressure.
- Better tail latency during large initial syncs.

### 3.2 Concurrency limit does not match DB pool size

Relevant area:
- `packages/sentinel/src/main.rs:50`
- `packages/sentinel/src/main.rs:68`

The pool uses `max_connections(10)` while the file-sync semaphore is `32`.

This mismatch does not cause memory unsafety, but it does create:

- excess task buildup,
- higher heap pressure from queued async state machines,
- more file contents resident before they can make DB progress,
- more variance under I/O spikes.

Because each sync also performs parsing and file work, the optimal limit is not necessarily `10`, but `32` is aggressive for this topology.

Recommendation:

- Make concurrency configurable.
- Default closer to `min(num_cpus * 2, db_pool_size * 2)` or similar.
- If assets are uploaded in-band, use a separate limiter for upload work.

### 3.3 Per-link inserts are N round trips

Relevant area:
- `packages/sentinel/src/main.rs:494`

`document_links` are deleted, then reinserted one row at a time inside a transaction.

Problems:

- round-trip amplification,
- high transaction time under many links,
- poor scaling on high-latency Postgres links,
- unnecessary allocator churn from generating many `cuid()` values serially.

Recommendation:

- Use `sqlx::QueryBuilder` to build one multi-row insert.
- Or pass arrays and use `UNNEST`.

Expected gain:

- significantly lower transaction duration,
- lower DB CPU overhead,
- reduced lock hold times.

### 3.4 Blocking child processes in async flow

Relevant area:
- `packages/sentinel/src/main.rs:739`

`sync_asset` uses `std::process::Command::status()` directly inside async code. This blocks the executor thread while the external process runs.

That is the most important runtime-quality issue in `sentinel`.

Effects:

- stalls a Tokio worker thread,
- hurts responsiveness during uploads,
- increases latency for unrelated tasks when uploads are slow,
- becomes severe when multiple sync tasks trigger uploads concurrently.

Recommendation:

- Prefer `tokio::process::Command`.
- Or isolate blocking process execution behind `spawn_blocking`.
- Add a dedicated semaphore for upload concurrency.

### 3.5 Repeated environment reads and path derivation in hot path

Relevant area:
- `packages/sentinel/src/main.rs:199`
- `packages/sentinel/src/main.rs:384`
- `packages/sentinel/src/main.rs:699`
- `packages/sentinel/src/main.rs:730`

`env::var(...)` is called repeatedly during sync for destination paths and upload settings. This is not catastrophic, but it is avoidable overhead and makes behavior harder to reason about and test.

Recommendation:

- Create a startup `Config` struct with validated fields.
- Store resolved `PathBuf`s, URL bases, and booleans once.

This also improves correctness by making config explicit instead of ambient.

### 3.6 Full initial file list is materialized before processing

Relevant area:
- `packages/sentinel/src/main.rs:150`

`initial_sync` collects every markdown path into `Vec<PathBuf>` first, then spawns work.

For very large vaults, this means:

- the whole file list is materialized,
- sync start is delayed until traversal completes,
- peak memory includes the entire path vector.

Recommendation:

- Stream the `WalkDir` results through a bounded channel.
- Start processing while discovery is still ongoing.

This is not a P0 issue for moderate vault sizes, but it is the right design for scale.

### 3.7 Frontmatter split logic is brittle

Relevant area:
- `packages/sentinel/src/main.rs:287`

The split relies on a literal `---\n` search and manual slicing. It can be confused by:

- Windows line endings,
- body content containing `---` in early positions,
- malformed frontmatter delimiters.

This is more of a correctness concern than a memory issue, but malformed splits can trigger unnecessary parsing and writes.

Recommendation:

- Use a small dedicated frontmatter parser or at least normalize newline handling.

### 3.8 `sentinel` currently lacks unit tests

Relevant area:
- `packages/sentinel/src/main.rs`

`cargo test` passes for `sentinel`, but there are zero tests.

This is a quality gap in:

- slug generation,
- path routing,
- publication rules,
- frontmatter parsing,
- MDX safety escaping,
- link persistence decisions.

Recommendation:

- Extract pure helpers into testable functions or modules.
- Add unit tests for slugging, area detection, frontmatter extraction, MDX escaping, and destination path resolution.

## 4. `markdown-parser` technical notes

### 4.1 Strengths

This crate has several strong implementation choices:

- input size is capped at 512 KiB,
- regexes used across parses are mostly hoisted into `Lazy`,
- HTML escaping is explicit,
- wiki-link parsing avoids regex backtracking by scanning bytes manually,
- parser behavior is covered by meaningful tests for math and callouts.

The parser also avoids unsafe code entirely, so memory safety is inherited from Rust plus dependency correctness.

### 4.2 Main performance model

The parser is implemented as a sequence of full-document passes:

1. `convert_admonition_blocks`
2. `extract_math`
3. escaped hashtag replacement
4. `markdown::to_html_with_options`
5. block-id replacement
6. heading-id replacement
7. task replacement
8. callout replacement
9. inline-entity pass
10. math placeholder reinjection
11. escaped hashtag restoration

This is straightforward and maintainable, but computationally expensive:

- many stages allocate a new `String`,
- several replacements scan the whole HTML document,
- math reinjection performs repeated `String::replace`, which can become quadratic in the number of formulas.

## 5. `markdown-parser` detailed risks and optimization advice

### 5.1 Math reinjection is O(n * m)

Relevant area:
- `packages/markdown-parser/src/lib.rs:706`

For every math item, the parser builds a placeholder string and then runs `html.replace(&placeholder, &element)`, producing a fresh `String` each time.

If a document contains many formulas, this creates:

- repeated full-string scans,
- repeated full-string reallocations,
- high copy cost relative to the final output size.

This is the most important performance issue in `markdown-parser`.

Recommendation:

- Replace all placeholders in a single pass.
- A practical approach is to scan for the placeholder prefix and splice from `math_store`.
- Another option is to store placeholder spans during earlier passes and rebuild once.

### 5.2 Heading rewrite uses regex + nested allocations

Relevant area:
- `packages/markdown-parser/src/lib.rs:553`

For each heading:

- regex captures allocate,
- tag names are lowercased into new `String`s,
- inner HTML is stripped with another regex,
- cleaned text is lowercased again,
- fallback hash slices create more temporary strings.

This is acceptable for small documents but expensive at scale.

Recommendation:

- Prefer AST-level heading ID generation if `markdown` exposes a stable mdast path for your use case.
- If staying in HTML space, avoid repeated lowercase allocations and reuse buffers where possible.

### 5.3 `process_inline_entities` performs extra allocation per wiki link

Relevant area:
- `packages/markdown-parser/src/lib.rs:123`
- `packages/markdown-parser/src/lib.rs:240`

`ParsedWikiLink.full_target` is an owned `String` created from `raw_target`, then `normalized_target` is another new lowercase `String`, while `page`, `fragment`, and `label` are also copied into `WikiLink`.

This is safe but allocation-heavy on link-dense documents.

Recommendation:

- Remove `full_target: String` from the parsed temporary struct unless ownership is required before extraction.
- Normalize once into the final `WikiLink`.
- Consider reserving `extracted_links` capacity heuristically if links are frequent.

### 5.4 `parse_tag` is a lightweight scanner but not quote-aware

Relevant area:
- `packages/markdown-parser/src/lib.rs:59`

It scans until `>` and does not respect quoted attribute values containing `>`. In HTML generated by `markdown-rs` this may be acceptable, but with `allow_dangerous_html: true` raw user HTML can flow through, so the scanner can mis-detect tag boundaries.

This is primarily a correctness hazard, but incorrect skip-depth handling can also produce extra rewriting work.

Recommendation:

- Either constrain raw HTML more tightly,
- or make the tag scanner quote-aware,
- or shift inline-entity logic to a token/AST phase.

### 5.5 Dangerous HTML and protocol settings enlarge the trust boundary

Relevant area:
- `packages/markdown-parser/src/lib.rs:533`

`allow_dangerous_html: true` and `allow_dangerous_protocol: true` are high-risk settings.

This is not a Rust memory-safety issue, but it is a data-safety and rendering-trust issue. It also makes downstream scanners like `parse_tag` and regex HTML transforms operate on less predictable input.

Recommendation:

- Reassess whether both flags are necessary.
- If they are, clearly document trusted-input assumptions.
- Add adversarial tests for raw HTML attributes, nested tags, and malformed input.

### 5.6 Many pass-local `String` constructions can be flattened

Relevant areas:
- `packages/markdown-parser/src/lib.rs:359`
- `packages/markdown-parser/src/lib.rs:419`
- `packages/markdown-parser/src/lib.rs:617`

The parser frequently builds temporary strings with `to_string()`, `format!`, `replace_all(...).to_string()`, and repeated `push_str`.

This is normal in text processing, but some hot paths could be flattened:

- reuse buffers where lifetime allows,
- reserve link vectors and strings more aggressively,
- avoid `format!` in tiny fragments inside tight loops,
- prefer one-pass output builders over chained global replacements.

### 5.7 Test focus is good, but benchmark coverage is missing

Relevant area:
- `packages/markdown-parser/tests/*`

Behavioral tests exist and pass. What is missing is performance regression coverage:

- many formulas,
- many wiki links,
- large callout-heavy documents,
- documents with dense headings and HTML.

Recommendation:

- Add Criterion benchmarks or lightweight perf fixtures.
- Track parse time and peak allocation behavior for representative note sizes.

## 6. Memory-management assessment

Strictly from a Rust memory-management perspective:

- no manual memory management issues were found,
- no unsafe code was found in scope,
- ownership and borrowing are conservative and safe,
- the real issue is not leaks or unsoundness, but allocation intensity and avoidable copies.

Key takeaway:

- memory safety is strong,
- memory efficiency is only moderate.

The current code is operationally safe, but it pays for simplicity with repeated whole-buffer materialization.

## 7. Priority-ranked recommendations

### P0

1. Replace blocking `std::process::Command` in `sync_asset` with async-safe execution.
2. Eliminate per-parse regex compilation in `prepare_shared_body`.
3. Replace repeated math placeholder reinjection with a single-pass reconstruction.

### P1

1. Batch insert `document_links`.
2. Introduce typed startup config and stop repeated `env::var` calls in hot paths.
3. Rebalance sync concurrency against DB pool size and upload concurrency.
4. Add `sentinel` unit tests for pure helpers.

### P2

1. Stream `initial_sync` discovery instead of collecting all paths first.
2. Make frontmatter parsing newline-robust.
3. Reduce temporary string creation in heading/callout/inline entity passes.
4. Add parser benchmarks and larger adversarial tests.

## 8. Suggested refactor direction

If this Rust layer is expected to grow, the cleanest next step is:

1. Split `sentinel/src/main.rs` into modules:
   - `config`
   - `routing`
   - `frontmatter`
   - `sync`
   - `mdx`
   - `assets`
2. Make `SyncConfig` explicit and validated at startup.
3. Keep `markdown-parser` public API stable, but internally migrate from chained global replacements toward fewer linear passes.
4. Add benchmark fixtures before deeper parser optimization so improvements remain measurable.

## 9. Verification status

Commands run:

- `CARGO_TARGET_DIR=/Users/xpx/projects/sparkle-codes/.cargo-target cargo test` in `packages/markdown-parser`
- `CARGO_TARGET_DIR=/Users/xpx/projects/sparkle-codes/.cargo-target cargo test` in `packages/sentinel`

Observed results:

- `markdown-parser`: tests passed.
- `sentinel`: compiled and test runner passed, but there are no unit tests.

