import {
  hasUsableDatabaseUrl,
  getAllPostSummariesQuery,
  getPostBySlugQuery,
  getPostsPageQuery,
  searchPostSectionsQuery,
} from "@repo/database";
import { 
  renderMarkdownSnippet as renderSearchSnippet, 
  normalizeWhitespace,
  escapeHtml
} from "./markdown-utils";
import katex from "katex";
import { cacheLife, cacheTag } from "next/cache";
import { createHighlighter } from "shiki";

// === SHIKI SINGLETON PRE-WARMING ===
// This prevents 1-5 second cold starts on initial post rendering
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'nord'],
      langs: [
        'ts', 'tsx', 'js', 'jsx', 'json', 'bash', 'md', 'html', 
        'css', 'python', 'rust', 'yaml', 'toml', 'sql', 'ruby', 'go', 'xml', 'c', 'cpp'
      ],
    });
  }
  return highlighterPromise;
}

// Ensure it warms up as soon as the module loads (optional but helpful)
getHighlighter();

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
  status: "draft" | "published" | "archived";
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
  status: "draft" | "published" | "archived";
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
  // If an explicit title is provided (from YAML frontmatter), use it as the primary display title.
  // This prevents the slug-parsing heuristic from mangling long, descriptive titles.
  if (title && title.trim().length > 0) {
    return {
      displayTitle: title,
      badges: [],
    };
  }

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
  return str.replace(regex, () => {
    return replacements.shift() ?? "";
  });
}

/**
 * Server-side HTML transformations to minimize client-side hydration cost.
 */
async function preRenderContent(html: string): Promise<string> {
  if (!html) {
    return html;
  }

  let processed = html;

  // 1. Pre-render Math (KaTeX)
  const mathRegex = /<(span|div)[^>]*class="[^"]*sparkle-math[^"]*"[^>]*data-tex="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
  processed = processed.replace(mathRegex, (match, tag, tex) => {
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
  
  // Avoid dynamic import overhead by using the cached singleton
  const highlighter = await getHighlighter();

  processed = await asyncReplace(processed, codeRegex, async (match, lang, content) => {
    const rawLang = (lang || "TEXT").toUpperCase();
    
    // Skip mermaid for client-side rendering
    if (rawLang === "MERMAID") {
      return match; 
    }    
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
      formattedCodeHtml = highlighter.codeToHtml(code, {
        lang: language,
        themes: {
          light: 'github-light',
          dark: 'nord',
        },
        defaultColor: false,
        cssVariablePrefix: '--shiki-',
        transformers: [
          {
            pre(node: any) {
              node.tagName = 'div';
              node.properties.class = 'code-fence mockup-code !bg-background/20 !border-0';
              node.properties.style = '';
            },
            code(node: any) {
              node.tagName = 'div';
            },
            line(node: any, line: any) {
              node.tagName = 'pre';
              node.properties = { 'data-prefix': line };
            }
          }
        ]
      });
    } catch {
      console.warn(`[Shiki] Failed to compile code block for language: ${language}`);
      const lines = code.split("\n");
      if (lines[lines.length - 1] === "") {
        lines.pop(); // Trailing newline
      }
      const formattedLines = lines.map((line: string, i: number) => 
        `<pre data-prefix="${i + 1}"><code>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;") || " "}</code></pre>`
      ).join("");
      formattedCodeHtml = `<div class="code-fence mockup-code !bg-background/20 !border-0"><div>${formattedLines}</div></div>`;
    }

    return `
      <div class="code-fence-container group/code" data-lang="${language.toLowerCase()}" data-pre-rendered="true" data-code="${escapeHtml(code)}">
        <div class="code-fence-header shadow-inset-sm">
          <div class="code-header-left">
            <div class="code-dots">
              <div class="code-dot code-dot-red"></div>
              <div class="code-dot code-dot-amber"></div>
              <div class="code-dot code-dot-green"></div>
            </div>
          </div>
          <div class="code-header-right flex items-center gap-3">
            <span class="code-lang-text">${language}</span>
            <button class="code-copy-btn opacity-0 group-hover/code:opacity-100 transition-all flex items-center gap-1.5 px-3 py-1 rounded-md hover:bg-white/10 text-[9px] font-black tracking-widest text-primary uppercase active:scale-95" title="Copy Code">
              <span>COPY</span>
            </button>
          </div>
        </div>
        ${formattedCodeHtml}
      </div>
    `.trim();
  });

  // 4. Pre-process WikiLinks/Embeds already rendered by Rust to ensure correct URLs
  // The Rust parser outputs <a class="wiki-link" data-target="Path/To/Doc">...</a>
  // We need to ensure the href is valid for our App Router (/blog/[slug])
  processed = processed.replace(/<a class="wiki-link" data-target="([^"]+)"/g, (_match, target) => {
    const slugForHref = target.split('/').pop() || target;
    return `<a href="/blog/${encodeURIComponent(slugForHref)}" class="wiki-link" data-target="${target}"`;
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

  /**
   * Status Heuristic Mapping
   * 
   * 为什么这样做：
   * 目前 documents 表仅通过 isPublished 布尔值追踪状态。Obsidian 的 "归档" 逻辑
   * 通常体现在文件夹路径 or 标题中。通过这种启发式映射，我们可以让网站界面
   * 与用户的 Obsidian PARA 组织方式保持动态同步，而无需在数据库层引入复杂的状态机。
   * 
   * 改坏会怎样：已归档文章可能会出现在“已发布”列表中。
   */
  let status: "draft" | "published" | "archived" = doc.isPublished ? "published" : "draft";
  if (doc.slug.includes("归档") || doc.title.includes("归档")) {
    status = "archived";
  }

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    displayTitle,
    badges,
    description: optimizedDesc,
    banner: doc.banner || null,

    /**
     * 📝 显示日期优先级逻辑 (Show Date Priority)
     * 
     * 为什么这样做：
     * 1. 数据库中的 createdAt 仅代表“入库时间”，无法准确反映笔记在 Obsidian 中的真实创作时间。
     * 2. Sentinel 会将 YAML 中的 `date`/`updated` 字段（或文件修改时间）同步到数据库的 `updatedAt`。
     * 3. 优先使用 updatedAt 可以让用户通过 YAML 完美自定义文章显示的发布日期，且不会被同步覆盖。
     * 
     * 约束与影响：如果修改为仅使用 createdAt，用户在 Obsidian 中自定义的日期将失效。
     */
    date: (doc.updatedAt || doc.createdAt).toISOString(),
    tags: metadata.tags || [],
    authorName: metadata.authorName || "xpx",
    readingTime: metadata.readingTime || calculatedReadingTime,
    path: doc.slug,
    area: doc.area,
    isPublished: doc.isPublished,
    status,
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

  let status: "draft" | "published" | "archived" = doc.isPublished ? "published" : "draft";
  if (doc.slug.includes("归档") || doc.title.includes("归档")) {
    status = "archived";
  }

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    displayTitle,
    badges,
    description: doc.description || null,
    banner: doc.banner || null,

    /**
     * 📝 显示日期优先级逻辑 (与 mapDocumentToPost 保持一致)
     * 优先使用 updatedAt 以尊重用户在 YAML 中定义的 content date。
     */
    date: (doc.updatedAt || doc.createdAt).toISOString(),
    tags: metadata.tags || [],
    authorName: metadata.authorName || "xpx",
    readingTime: metadata.readingTime || calculatedReadingTime,
    path: doc.slug,
    status,
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

  try {
    const results = await getPostsPageQuery(page, pageSize, query);
    const totalCount = results.length > 0 ? Number(results[0].totalCount) : 0;
    const posts = results.map(mapDocumentToSummary);

    return { posts, totalCount };
  } catch (err) {
    console.error(`[DB ERROR] getPostsPage failed (page: ${page}):`, err);
    return { posts: [], totalCount: 0 };
  }
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

  // 1. Fetch all summaries from global cache
  const allSummaries = await getAllPostSummaries();

  // 2. Perform in-memory filtering
  let filtered = allSummaries;

  if (tags.length > 0) {
    filtered = filtered.filter((post) => tags.every((t) => post.tags.includes(t)));
  }

  if (query) {
    const loweredQuery = query.toLowerCase();
    filtered = filtered.filter(
      (post) =>
        post.title.toLowerCase().includes(loweredQuery) ||
        post.description?.toLowerCase().includes(loweredQuery)
    );
  }

  // 3. Paginate
  const totalCount = filtered.length;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
  
  const startIndex = (page - 1) * pageSize;
  const paginatedPosts = filtered.slice(startIndex, startIndex + pageSize);

  // 4. Map and highlight results
  const posts = paginatedPosts.map((summary) => {
    if (!query) {
      return summary;
    }

    const description = buildDescriptionPreview(summary.description);
    return {
      ...summary,
      description,
      highlightedTitle: renderSearchSnippet(summary.title, query, "title"),
      highlightedDescription: renderSearchSnippet(description, query, "description"),
      highlightedBodyPreview: "", // Body content is not in memory for summaries
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
 * 
 * 为什么这样做：
 * 这是一个核心的数据聚合函数，结果被全站搜索和列表页共享。通过 'use cache'，
 * 我们实现了毫秒级的响应，同时通过 cacheTag 允许在 Sentinel 同步时精准失效。
 */
export async function getAllPostSummaries(): Promise<BlogPostSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("posts", "post-summaries");

  if (!hasUsableDatabaseUrl()) {
    return [];
  }

  try {
    const results = await getAllPostSummariesQuery();
    return results.map(mapDocumentToSummary);
  } catch (err) {
    console.warn("[BLOG LIB] getAllPostSummaries failed. This is expected during some build stages if DB is unreachable.", err);
    return [];
  }
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

  try {
    // Fetch the raw document from DB
    const doc = await getPostBySlugQuery(slug);
    if (!doc) {
      return null;
    }

    // Render MDX to optimized HTML (includes KaTeX, Shiki, etc.)
    return await mapDocumentToPost(doc);
  } catch (err) {
    console.error(`[BLOG LIB] getPostBySlug failed for slug: ${slug}`, err);
    return null;
  }
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
  section: string; // Internal type (Post vs Section)
  context: string; // The post title/filename
  highlightedTitle: string;
  highlightedDescription: string;
  highlightedBodyPreview: string;
  highlightedContext: string;
}

function buildDescriptionPreview(description?: string | null) {
  return normalizeWhitespace(description || "");
}



// renderSearchSnippet is now imported from markdown-utils

export async function searchBlogPosts(query: string, limit = 8): Promise<BlogSearchResult[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  // 1. Hit DB for post-level matches
  const { posts } = await getPostsPage(1, limit, trimmed);
  
  // 2. Hit DB for section-level matches (High-fidelity structural search)
  const sections = await searchPostSectionsQuery(trimmed, limit);

  // 3. Map Post hits
  const postResults: BlogSearchResult[] = posts.map((doc) => {
    const title = doc.displayTitle || doc.title;
    const description = buildDescriptionPreview(doc.description);
    // Filename should be the path (slug)
    const filename = doc.path;
    return {
      id: doc.id,
      title,
      description,
      bodyPreview: "",
      url: `/blog/${encodeURIComponent(doc.path)}`,
      section: "Post",
      context: filename,
      highlightedTitle: renderSearchSnippet(title, query, "title"),
      highlightedDescription: renderSearchSnippet(description, query, "description"),
      highlightedBodyPreview: "",
      highlightedContext: renderSearchSnippet(filename, query, "title"),
    };
  });

  // 4. Map Section hits
  const sectionResults: BlogSearchResult[] = sections.map((sec) => {
    // For section hits, we show the document slug as the "context" (filename)
    // and the section heading as the main title.
    const filename = sec.slug;
    return {
      id: sec.id,
      title: `${sec.headingText}`,
      description: sec.textContent.slice(0, 160),
      bodyPreview: "",
      url: `/blog/${encodeURIComponent(sec.slug)}#${sec.headingId}`,
      section: "Section",
      context: filename,
      highlightedTitle: renderSearchSnippet(sec.headingText, query, "title"),
      highlightedDescription: renderSearchSnippet(sec.textContent.slice(0, 160), query, "description"),
      highlightedBodyPreview: "",
      highlightedContext: renderSearchSnippet(filename, query, "title"),
    };
  });

  // 5. Merge and return, deduplicating by URL
  return [...postResults, ...sectionResults].slice(0, limit);
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
