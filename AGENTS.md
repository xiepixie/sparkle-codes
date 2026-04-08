# AGENTS.md

> Guidelines for AI coding agents working in this repository.

## Goal

This repository is an **industrial-grade technical blog and content-first knowledge platform** built with **Next.js App Router (v16+), Rust-driven content pipelines, and Neon Postgres**.

Agents must optimize for the following priorities, in order:

1. **Correctness** — prioritize small, verifiable, and well-tested changes.
2. **Performance** — prioritize server-side rendering (SSR), `'use cache'` persistence, and minimal client-side JavaScript.
3. **Content Integrity** — ensure that the Obsidian → Sentinel → Neon → Web rendering pipeline remains robust and low-latency.
4. **Maintainability** — encapsulate business logic within workspace packages (`packages/*`) rather than page files.

When requirements are unclear, follow existing patterns in the codebase rather than introducing new abstractions.

---

## Stack Assumptions

- **Node.js 20+**
- **pnpm + Turbo** monorepo
- **Next.js 16+ (App Router)** with **React 19**
- **Neon Postgres + Drizzle ORM** (Primary content and metadata store)
- **Sentinel (Rust)** (Native sync daemon; watches Obsidian vault and syncs to Neon)
- **@v2/markdown-parser (Rust/WASM)** (High-performance Markdown engine with KaTeX/WikiLink support)
- **Fumadocs** (Used only for standalone developer documentation in `apps/docs`)
- **Vercel AI SDK** (For generative AI features and chat)
- **Biome** (Strict linter and formatter)
- **Tailwind CSS 4.0** with **Starry Night** design system tokens
- **Docker** (For production-ready containerized deployments)
- **Zod** (For data validation at boundaries)
- **Testing (Planned)** (Playwright/Vitest planned for critical path validation)
- **Sentry (Planned)** (Planned for runtime error tracking)
- **T3-Env (Planned)** (Planned for centralized environment variable validation)

---

## Expected Repository Structure

```txt
/
├── apps/
│   ├── web/                        # Main site: Blog, lab, and interactive tools
│   │   ├── app/                    # Next.js App Router
│   │   ├── components/             # Presentational components (including markdown-interactivity)
│   │   ├── lib/                    # Blog data access layer and fetchers
│   │   ├── config.ts               # Application configuration and constants
│   │   └── public/
│   └── docs/                       # Developer documentation (Fumadocs-based)
├── packages/
│   ├── database/                   # Drizzle schema, queries, and migrations
│   │   ├── schema/
│   │   │   ├── postgres.ts         # User, session, and organization schemas
│   │   │   └── knowledge.ts        # Documents, links, and chunks (pgvector halfvec)
│   │   ├── queries/                # Domain-specific SQL queries
│   │   ├── drizzle/                # SQL migration artifacts (Drizzle Kit)
│   │   └── index.ts                # Database client and proxy instance
│   ├── sentinel/                    # [Rust] Sync daemon (Obsidian -> Postgres)
│   ├── markdown-parser/            # [Rust] WASM-based Markdown renderer logic
│   ├── ai/                         # AI utilities and RAG stub (TODO: Implementation)
│   ├── ui/                         # Shared UI primitives and Shadcn components
│   └── utils/                      # Shared TS utility functions
├── tooling/                        # Standardized Tailwind and TypeScript configs
├── scripts/                        # Maintenance and R2 upload scripts
├── DOCS/                           # Internal architecture and design specifications
├── Dockerfile                      # Production build manifest
├── turbo.json
└── pnpm-workspace.yaml
```

### Architectural Rules

- **Content Flow**: Content is **not** stored as local MDX files in `apps/web`. Content originates from the Obsidian vault, ingested by **Sentinel (Rust)** into **Neon Postgres**. Use the `@/lib/blog` helpers to fetch and render content.
- **Database Access**: All DB interactions must be defined in `packages/database`. Page files should call exported query functions.
- **Styling**: Adhere to **Starry Layered CSS (SLC)**. Use Tailwind variables for semantic mapping.
- **Markdown Rendering**: Use the `@v2/markdown-parser` for consistency between the sync daemon and the web client.
- **Sentinel Sync**: The `sentinel` package handles the logic for directory-to-database mapping (PARA category enforcement).

---

## Mandatory Technical Rules

### 1) Default to Server Components

Use React Server Components (RSC) by default. Use the `"use client"` directive only for components requiring interactivity (e.g., `MarkdownInteractivity`, `CommandMenu`). Ensure deep pre-rendering of Markdown (via Shiki/KaTeX) happens on the server to maximize LCP.

### 2) Minimal Page Logic

Routine page files in `apps/web/app` should focus on:
- Decoding params and invoking data fetchers.
- Assembling metadata.
- Composing layouts with high-level components.

Do not write raw SQL or complex HTML transformation logic inside `page.tsx`.

### 3) Use Workspace Exports

Prioritize workspace-level exports over deep relative imports:

```ts
import { db } from "@repo/database";
import { getPostBySlugQuery } from "@repo/database"; // Optimized workspace export
import { Button } from "@repo/ui"; // Shared UI primitive
import "@v2/markdown-parser"; // High-perf parser
```

Avoid relative paths that cross package boundaries.

### 4) Boundary Validation with Zod

Utilize Zod for data validation at all system boundaries:

- API request validation
- Environment variable parsing (current: manual `process.env` with plans for `t3-env` integration)
- Script inputs and CLI arguments
- AI tool definitions
- Data transfer objects (DTOs)

### 5) Predictable AI Pipelines

For RAG and generation logic:

- Decouple **chunking**, **embedding**, **retrieval**, and **generation** into separate functions.
- Always return verifiable **sources** with generated answers.
- Avoid implicit prompt logic within route handlers.
- Store prompts in an inspectable and versioned format.

---

## Routing and Rendering Guidelines

### Apps/Web Router

Follow the established folder structure:

```txt
app/
├── (site)/
│   ├── page.tsx                    # Landing page
│   └── blog/                       # Blog list and [slug] details
├── experiments/                    # Interactive lab features (Markdown, Tilt, etc.)
├── api/
│   ├── blog-search/                # Specialized blog search endpoint
│   ├── chat/                       # AI chat endpoint (Vercel AI SDK)
│   └── search/                     # Global metadata search endpoint
├── layout.tsx                      # Root layout with NavBar and CommandMenu
└── globals.css                     # SLC @layer implementation
```

### Metadata and SEO

- Use `generateMetadata` or shared SEO utilities for every route.
- Maintain canonical URLs, Open Graph tags, and article-specific metadata.
- Ensure `llms.txt` and `llms-full.txt` endpoints are maintained for AI indexing.

### Caching Strategy

Maximize static rendering and cacheable fetch requests. For Next.js 15/16+:

1. **'use cache' Directive**: Use the standard `'use cache'` directive for data-fetching and Markdown processing functions. Pair with `cacheLife('hours' | 'days')` for declarative TTL management.
2. **Singleton Engine Patterns**: Heavy WASM-backed engines (e.g., Shiki, Oniguruma) must be instantiated as module-level Singletons (using Promises) to prevent main-thread blocking and layout shifts during request-time rendering.
3. **Database Search Boundaries**: High-frequency interactive search (e.g., Command Center) should perform SQL-level filtering on metadata fields (`title`, `description`, `slug`) rather than scanning large text blobs.
4. **API Pre-Warming**: Implement low-priority background fetches (`priority: low`) on client-side layout mounts to resolve Serverless cold starts and initialize module-level caches before user interaction.

---

## Fumadocs Implementation

- **Fumadocs** is strictly for the standalone documentation site (`apps/docs`).
- Content in `apps/web` is database-driven (Neon Postgres) via the Sentinel pipeline.
- Ensure compatibility with MDX when updating configurations or file structures for documentation.
- Default to the Node.js runtime unless Edge runtime compatibility is explicitly verified.

### Layout and Styling Patterns

1. **Component Configuration**: Use `DocsLayout` properties (e.g., `themeSwitch`, `search`) to control UI visibility instead of CSS overrides.
2. **Type Overrides**: If a property is missing from TypeScript types but confirmed to work, use `// @ts-ignore` with a clarifying comment.
3. **Code Blocks**: Configure the Shiki engine in `apps/docs/source.config.ts`. Use `global.css` for system-wide Fumadocs variables (e.g., `--fd-radius`).
4. **Typography**: Use the standardized font stack: `Poppins` (Sans), `PingFang SC` (Chinese), and `JetBrains Mono` (Code).

### Recommended Content Structure

Organize content to simplify ingestion and authoring:

```txt
apps/web/content/
└── (empty)                         # Content is stored in Postgres; directory reserved for parity

apps/docs/content/
└── docs/                           # Local MDX for developer documentation
```

---

## Database Implementation

### Logical Separation

All schema definitions and query logic must be located in `packages/database`.

```txt
packages/database/
├── schema/
│   ├── postgres.ts                 # Auth and Core tables
│   ├── knowledge.ts                # Content and Vector tables
│   └── index.ts
├── queries/
│   ├── posts.ts                    # Post retrieval and search logic
│   └── index.ts                    # (Planned: aggregated exports)
├── drizzle/                        # SQL migration artifacts
└── index.ts
```

### Query Standards

- Place query logic in `packages/database/queries`.
- Use the provided `db` proxy to avoid multiple client instantiations.
- Implement specialized search logic (using ILIKE/pg_trgm) directly in SQL where performance is critical.

---

## AI and RAG Standards

### Responsibilities of `packages/ai`

> [!NOTE]
> Currently, `packages/ai` is a **stub** (Gemini 1.5 Flash wrapper). Full retrieval pipelines are planned.

The AI package manages:
- Document chunking and normalization
- Vector embedding generation
- Retrieval and ranking pipelines
- Prompt construction
- Output shaping and citation mapping

### Pipeline Architecture

```txt
Raw Content -> Document Normalization -> Chunking -> Vector Encoding -> Storage (pgvector) -> Retrieval -> Generation with Citations
```

### Constraints

- Separate data ingestion logic from runtime API handlers.
- Do not hardcode AI provider details within UI components.
- Always provide verifiable sources for AI-generated content.

---

## UI and Design Standards

- Define shared primitives in `packages/ui`.
- Compose application-specific interfaces in `apps/web/components`.
- Use `next/image` with explicit dimensions or static imports for all media.
- Avoid large client-side animation wrappers that impact page load performance.

### Styling Guidelines

- Use Tailwind CSS with shared theme tokens.
- **Avoid arbitrary values**: Use semantic variables (e.g., `text-primary`, `bg-muted`) defined in `tooling/tailwind/theme.css`.
- Isolate documentation-specific styles from the main application.

### CSS Architecture: Starry Layered CSS (SLC)

Maintain long-term maintainability by organizing styles into an explicit priority hierarchy.

#### 1. Layered Hierarchy
All CSS must be declared within one of the following `@layer` blocks (defined in `globals.css`):
- `tokens`: Variable definitions and design tokens (JSON-like).
- `theme`: Theme-specific mappings (Light/Dark color schemes).
- `base`: Tag-level resets and base styles (use `:where()` to maintain zero-specificity).
- `typography`: Scoped prose styles using `@scope (.markdown-body)`.
- `components`: Encapsulated UI components (prefer CSS Modules).
- `utilities`: Single-purpose helper classes and state modifiers (`.is-active`).
- `overrides`: Strictly for third-party compatibility patches.

#### 2. Component Boundary Rule
**Strict Encapsulation**: Components must never cross-modify the internal DOM structure of other components.
- ✅ **DO**: Use CSS variables or global modifier classes on the parent to influence child behavior.
- ❌ **DON'T**: Use descendant selectors like `.parent-component .child-component-internal-part`.
- **Reasoning**: This prevents "fragile styling" where a change in a small component breaks multiple layouts.

#### 3. Semantic Domain Variables
When mapping global tokens to local components, avoid "mechanical" re-assignments.
- ❌ **Mechanical**: `--md-primary: var(--primary);` (just passing values).
- ✅ **Domain-Semantic**: `--md-callout-border: var(--color-border);`, `--md-code-header-bg: var(--color-muted);`.
- **Constraint**: Domain variables must describe **what** the variable does in the component context, not just **where** it comes from. (Note: Some legacy variables in `globals.css` may still follow mechanical patterns and should be refactored).

#### 4. Modularization & Scoping
- **Markdown Scoping**: Use `@scope (.markdown-body)` to isolate prose styles and prevent global style leakage.
- **CSS Modules**: For complex UI components (MathBlock, CodeFence), use `.module.css` to ensure unique class names and clear ownership.


### Design System: "Starry Night"

Adhere to the following specifications for visual consistency:

1. **Spacing and Radius**:
   - Use a strict 4-8-12-16px scale:
     - `4px` (`--radius-sm`): Tags, tooltips.
     - `6px` (`--radius-md`): Buttons, inputs.
     - `8px` (`--radius-lg`): Code blocks, blockquotes.
     - `12px` (`--radius-xl`): Containers, cards.
2. **Code Block Presentation**:
   - Use a dark theme (e.g., Nord or Catppuccin) for optimal readability.
   - 1px border with 50% opacity.
   - Use inset shadows for depth: `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05)`.
3. **Layout and Navigation**:
   - Maintain a minimal sidebar footer. Toggle visibility via `DocsLayout` props.
   - Use sharp bottom borders for active navigation states.
4. **Interaction Design**:
   - Apply `active:scale-95` for tactile feedback on buttons.
   - Use primary-colored glow effects (`shadow-glow`) on hover states.
5. **Focus Management**:
   - Avoid the `autoFocus` attribute for search inputs and modals.
   - Use `useEffect` or component-library hooks to manually trigger focus (`.focus()`) after transitions or modal animations have completed to ensure a11y compatibility.
6. **Security & Highlighting**:
   - Avoid `dangerouslySetInnerHTML` for search result highlighting.
   - Implement **Node Splitting** strategies where raw text is split into segments and highlighted using React nodes (`<mark>`) to prevent XSS vulnerabilities.

---

## Decision-Based Comments (决策型注释要求)

以下场景必须补充“为什么”型注释，而不只是“做什么”：
- 业务分支 (Business logic branching)
- 缓存策略 (Caching strategies)
- 幂等/去重/重试 (Idempotency / Deduplication / Retries)
- fallback / 降级 (Fallback / Degradation)
- 历史兼容 (Historical compatibility)
- 安全与合规限制 (Security and compliance restrictions)

注释至少回答以下问题中的两个：
- 为什么这样做 (Why was it implemented this way?)
- 保护了什么约束 (What constraints does this protect?)
- 改坏会怎样 (What would break if this is changed?)
- 在什么条件下可以删除 (Under what conditions can this be safely removed?)

---

## Implementation Examples

### 1. Component Definition

```typescript
// ✅ Standardized named export
export function BlogCard({ post }: BlogCardProps) {
  return <div className="p-4 bg-muted/50 rounded-xl">{/* ... */}</div>;
}

// ❌ Avoid default exports and anonymous functions
const BlogCard = (props) => { /* ... */ }
export default BlogCard;
```

### 2. Database Query Isolation

```typescript
// ✅ Located in packages/database/queries/posts.ts
import { db } from "../index";

export async function getPostBySlug(slug: string) {
  // Use the standard findFirst pattern with eq constraint
  return await db.query.posts.findFirst({
    where: (posts, { eq }) => eq(posts.slug, slug),
  });
}
```

### 3. Content Loading Pattern (Fumadocs)

```typescript
// ✅ apps/web/app/(site)/blog/[slug]/page.tsx
import { getPostBySlug } from "@/lib/blog"; // Wraps DB query with 'use cache' and rendering logic

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(decodeURIComponent(slug));
  
  if (!post) notFound();
  
  return <article>{/* Rendered Markdown from post.content */}</article>;
}
```

### 4. Tailwind CSS Theme Integration

```css
/* Defined in tooling/tailwind/theme.css */
@theme {
  --color-primary: var(--primary);
  --color-background: var(--background);
}

@layer base {
  :root {
    --primary: #513bb2;                        /* Imperial Purple */
    --background: oklch(0.995 0.002 255);      /* Sky White */
    --aurora: oklch(0.70 0.12 230);            /* Aurora Teal */
  }
  .dark {
    --primary: oklch(0.75 0.22 295);           /* Neon Purple */
    --background: oklch(0.13 0.015 265);       /* Deep Universe */
  }
}
```

---

## Testing and Safety

### Test Coverage (Planned)

Focus on verifying core functionality and critical paths as testing infrastructure is implemented:

1. Navigation and page rendering (including metadata).
2. Markdown rendering and database retrieval.
3. AI chat response consistency.
4. Error handling for missing entries or 404s.

### Development Safety

- Review existing implementation patterns before introducing changes.
- Ensure proper use of Server vs Client Components.
- Maintain centralized schema definitions.
- Avoid introducing additional state management libraries without justification.

---

## Decision Guidelines

When choosing an implementation path:

- **Interactivity**: Use small, focused Client Components.
- **Data Fetching**: Prioritize server-side fetching.
- **Validation**: Use Zod at entry points.
- **Logic Reuse**: Place shared logic in `packages/*`.
- **Content**: Ensure compatibility with Fumadocs and MDX.
- **AI**: Decouple ingestion from retrieval and generation.

Build with a **content-first** mindset, layering in interactivity and AI features progressively.
