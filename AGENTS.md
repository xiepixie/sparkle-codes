# AGENTS.md

> Guidelines for AI coding agents working in this repository.

## Goal

This repository is a **content-first technical blog and documentation platform** built with **Next.js App Router, Fumadocs, and MDX**.

Agents must optimize for the following priorities, in order:

1. **Correctness** — prioritize small, verifiable, and well-tested changes.
2. **Performance** — prioritize server-side rendering and minimize client-side JavaScript.
3. **Content Integrity** — ensure MDX rendering, documentation routing, and SEO metadata remain functional.
4. **Maintainability** — encapsulate business logic within packages rather than page files.

When requirements are unclear, follow existing patterns in the codebase rather than introducing new abstractions.

---

## Stack Assumptions

- **Node.js 20+**
- **pnpm + Turbo** monorepo
- **Next.js App Router**
- **React + TypeScript**
- **Fumadocs** for independent documentation (apps/docs)
- **Content-Collections** for technical blog and notes (apps/web)
- **MDX** for high-fidelity content authoring
- **Tailwind CSS + shadcn/ui**
- **Neon Postgres + Drizzle ORM**
- **Zod** for data validation
- **Playwright** for end-to-end testing
- **Sentry** for runtime monitoring

---

## Expected Repository Structure

```txt
/
├── apps/
│   ├── web/                        # Main site: blog, notes, landing pages
│   │   ├── app/                    # Next.js App Router
│   │   ├── content/                # MDX content source
│   │   │   ├── blog/
│   │   │   └── notes/
│   │   ├── components/             # Presentational components
│   │   ├── lib/                    # Adapters, source loaders, metadata helpers
│   │   └── public/
│   └── docs/                       # Standalone docs (only if distinct from main site)
├── packages/
│   ├── ai/                         # RAG logic: embeddings, retrieval, prompt assembly
│   ├── database/                   # Drizzle schema, migrations, and query functions
│   │   ├── schema/
│   │   ├── queries/
│   │   ├── migrations/
│   │   └── index.ts
│   ├── schema/                     # Shared Zod schemas and Type definitions
│   ├── ui/                         # Shared UI primitives based on shadcn
│   └── utils/                      # Shared utility functions
├── scripts/                        # Ingestion, synchronization, and maintenance scripts
├── drizzle/                        # Database migration artifacts
├── tests/                          # Shared test fixtures and cross-app tests
├── turbo.json
├── pnpm-workspace.yaml
└── AGENTS.md
```

### Architectural Rules

- **Routing and Rendering**: Keep logic within `apps/web/app`.
- **Content Storage**: Store MDX files in `apps/web/content`.
- **Database Access**: All database logic must reside in `packages/database`. Do not write SQL or use ORM clients directly in route handlers.
- **AI Logic**: Encapsulate RAG pipelines and AI utilities in `packages/ai`.
- **Sub-applications**: Use `apps/docs` only if the documentation requires a unique deployment or navigation model.

---

## Mandatory Technical Rules

### 1) Default to Server Components

Use React Server Components (RSC) by default. Use the `"use client"` directive only for components requiring:

- Event listeners (e.g., `onClick`, `onChange`)
- Browser-specific APIs (e.g., `window`, `localStorage`)
- Local state management (`useState`, `useReducer`)
- Client-only third-party libraries

Avoid converting entire layouts or pages to Client Components for isolated interactive elements.

### 2) Minimal Page Logic

Ensure blog, note, and documentation page files remain focused on:

- Content loading
- Metadata assembly
- Layout composition
- Invoking shared helpers

Do not implement business logic, database queries, or AI pipelines directly within page files.

### 3) Use Workspace Exports

Prioritize workspace-level exports over deep relative imports:

```ts
import { db } from "@repo/database";
import { getPostBySlug } from "@repo/database/queries";
import { retrieveContext } from "@repo/ai";
import { Button } from "@repo/ui/components/button";
```

Avoid relative paths that cross package boundaries.

### 4) Boundary Validation with Zod

Utilize Zod for data validation at all system boundaries:

- API request validation
- Environment variable parsing (use a centralized config using `t3-env` or equivalent)
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

### App Router Structure

Follow the established App Router conventions:

```txt
app/
├── (site)/
│   ├── page.tsx
│   ├── blog/
│   ├── notes/
│   └── docs/
├── (experiments)/
│   └── ai/
├── api/
└── layout.tsx
```

### Metadata and SEO

- Use `generateMetadata` or shared SEO utilities for every route.
- Maintain canonical URLs, Open Graph tags, and article-specific metadata.
- Ensure `llms.txt` and `llms-full.txt` endpoints are maintained for AI indexing.

### Caching Strategy

Maximize static rendering and cacheable fetch requests. Use dynamic rendering only for request-specific logic (e.g., authentication, live chat, personalized dashboards).

---

## Fumadocs Implementation

- **Fumadocs** is strictly for the standalone documentation site (`apps/docs`).
- **Content-Collections** manages the integrated blog and notes in `apps/web`.
- Ensure compatibility with MDX when updating configurations or file structures.
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
├── blog/
└── notes/

apps/docs/content/
└── docs/
```

---

## Database Implementation

### Logical Separation

All schema definitions and query logic must be located in `packages/database`.

```txt
packages/database/
├── schema/
│   ├── posts.ts
│   ├── notes.ts
│   └── index.ts
├── queries/
│   ├── posts.ts
│   ├── search.ts
│   └── index.ts
└── index.ts
```

### Query Standards

- Implement small, focused query functions.
- Use explicit column selection rather than broad `select *` queries.
- Centralize all relation definitions within the schema directory.
- Database clients must not be instantiated within application code.

---

## AI and RAG Standards

### Responsibilities of `packages/ai`

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
- **Constraint**: Domain variables must describe **what** the variable does in the component context, not just **where** it comes from.

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
  return await db.query.posts.findFirst({
    where: (posts, { eq }) => eq(posts.slug, slug),
  });
}
```

### 3. Content Loading Pattern (Fumadocs)

```typescript
// ✅ apps/web/app/(site)/blog/[slug]/page.tsx
import { allBlogs } from "content-collections";
import { notFound } from "next/navigation";

export default async function PostPage({ params }: { params: { slug: string } }) {
  const { slug } = await params;
  const post = allBlogs.find((p) => p.path === slug);
  
  if (!post) notFound();
  
  return (
    <article>
      <h1>{post.title}</h1>
      {/* <MDXContent code={post.body.code} /> */}
    </article>
  );
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

### Test Coverage

Focus on verifying core functionality and critical paths:

1. Navigation and page rendering (including metadata).
2. MDX compilation and routing.
3. AI retrieval accuracy (answers + sources).
4. Error handling for missing content or invalid slugs.

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
