# Sparkle Markdown Parsing Engine: Technical Workflow & Logic

This document describes the high-fidelity, multi-stage parsing pipeline that transforms Obsidian-flavored Markdown into the premium "Starry Night" web experience.

---

## 1. High-Level Architecture Overview

The system uses a **Hybrid Multi-Pass Strategy**:
1.  **Core Parser (Rust/WASM)**: Handles structure, security, and preservation of mathematical/wiki-link entities.
2.  **Client-Side Hydrator (TypeScript/React)**: Adds interactivity, dynamic styling (Code/Callouts), and lazy-loaded rendering (LaTeX).
3.  **Visual Layer (CSS Layers)**: Implements specialized markers and theme-aware transitions.

---

## 2. Detailed Parsing Stages (Sequencing)

### Stage A: Core Preservation (Pre-parsing)
Before the document is sent to the standard Markdown-to-HTML compiler, we must "freeze" entities that the compiler might mangle (e.g., math formulas containing `_` or `*`).

*   **Math Extraction**: Identifies `$$ ... $$` (block) and `$ ... $` (inline).
*   **Placeholder Injection**: Replaces formulas with constant strings like `SPARKLE_MATH_PLACEHOLDER_NX`. This ensures the core compiler treats them as opaque text.

### Stage B: Structural Transformation (Standard GFM)
We use a high-performance **GitHub Flavored Markdown (GFM)** compiler.
*   **HTML Generation**: Converts basic syntax (headers, lists, tables) to standard HTML.
*   **Security**: All output is subsequently sanitized (using `DOMPurify` on the client) to prevent XSS.

### Stage C: Obsidian Extensions (Post-parsing HTML)
Once we have the initial HTML structure, we apply specialized transformations for Obsidian features.

#### 1. Block Anchors (`^id`)
*   **Pass 2.5**: Detects the anchor at the very end of a block element.
*   **Transformation**: Replaces it with an invisible `<span id="id" class="block-anchor"></span>`.

#### 2. Extended Task Markers
*   **Pass 2.6**: Targets markers like `[>]`, `[!]`, `[-]`, `[/]`, `[?]`.
*   **Transformation**: Replaces the entire `<li>` header with a semantic class: `obsidian-task task-in-progress`.

#### 3. Obsidian Callouts ([!type])
*   **Pass 2.7**: Identifies blockquotes starting with Obsidian callout syntax.
*   **Transformation**: Converts the blockquote into a structured `<blockquote class="md-callout" data-callout-type="type">` with a header and body. This ensures **SSR/CSR structural parity** and seamless alignment with the design system.
*   **Semantic Header**: Extracts the `[!type]` and optional `TITLE` into a `md-callout__header` div.
*   **Body Preservation**: Captures the remaining blockquote content into a `md-callout__content` div, preserving nested markdown elements (like lists or math).

#### 4. Wiki-Links & Inline Entities
*   **Wiki-Link Hardening**: The parser uses a 512-character lookahead limit and **strict boundary stops**. If it encounters `<`, `>`, `&`, or `\n`, it aborts the wiki-link match. This prevents unclosed `[[` from swallowing subsequent content.
*   **Hashtags**: Matches `#label` only if it starts after whitespace or at the start of a line. Prevents false-positives like hex colors or numbers.

### Stage D: Final Core Assembly (Re-injection)
The "frozen" entities from Stage A are thawed and injected back into the finalized HTML.
*   **Math Re-injection**: Placeholders are replaced with `<div class="sparkle-math math-block" data-tex="...">`.
*   **Entity Encoding**: The `data-tex` attribute is strictly escaped within the Rust core. Consumers (like the server-side KaTeX pre-renderer) **MUST** decode HTML entities (e.g., `&#39;` -> `'`, `&lt;` -> `<`) before passing the string to the rendering engine to prevent formulas like $f''(x)$ from failing.

---

---

## 3. Frontend Hydration (`MarkdownRenderer.tsx`)

When the component mounts in the browser, it performs a non-destructive walk of the DOM to attach behaviors.
*   **Callout Interaction**: No longer performs semantic re-parsing. Frontend only handles visual enhancements (icons, theme-aware transitions) and standardizes the structure emitted by Rust.
*   **Asynchronous Math (KaTeX)**:
    *   **Performance**: To avoid blocking the UI thread, math rendering uses `requestIdleCallback` (via `MathRenderHub`).
    *   **Interactivity**: Attaches click listeners to allow users to toggle between the beautiful rendered formula and the raw LaTeX source code.

---

## 4. Visual Layer (CSS & Design System)

### Callout Design System
The system uses `blockquote.md-callout` as the base selector:
*   **Attribute Mapping**: Uses `[data-callout-type]` to drive thematic colors (e.g., `note` -> purple, `tip` -> aurora).
*   **Supported Types**: Full coverage for `example`, `info`, `danger`, `abstract`, `question`, `success`, `failure`, `quote`, and their common Obsidian aliases.
*   **Interactions**: Implements glassmorphism hover effects and tactile feedback transitions.

### Task Icon System
Instead of standard OS checkboxes, the system uses a custom CSS mapping:
*   **`obsidian-task` class**: Removes default list bullets.
*   **`::before` pseudo-element**: Uses a specific SVG mask for each state (`checked`, `in-progress`, `important`).
*   **Theme Integration**: Colors are derived from the global theme (`--primary`, `--aurora`, etc.) with `oklch()` color-mix for smooth glow effects.

---

## 5. Maintenance Safeguards

*   **Input Size Limit**: Rust core enforces a ~500KiB limit to prevent DoS via complex nested links.
*   **Regex Optimization**: All heavy-duty regexes are compiled once using `once_cell::sync::Lazy` to maximize throughput.
*   **Boundary Checking**: Iterative boundary checks (`max_search`) prevent excessive backtracking in wiki-link detection.

---

## 6. Update Log (Recent Logic Overhauls)

### [2026-04-06] Logic Stabilization & CSS Alignment

Stabilized the core parsing architecture to resolve structural mismatches and rendering failures:

1.  **Callout Regex Rewrite**: Completely overhauled the `CALLOUT_RE` to be GFM-aware. It now correctly handles newline-separated content within blockquotes, preventing body text from leaking into the callout title.
2.  **Structural Parity (Rust-to-CSS)**: Updated the Rust emitted HTML to use `blockquote` (instead of `div`) and `data-callout-type` (instead of `data-callout`). This perfectly aligns with existing CSS selectors and ensures zero-DOW (Document Object Warning) during hydration.
3.  **Math Entity Decoding Fix**: Resolved a critical rendering bug where mathematical derivatives (e.g., $f''(x)$) failed because the `'` (apostrophe) was escaped to `&#39;` but not decoded before KaTeX processing. Added full entity decoding to the `preRenderMath` server utility.
4.  **Extended Callout Styles**: Added full CSS coverage for standard Obsidian callout types (`example`, `danger`, `abstract`, etc.), ensuring "Premium Out-of-the-Box" aesthetics for imported notes.
5.  **Performance Audit**: Verified that the "Single-Pass" approach in Rust eliminates redundant DOM traversals on the client, maintaining the 60fps target for long-form content.

### [2026-04-05] Parsing Pipeline Enhancements

To support modern navigation and complex Obsidian syntax, the following stages were added or refined:
1.  **Block Anchors (`^id`)**: Implemented Pass 2.5 to convert standard Obsidian block link syntax into accessible HTML anchors.
2.  **Auto-generated Heading IDs**: Added Pass 2.5.5 to automatically generate slugs for all headings.
3.  **Extended Task Support**: Introduced Pass 2.6 using `OBSIDIAN_TASK_RE` to handle specialized Obsidian status markers ([>], [!], [-], etc.).
4.  **Math Pre-rendering Robustness**: Improved `extract_math` logic to handle nested blockquote prefixes (`>`).
5.  **Callout Transformation (Pass 2.7)**: Moved Obsidian-style callout parsing from the client-side hydration layer to the Rust core.
6.  **Math Re-injection Hardening**: Implemented rigorous HTML attribute escaping for the `data-tex` attribute.
7.  **Hydration Logic Cleanup**: Removed redundant callout re-parsing from `MarkdownRenderer.tsx`.
