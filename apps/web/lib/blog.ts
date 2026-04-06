import {
  hasUsableDatabaseUrl,
  getAllPostSummariesQuery,
  getPostsPageQuery,
  getPostBySlugQuery,
  queryPostSummariesQuery,
  searchPostsQuery,
} from "@repo/database";
import katex from "katex";
import { cacheLife, cacheTag } from "next/cache";

/**
 * Metadata stored in the JSONB field of the document.
 */
export interface PostMetadata {
  tags?: string[];
  authorName?: string;
  readingTime?: string;
  [key: string]: any;
}

/**
 * Represents a blog post with parsed display attributes.
 */
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  displayTitle: string;
  badges: string[];
  description: string | null;
  banner: string | null;
  date: string;
  tags: string[];
  authorName: string;
  readingTime: string;
  area: "WORK" | "LEARN" | "OTHER";
  isPublished: boolean;
  metadata: PostMetadata;
  path: string;
  body: {
    code: string;
    html: string;
  };
}

/**
 * Lightweight listing type — only the fields BlogCard actually renders.
 * Avoids transferring content/html over the wire from Neon.
 */
export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  displayTitle: string;
  badges: string[];
  description: string | null;
  banner: string | null;
  date: string;
  tags: string[];
  authorName: string;
  readingTime: string;
  path: string;
  highlightedTitle?: string;
  highlightedDescription?: string;
  highlightedBodyPreview?: string;
}

export interface BlogPostFeedParams {
  page?: number;
  pageSize?: number;
  query?: string;
  tags?: string[];
}

export interface BlogPostFeedResult {
  posts: BlogPostSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  query: string;
  tags: string[];
}

/**
 * Helper to parse a long hyphenated slug into a title and metadata badges.
 */
export function parseSlug(slug: string, title?: string) {
  const segments = slug.split("-");
  if (segments.length <= 1) {
    return {
      displayTitle: title || slug,
      badges: [],
    };
  }

  const displayTitle = segments[segments.length - 1].replace(".mdx", "").replace(".md", "");
  const badges = segments.slice(0, -1).map(s => s.toUpperCase());

  return {
    displayTitle,
    badges,
  };
}

/**
 * Asynchronously replaces matches in a string using an async replacer function.
 */
async function asyncReplace(
  str: string,
  regex: RegExp,
  replacer: (...args: any[]) => Promise<string>
): Promise<string> {
  const promises: Promise<string>[] = [];
  str.replace(regex, (...args) => {
    promises.push(replacer(...args));
    return "";
  });
  const replacements = await Promise.all(promises);
  return str.replace(regex, () => replacements.shift()!);
}

/**
 * Server-side HTML transformations to minimize client-side hydration cost.
 */
async function preRenderContent(html: string): Promise<string> {
  if (!html) return html;

  let processed = html;

  // 1. Pre-render Math (KaTeX)
  const mathRegex = /<(span|div)[^>]*class="[^"]*sparkle-math[^"]*"[^>]*data-tex="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
  processed = processed.replace(mathRegex, (match, tag, tex, content) => {
    const isDisplay = match.includes("math-block");
    const decodedTex = tex
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');

    try {
      const rendered = katex.renderToString(decodedTex, {
        throwOnError: false,
        displayMode: isDisplay,
        trust: true
      });

      return `<${tag} class="${isDisplay ? 'math-block' : 'math-inline'} sparkle-math-rendered" data-rendered-key="true" data-tex="${tex}">${rendered}</${tag}>`;
    } catch (err) {
      console.warn("Server-side KaTeX error:", err);
      return match;
    }
  });

  // 2. Pre-render Code Blocks (Industrial Premium Frame)
  // Matches <pre><code class="language-xyz">...</code></pre>
  const codeRegex = /<pre><code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g;
  
  // Dynamically import shiki so it's loaded lazily
  const { codeToHtml } = await import('shiki');

  processed = await asyncReplace(processed, codeRegex, async (match, lang, content) => {
    const rawLang = (lang || "TEXT").toUpperCase();
    
    // Skip mermaid for client-side rendering
    if (rawLang === "MERMAID") return match; 
    
    // Handle Admonitions (Obsidian Plugin Style ad-...)
    if (rawLang.startsWith("AD-")) {
      const type = rawLang.replace("AD-", "").toLowerCase();
      const title = type.charAt(0).toUpperCase() + type.slice(1);
      
      // Basic escaping and split into paragraphs for content
      const decodedContent = content
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

      const paragraphs = decodedContent.trim().split("\n\n").map((p: string) => 
        `<p>${p.replace(/\n/g, "<br/>")}</p>`
      ).join("");

      return `
        <blockquote class="md-callout" data-callout-type="${type}">
          <div class="md-callout-header">
            <span class="md-callout-icon"></span>
            <span class="md-callout-title">${title}</span>
          </div>
          <div class="md-callout-body">${paragraphs}</div>
        </blockquote>
      `.trim();
    }

    const language = (lang || "text").toLowerCase();
    
    // Unescape the HTML content back to raw code string
    const code = content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    let formattedCodeHtml = "";

    try {
      // Use shiki with dual themes and custom transformers to match mockup-code structure
      formattedCodeHtml = await codeToHtml(code, {
        lang: language,
        themes: {
          light: 'github-light',
          dark: 'nord',
        },
        defaultColor: false,
        cssVariablePrefix: '--shiki-',
        transformers: [
          {
            pre(node) {
              node.tagName = 'div';
              node.properties.class = 'code-fence mockup-code !bg-background/20 !border-0';
              node.properties.style = '';
            },
            code(node) {
              node.tagName = 'div';
            },
            line(node, line) {
              node.tagName = 'pre';
              node.properties = { 'data-prefix': line };
            }
          }
        ]
      });
    } catch (e) {
      console.warn(`[Shiki] Failed to compile code block for language: ${language}`);
      const lines = code.split("\n");
      if (lines[lines.length - 1] === "") lines.pop(); // Trailing newline
      const formattedLines = lines.map((line: string, i: number) => 
        `<pre data-prefix="${i + 1}"><code>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;") || " "}</code></pre>`
      ).join("");
      formattedCodeHtml = `<div class="code-fence mockup-code !bg-background/20 !border-0"><div>${formattedLines}</div></div>`;
    }

    return `
      <div class="code-fence-container group/code" data-lang="${language.toLowerCase()}" data-pre-rendered="true">
        <div class="code-fence-header shadow-inset-sm">
          <div class="code-header-left">
            <div class="code-dots">
              <div class="code-dot code-dot-red"></div>
              <div class="code-dot code-dot-amber"></div>
              <div class="code-dot code-dot-green"></div>
            </div>
            <!-- filename placeholder -->
          </div>
          <div class="code-header-right">
            <span class="code-lang-text">${language}</span>
            <button class="code-copy-btn opacity-0 group-hover/code:opacity-100 transition-all flex items-center gap-1.5 px-3 py-1 rounded-md hover:bg-white/10 text-[9px] font-black tracking-widest text-primary uppercase active:scale-95">
              <span>COPY</span>
            </button>
          </div>
        </div>
        ${formattedCodeHtml}
      </div>
    `.trim();
  });

  // 3. Pre-render Hashtags and Badges
  // Matches [TEXT] or [TEXT:variant] and #hashtag
  // This is a safety pass for items the Rust parser might have missed or that need specific web-app styling
  processed = processed.replace(/(^|\s)#([a-zA-Z\u4e00-\u9fa5][a-zA-Z\d_\-\/\u4e00-\u9fa5]{0,30})/g, '$1<span class="premium-tag md-hashtag">#$2</span>');
  processed = processed.replace(/\[([A-Z\d_\- ]{2,25})(?::(\w+))?\]/g, '<span class="badge-primary">$1</span>');

  // 4. Pre-render WikiLinks
  // Matches [[Path#Fragment|Label]]
  processed = processed.replace(/\[\[([^\]#|]{1,100})(?:#([^\]|]{0,100}))?(?:\|([^\]]{0,100}))?\]\]/g, (_match, path, frag, label) => {
    const p = (path || "").trim();
    const f = (frag || "").trim();
    const l = (label || "").trim();
    const displayLabel = l || (f ? (p ? `${p} > ${f}` : f) : p);
    
    // We leave href as "#" or the path, and let the client-side handeInteraction 
    // refine the leap behavior. For SSR, we just provide a valid-ish structure.
    const href = p ? `/blog/${encodeURIComponent(p)}${f ? '#' + f : ''}` : `#${f}`;
    return `<a href="${href}" class="premium-link wiki-link" data-target="${p}" data-fragment="${f}">${displayLabel}</a>`;
  });

  return processed;
}

async function mapDocumentToPost(doc: any): Promise<BlogPost> {
  const { displayTitle, badges } = parseSlug(doc.slug, doc.title);
  const metadata = (doc.metadata as PostMetadata) || {};

  // Industrial Optimization: Full Deep Pre-rendering
  const optimizedHtml = await preRenderContent(doc.html || "");
  const optimizedDesc = await preRenderContent(doc.description || "");

  // Calculate reading time based on actual content length (~400 chars/min hybrid English/Chinese heuristic)
  const charLength = doc.content?.length || 0;
  const calculatedReadingTime = charLength > 0 ? `${Math.max(1, Math.ceil(charLength / 400))} MIN READ` : "5 MIN READ";

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    displayTitle,
    badges,
    description: optimizedDesc,
    banner: doc.banner || null,
    date: doc.createdAt.toISOString(),
    tags: metadata.tags || [],
    authorName: metadata.authorName || "xpx",
    readingTime: metadata.readingTime || calculatedReadingTime,
    path: doc.slug,
    area: doc.area,
    isPublished: doc.isPublished,
    metadata,
    body: {
      code: "",
      html: optimizedHtml,
    }
  };
}

/**
 * Lightweight mapper for listing pages — skips content/html entirely.
 * No KaTeX pre-rendering, no full-body serialization.
 */
function mapDocumentToSummary(doc: any): BlogPostSummary {
  const { displayTitle, badges } = parseSlug(doc.slug, doc.title);
  const metadata = (doc.metadata as PostMetadata) || {};

  // Calculate reading time from the SQL char_length query
  const charLength = doc.contentLength || 0;
  const calculatedReadingTime = charLength > 0 ? `${Math.max(1, Math.ceil(charLength / 400))} MIN READ` : "5 MIN READ";

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    displayTitle,
    badges,
    description: doc.description || null,
    banner: doc.banner || null,
    date: doc.createdAt.toISOString(),
    tags: metadata.tags || [],
    authorName: metadata.authorName || "xpx",
    readingTime: metadata.readingTime || calculatedReadingTime,
    path: doc.slug,
  };
}

/**
 * Fetch a paginated list + total count via the @repo/database.
 */
export async function getPostsPage(page = 1, pageSize = 5, query?: string): Promise<{
  posts: BlogPostSummary[];
  totalCount: number;
}> {
  if (!hasUsableDatabaseUrl()) {
    return { posts: [], totalCount: 0 };
  }

  const results = await getPostsPageQuery(page, pageSize, query);
  const totalCount = results.length > 0 ? Number(results[0].totalCount) : 0;
  const posts = results.map(mapDocumentToSummary);

  return { posts, totalCount };
}

export async function queryBlogPostFeed(params: BlogPostFeedParams = {}): Promise<BlogPostFeedResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(50, params.pageSize || 5));
  const query = params.query?.trim() || "";
  const tags = [...new Set((params.tags || []).map((tag) => tag.trim()).filter(Boolean))];

  if (!hasUsableDatabaseUrl()) {
    return {
      posts: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
      query,
      tags,
    };
  }

  const results = await queryPostSummariesQuery({
    page,
    pageSize,
    query,
    tags,
  });

  const totalCount = results.length > 0 ? Number(results[0].totalCount) : 0;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const posts = results.map((doc) => {
    const summary = mapDocumentToSummary(doc);
    if (!query) {
      return summary;
    }

    const description = buildDescriptionPreview(doc.description);
    return {
      ...summary,
      description,
      highlightedTitle: renderSearchSnippet(doc.title, query, "title"),
      highlightedDescription: renderSearchSnippet(description, query, "description"),
      highlightedBodyPreview: renderSearchSnippet(buildBodyPreview(query, doc.content), query, "body"),
    };
  });

  return {
    posts,
    totalCount,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
    query,
    tags,
  };
}

/**
 * getAllPostSummaries - Retrieves a slim metadata array for search/navigation.
 * Globally cached to ensure Zero-DB-latency for routing.
 */
export async function getAllPostSummaries(): Promise<BlogPostSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("posts", "post-summaries");

  if (!hasUsableDatabaseUrl()) {
    return [];
  }

  const results = await getAllPostSummariesQuery();
  return results.map(mapDocumentToSummary);
}

/**
 * getPostBySlug - Higher-performance pre-rendered blog data fetching.
 * Uses Next.js 16 'use cache' directive to persist the fully rendered HTML and metadata.
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("posts", `post-${slug}`);

  if (!hasUsableDatabaseUrl()) {
    return null;
  }

  // Fetch the raw document from DB
  const doc = await getPostBySlugQuery(slug);
  if (!doc) return null;

  // Render MDX to optimized HTML (includes KaTeX, Shiki, etc.)
  return await mapDocumentToPost(doc);
}

/**
 * Simplified Pre-warming logic.
 * Call this in root layouts or entry-level pages to ensure instant performance.
 */
export async function warm() {
  await getAllPostSummaries();
}

export async function getRelatedPosts(currentPost: BlogPost, limit = 3): Promise<BlogPostSummary[]> {
  const allPosts = await getAllPostSummaries();
  return allPosts
    .filter((post) => post.path !== currentPost.path)
    .slice(0, limit);
}

export interface BlogSearchResult {
  id: string;
  title: string;
  description: string;
  bodyPreview: string;
  url: string;
  section: string;
  highlightedTitle: string;
  highlightedDescription: string;
  highlightedBodyPreview: string;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDescriptionPreview(description?: string | null) {
  return normalizeWhitespace(description || "");
}

function buildBodyPreview(query: string, content?: string | null) {
  const normalizedContent = normalizeWhitespace(content || "");
  if (!normalizedContent) return "";

  const loweredContent = normalizedContent.toLowerCase();
  const loweredQuery = query.trim().toLowerCase();
  const matchIndex = loweredQuery ? loweredContent.indexOf(loweredQuery) : -1;

  if (matchIndex === -1) return "";

  const start = Math.max(0, matchIndex - 52);
  const end = Math.min(normalizedContent.length, matchIndex + loweredQuery.length + 108);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";

  return `${prefix}${normalizedContent.slice(start, end).trim()}${suffix}`;
}

function renderSearchSnippet(text: string, query: string, hitKind: "title" | "description" | "body") {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";

  const placeholders: Array<{ key: string; html: string }> = [];
  const pushPlaceholder = (html: string) => {
    const key = `__SPARKLE_SNIPPET_${placeholders.length}__`;
    placeholders.push({ key, html });
    return key;
  };

  // Render a constrained markdown subset for search snippets so results stay readable
  // without reusing the full article rendering pipeline.
  let prepared = normalized
    .replace(/(^|\s)#{1,6}\s+/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, href) =>
      pushPlaceholder(
        `<a class="premium-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
      ),
    )
    .replace(/\$([^$\n]+)\$/g, (_match, formula) => {
      try {
        return pushPlaceholder(
          `<span class="search-katex">${katex.renderToString(formula, {
            displayMode: false,
            throwOnError: false,
          })}</span>`,
        );
      } catch {
        return formula;
      }
    })
    .replace(/`([^`]+)`/g, (_match, code) =>
      pushPlaceholder(`<code class="search-inline-code">${escapeHtml(code)}</code>`),
    );

  let html = escapeHtml(prepared)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/==(.+?)==/g, `<mark class="search-inline-accent">$1</mark>`);

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    const pattern = new RegExp(`(${escapeRegExp(trimmedQuery)})`, "gi");
    html = html.replace(
      pattern,
      `<mark class="search-hit" data-hit-kind="${hitKind}">$1</mark>`,
    );
  }

  for (const placeholder of placeholders) {
    html = html.replaceAll(placeholder.key, placeholder.html);
  }

  return html;
}

export async function searchBlogPosts(query: string, limit = 8): Promise<BlogSearchResult[]> {
  if (!hasUsableDatabaseUrl()) {
    return [];
  }

  const results = await searchPostsQuery(query, limit);

  return results.map((doc) => {
    const description = buildDescriptionPreview(doc.description);
    const bodyPreview = buildBodyPreview(query, doc.content);

    return {
      id: doc.id,
      title: doc.title,
      description,
      bodyPreview,
      url: `/blog/${encodeURIComponent(doc.slug)}`,
      section: "Blog",
      highlightedTitle: renderSearchSnippet(doc.title, query, "title"),
      highlightedDescription: renderSearchSnippet(description, query, "description"),
      highlightedBodyPreview: renderSearchSnippet(bodyPreview, query, "body"),
    };
  });
}

/**
 * Shared blog-domain search for the web app.
 * Both the blog index and the reading command center should use this
 * so the user gets one consistent notion of "search posts".
 */
export async function searchBlogPostSummaries(query: string, limit = 24): Promise<BlogPostSummary[]> {
  const result = await queryBlogPostFeed({
    query,
    page: 1,
    pageSize: limit,
  });
  return result.posts;
}
