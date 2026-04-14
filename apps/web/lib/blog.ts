import {
	getAllPostSummariesQuery,
	getAllPostsForSearchQuery,
	getPostBySlugQuery,
	getPostsPageQuery,
	hasUsableDatabaseUrl,
	searchPostSectionsQuery,
} from "@repo/database";
import { normalizeSlug } from "@repo/utils";
import katex from "katex";
import { cacheLife, cacheTag } from "next/cache";
import { createHighlighter } from "shiki";
import {
	escapeHtml,
	highlightLatex,
	normalizeWhitespace,
	renderMarkdownSnippet as renderSearchSnippet,
} from "./markdown-utils";

// === SHIKI SINGLETON PRE-WARMING ===
// This prevents 1-5 second cold starts on initial post rendering
let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

export function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ["github-light", "github-dark"],
			langs: [
				"ts",
				"tsx",
				"js",
				"jsx",
				"json",
				"jsonc",
				"bash",
				"md",
				"html",
				"css",
				"python",
				"rust",
				"yaml",
				"toml",
				"sql",
				"ruby",
				"go",
				"xml",
				"c",
				"cpp",
				"latex",
				"tex",
				"txt",
				"plaintext",
			],
		});
	}
	return highlighterPromise;
}

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

	const displayTitle = segments[segments.length - 1]
		.replace(".mdx", "")
		.replace(".md", "");
	const badges = segments.slice(0, -1).map((s) => s.toUpperCase());

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
	replacer: (...args: any[]) => Promise<string>,
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
 * Server-side HTML enhancement for the already-parsed document body.
 *
 * 职责边界：
 * - 这里只接收 Sentinel/markdown-parser 已经产出的 HTML 协议。
 * - 这里可以做“展示增强”，但不能重新解释 Markdown，也不能覆盖解析层已经决定好的链接语义。
 *
 * 为什么这样做：
 * - Parser/Sentinel 负责把 Obsidian 语法解析成稳定 HTML，并解析真实 href/data-src。
 * - Web 层只负责把这些稳定节点增强成更适合阅读的 SSR 结构，减少客户端 hydration 负担。
 * - 如果这里再次重写 wiki-link 解析规则，会和 Sentinel 的解析结果冲突，导致多区域路由或别名解析失真。
 */
async function enhanceDocumentHtmlForReading(html: string): Promise<string> {
	if (!html) {
		return html;
	}

	let processed = html;

	// 1. Pre-render Math (KaTeX)
	// Why: Server-side rendering is faster and prevents hydration layout shift.
	// We use asyncReplace here to await the Shiki highlighter for LaTeX source mode.
	if (processed.includes("sparkle-math")) {
		const mathRegex =
			/<(span|div)[^>]*?class="[^"]*?sparkle-math[^"]*?"[^>]*?data-tex="([^"]*?)"[^>]*?>([\s\S]*?)<\/\1>/g;

		processed = await asyncReplace(
			processed,
			mathRegex,
			async (match, tag, tex, _existingContent) => {
				const isDisplay = match.includes("math-block");

				// Extract existing classes to preserve them
				const classMatch = match.match(/class="([^"]*)"/);
				const existingClasses = classMatch ? classMatch[1] : "";

				const decodedTex = tex
					.replace(/&#39;/g, "'")
					.replace(/&#x27;/g, "'")
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.replace(/&amp;/g, "&")
					.replace(/&quot;/g, '"');

				try {
					const rendered = katex.renderToString(decodedTex, {
						throwOnError: false,
						displayMode: isDisplay,
						trust: false,
					});

					let highlightedSource = "";
					try {
						// Detect indentation levels for LaTeX to improve source readability (e.g., matrices, cases)
						const lineMetadata: { indent: number; text: string }[] = [];
						let currentDepth = 0;

						// Basic source formatting
						const normalizedTex = decodedTex
							.replace(/\r\n/g, "\n")
							.replace(/\r/g, "\n")
							.replace(/(\\begin\{[^}]+\})/g, "\n$1\n")
							.replace(/(\\end\{[^}]+\})/g, "\n$1\n")
							.replace(/\\\\/g, "\\\\\n")
							.replace(/\s*&\s*/g, " & ");

						const lines = normalizedTex
							.split("\n")
							.map((l: string) => l.trim())
							.filter((l: string) => l.length > 0);

						lines.forEach((line: string) => {
							const begins = (line.match(/\\begin\{/g) || []).length;
							const ends = (line.match(/\\end\{/g) || []).length;

							if (line.startsWith("\\end{")) {
								currentDepth = Math.max(0, currentDepth - 1);
								lineMetadata.push({ indent: currentDepth, text: line });
								currentDepth = Math.max(0, currentDepth + begins - (ends - 1));
							} else {
								lineMetadata.push({ indent: currentDepth, text: line });
								currentDepth = Math.max(0, currentDepth + begins - ends);
							}
						});

						if (isDisplay) {
							// Why: We build a pre+code block structure similar to shiki to maintain CSS compatibility
							const formattedLines = lineMetadata
								.map((meta, i) => {
									const lineNum = i + 1;
									const indentStyle =
										meta.indent > 0
											? ` style="--indent-level: ${meta.indent};"`
											: "";
									return `<pre data-prefix="${lineNum}"><span class="line-code"${indentStyle}>${highlightLatex(meta.text)}</span></pre>`;
								})
								.join("");
							highlightedSource = `<div class="code-fence mockup-code">${formattedLines}</div>`;
						} else {
							highlightedSource = `<span class="shiki-inline">${highlightLatex(decodedTex)}</span>`;
						}
					} catch (e) {
						console.error("Custom math highlighting error:", e);
						highlightedSource = isDisplay
							? `<div class="code-fence mockup-code"><pre><code>${escapeHtml(decodedTex)}</code></pre></div>`
							: `<span class="shiki-inline">${escapeHtml(decodedTex)}</span>`;
					}

					let children = "";
					if (isDisplay) {
						// Why: We build a single, unified header that matches standard code blocks
						// but includes our custom "CLOSE" button for formula toggling.
						children = `
							<div class="katex-render-content">${rendered}</div>
							<div class="latex-source code-fence-container group/code" data-lang="latex" data-pre-rendered="true" data-code="${escapeHtml(decodedTex)}">
								<div class="code-fence-header shadow-inset-sm">
								  <div class="code-header-left">
									<div class="code-dots">
									  <div class="code-dot code-dot-red"></div>
									  <div class="code-dot code-dot-amber"></div>
									  <div class="code-dot code-dot-green"></div>
									</div>
								  </div>
								  <div class="code-header-right flex items-center gap-3">
									<span class="code-lang-text">LaTeX</span>
									
									<div class="flex items-center gap-1.5 ml-2 mr-1">
										<div class="flex items-center p-0.5">
											<button type="button" class="math-copy-selector h-6 px-1.5 text-[10px] transition-[color,border-color,opacity,transform] uppercase tracking-tighter active:scale-95 flex items-center justify-center min-w-[30px] border-b-2 text-primary border-primary font-black opacity-100" data-value="$$" title="Format: $$ ... $$">$$</button>
											<button type="button" class="math-copy-selector h-6 px-1.5 text-[10px] transition-[color,border-color,opacity,transform] uppercase tracking-tighter active:scale-95 flex items-center justify-center min-w-[30px] border-b-2 text-muted-foreground/30 border-transparent font-medium hover:text-muted-foreground/60" data-value="\\[" title="Format: \\[ ... \\]">\\[ ... \\]</button>
											<button type="button" class="math-copy-selector h-6 px-1.5 text-[10px] transition-[color,border-color,opacity,transform] uppercase tracking-tighter active:scale-95 flex items-center justify-center min-w-[30px] border-b-2 text-muted-foreground/30 border-transparent font-medium hover:text-muted-foreground/60" data-value="raw" title="Format: Raw LaTeX">RAW</button>
										</div>
										<button type="button" class="math-copy-btn h-7 px-3 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg transition-[background-color,border-color,transform] border border-primary/20 hover:border-primary/40 active:scale-95 flex items-center justify-center" data-wrap="$$">
											<span>COPY</span>
										</button>
									</div>

									<button type="button" class="code-close-btn ml-1 opacity-40 group-hover/code:opacity-100 transition-opacity" title="Close Source">
									  <span>CLOSE</span>
									</button>
								  </div>
								</div>
								${highlightedSource}
							</div>
						`.trim();
					} else {
						children = `
							<span class="katex-render-content">${rendered}</span>
							<span class="latex-source-inline">${highlightedSource}</span>
						`.trim();
					}

					return `<${tag} class="${existingClasses} sparkle-math-rendered is-rendered not-prose" data-rendered-key="true" data-tex="${tex}" tabindex="0" role="button" aria-label="${isDisplay ? "Toggle block math source" : "Toggle inline math source"}">${children}</${tag}>`;
				} catch (err) {
					console.warn("Server-side KaTeX error:", err);
					return match;
				}
			},
		);
	}

	// 2. Premium Tables
	// Why: Default markdown tables are plain. We wrap them in a scrollable, styled container with sticky headers.
	const tableRegex = /<table>([\s\S]*?)<\/table>/g;
	processed = processed.replace(tableRegex, (_match, tableContent) => {
		return `
      <div class="premium-table-wrapper group/table">
        <div class="overflow-x-auto">
          <table class="premium-table w-full not-prose">
            ${tableContent}
          </table>
        </div>
        <div class="table-fade-right pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background/40 to-transparent rounded-r-xl"></div>
      </div>
    `.trim();
	});

	// 3. Obsidian Task Lists
	// Note: We no longer transform tasks here. The @repo/markdown-parser output
	// is already optimized for Starry Night CSS (see packages/markdown-parser/src/styles/tasks.css).
	// This preserves all 10+ Obsidian task states and avoids layout jitter.

	// 4. Premium Hashtags
	// Why: Standard text hashtags are transformed into interactive, themed capsules.
	// We remove the '#' prefix from the raw text as the Tag component/structure provides its own decoration.
	const hashtagRegex = /<span class="premium-tag md-hashtag">#([^<]*)<\/span>/g;
	processed = processed.replace(hashtagRegex, (_match, tag) => {
		return `<span class="premium-tag group/tag inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary/80 transition-[background-color,border-color,box-shadow,color,transform] backdrop-blur-sm hover:border-primary/40 hover:bg-primary/10 hover:shadow-glow-xs cursor-default my-1 mr-2"><span class="mr-1 font-mono text-primary/40 transition-colors group-hover/tag:text-primary/60">#</span><span class="relative">${tag}</span></span>`;
	});

	// 5. Wiki Image Embeds
	// 5. Pre-render WikiImage embeds (Server-Side Stability)
	let imageCount = 0;
	const r2PublicUrl =
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://cdn.sparkle.codes";

	processed = processed.replace(
		/<span class="wiki-embed"\s+data-embed-kind="image"\s+data-src="([^"]*)"(?:\s+data-alt="([^"]*)")?><\/span>/g,
		(_, src, alt) => {
			imageCount++;
			const label = alt || "";
			let widthStyle = "max-width: 100%;";
			let displayAlt = label;
			let imgWidth = "";
			let imgHeight = "";

			if (label && /^\d+(x\d+)?$/.test(label)) {
				const dims = label.split("x");
				const w = dims[0];
				const h = dims[1];

				imgWidth = w;
				if (h) {
					imgHeight = h;
					widthStyle = `width: ${w}px; max-width: 100%; aspect-ratio: ${w} / ${h};`;
				} else {
					widthStyle = `width: ${w}px; max-width: 100%;`;
				}
				displayAlt = "";
			}

			const encodedSrc = encodeURIComponent(src).replace(/%2F/g, "/");
			const primaryUrl = src.startsWith("http")
				? src
				: `${r2PublicUrl.replace(/\/$/, "")}/${encodedSrc}`;

			// Why: The first image in a post is often the LCP (Largest Contentful Paint).
			// Giving it 'high' fetchpriority and removing 'lazy' loading minimizes the discovery delay.
			const isLcpCandidate = imageCount === 1;

			return `
      <span class="wiki-embed" data-src="${src}" data-alt="${label}" data-rendered="${src}">
        <div class="wiki-image-wrapper group relative my-10 flex flex-col items-center">
          <div class="wiki-image-container relative transition-[transform,opacity] duration-700 group-hover:scale-[1.01] z-0 overflow-hidden rounded-xl" style="${widthStyle}">
            <img 
              src="${primaryUrl}" 
              alt="${displayAlt || src}" 
              ${imgWidth ? `width="${imgWidth}"` : ""}
              ${imgHeight ? `height="${imgHeight}"` : ""}
              style="${imgWidth && imgHeight ? `aspect-ratio: ${imgWidth}/${imgHeight};` : ""}"
              class="block w-full h-auto shadow-ambient group-hover:shadow-[0_24px_70px_rgba(0,0,0,0.4)] transition-all duration-700 relative z-0" 
              ${isLcpCandidate ? 'fetchpriority="high"' : 'loading="lazy"'}
              decoding="async"
            />
            <div class="wiki-image-error p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500/60 text-[10px] text-center font-black uppercase tracking-widest my-4" style="display: none;">
              ⚠️ Image Sync Failed: ${src}
            </div>
            <div class="img-toolbar absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30 sm:top-4 sm:right-4 pointer-events-none">
              <button class="img-action-btn copy-img-btn flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all pointer-events-auto border-none" data-url="${primaryUrl}" title="Copy Link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3))"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
            </div>
          </div>
          ${
						displayAlt
							? `
            <div class="mt-5 text-center">
              <span class="px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-[9px] text-primary/60 font-black tracking-[0.3em] uppercase">${displayAlt}</span>
            </div>
          `
							: ""
					}
        </div>
      </span>
    `.trim();
		},
	);

	// 6. Pre-render Code Blocks (Industrial Premium Frame)
	// Matches <pre><code class="language-xyz">...</code></pre> with support for optional attributes on pre/code.
	const codeRegex =
		/<pre\b[^>]*><code(?:\s+class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g;

	if (processed.includes("<pre")) {
		// Avoid dynamic import overhead by using the cached singleton
		const highlighter = await getHighlighter();

		processed = await asyncReplace(
			processed,
			codeRegex,
			async (match, langInfo, content) => {
				// 1. Language and Metadata Extraction
				// langInfo might contain "js {1,3-5}" or just "html"
				const rawLangInfo = (langInfo || "text").trim().toLowerCase();
				const [language, ..._meta] = rawLangInfo.split(/\s+/);
				const hasLineHighlight = content.includes("// line-highlight");

				// Skip mermaid for client-side rendering
				if (language === "mermaid") {
					return match;
				}

				// Handle Admonitions (Obsidian Plugin Style ad-...)
				if (language.startsWith("ad-")) {
					const type = language.replace("ad-", "").toLowerCase();
					const title = type.charAt(0).toUpperCase() + type.slice(1);

					// Basic escaping and split into paragraphs for content
					const decodedContent = content
						.replace(/&lt;/g, "<")
						.replace(/&gt;/g, ">")
						.replace(/&amp;/g, "&")
						.replace(/&quot;/g, '"')
						.replace(/&#39;/g, "'");

					const paragraphs = decodedContent
						.trim()
						.split("\n\n")
						.map((p: string) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
						.join("");

					return `
        <blockquote class="md-callout" data-callout-type="${type}">
          <div class="md-callout__header">
            <span class="md-callout__icon"></span>
            <div class="md-callout__title">${title}</div>
          </div>
          <div class="md-callout__content">${paragraphs}</div>
        </blockquote>
      `.trim();
				}

				// 2. Industrial Unescape Protocol
				// We MUST unescape sequentially to handle double-escaped entities like &amp;lt; -> &lt;
				// This ensures Shiki receives the EXACT characters of the original source code.
				const decodeEntities = (str: string): string => {
					return str
						.replace(/&amp;/g, "&")
						.replace(/&lt;/g, "<")
						.replace(/&gt;/g, ">")
						.replace(/&quot;/g, '"')
						.replace(/&apos;/g, "'")
						.replace(/&#39;/g, "'")
						.replace(/&#x27;/g, "'")
						.replace(/&#x2F;/g, "/")
						.replace(/&nbsp;/g, " ");
				};

				let code = decodeEntities(content);

				// If the code contains the // line-highlight command, we strip it but remember it
				if (hasLineHighlight) {
					code = code.replace(/\/\/ line-highlight\n?/, "");
				}

				let formattedCodeHtml = "";

				try {
					// Detect indentation levels for LaTeX to improve source readability (e.g., matrices, cases)
					const lineMetadata: { indent: number }[] = [];
					if (language === "latex") {
						let currentDepth = 0;
						code.split("\n").forEach((line: string) => {
							const begins = (line.match(/\\begin\{/g) || []).length;
							const ends = (line.match(/\\end\{/g) || []).length;

							// If the line starts with \end, outdent it immediately
							if (line.trim().startsWith("\\end{")) {
								currentDepth = Math.max(0, currentDepth - 1);
								lineMetadata.push({ indent: currentDepth });
								// Adjust for next line, accounting for the end we just processed
								currentDepth = Math.max(0, currentDepth + begins - (ends - 1));
							} else {
								lineMetadata.push({ indent: currentDepth });
								// Adjust for next line
								currentDepth = Math.max(0, currentDepth + begins - ends);
							}
						});
					}

					// Use shiki with dual themes and custom transformers to match mockup-code structure
					formattedCodeHtml = highlighter.codeToHtml(code, {
						lang: language,
						themes: {
							light: "github-light",
							dark: "github-dark",
						},
						defaultColor: false,
						cssVariablePrefix: "--shiki-",
						transformers: [
							{
								pre(node: any) {
									node.tagName = "div";
									node.properties.class = "code-fence mockup-code";
									node.properties.style = "";
								},
								code(node: any) {
									node.tagName = "div";
								},
								line(node: any, line: any) {
									node.tagName = "pre";
									node.properties = { "data-prefix": line };

									const depth =
										language === "latex"
											? lineMetadata[line - 1]?.indent || 0
											: 0;

									// Why: We wrap the code content in a dedicated span to isolate indentation from line numbers.
									node.children = [
										{
											type: "element",
											tagName: "span",
											properties: {
												class: "line-code",
												style:
													depth > 0 ? `--indent-level: ${depth};` : undefined,
											},
											children: node.children,
										},
									];

									if (hasLineHighlight && line === 1) {
										node.properties.class = `${node.properties.class || ""} highlighted`;
									}
								},
							},
						],
					});
				} catch {
					console.warn(
						`[Shiki] Failed to compile code block for language: ${language}`,
					);
					const lines = code.split("\n");
					if (lines[lines.length - 1] === "") {
						lines.pop(); // Trailing newline
					}
					const formattedLines = lines
						.map(
							(line: string, i: number) =>
								`<pre data-prefix="${
									i + 1
								}"><code>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;") || " "}</code></pre>`,
						)
						.join("");
					formattedCodeHtml = `<div class="code-fence mockup-code">${formattedLines}</div>`;
				}

				return `
      <div class="code-fence-container group/code" data-lang="${language}" data-pre-rendered="true" data-code="${escapeHtml(code)}">
        <div class="code-fence-header shadow-inset-sm">
          <div class="code-header-left">
            <div class="code-dots">
              <div class="code-dot code-dot-red"></div>
              <div class="code-dot code-dot-amber"></div>
              <div class="code-dot code-dot-green"></div>
            </div>
          </div>
          <div class="code-header-right flex items-center gap-3">
            <span class="code-lang-text">${language.toUpperCase()}</span>
            <button type="button" class="code-copy-btn" title="Copy Code">
              <span>COPY</span>
            </button>
          </div>
        </div>
        ${formattedCodeHtml}
      </div>
    `.trim();
			},
		);
	}

	return processed;
}

async function mapDocumentToPost(doc: any): Promise<BlogPost> {
	const { displayTitle: rawDisplayTitle, badges } = parseSlug(
		doc.slug,
		doc.title,
	);
	const metadata = (doc.metadata as PostMetadata) || {};

	// 决策说明：
	// - 标题/描述在页面层以纯文本节点消费，不能在这里塞入 HTML，否则 React 会把标签原样转义出来。
	// - 正文才使用 parser+Sentinel 的 HTML 协议，因此只有正文适合做 SSR 结构增强。
	// - 如果后续需要“富文本标题/摘要”，应新增 displayTitleHtml/descriptionHtml，而不是复用纯文本字段。
	const enhancedBodyHtml = await enhanceDocumentHtmlForReading(doc.html || "");

	// Calculate reading time based on actual content length (~400 chars/min hybrid English/Chinese heuristic)
	const charLength = doc.content?.length || 0;
	const calculatedReadingTime =
		charLength > 0
			? `${Math.max(1, Math.ceil(charLength / 400))} MIN READ`
			: "5 MIN READ";

	/**
	 * Status Heuristic Mapping
	 */
	let status: "draft" | "published" | "archived" = doc.isPublished
		? "published"
		: "draft";
	if (doc.slug.includes("归档") || doc.title.includes("归档")) {
		status = "archived";
	}

	return {
		id: doc.id,
		slug: doc.slug,
		title: doc.title,
		displayTitle: rawDisplayTitle,
		badges,
		description: doc.description || null,
		banner: doc.banner || null,

		/**
		 * 显示日期优先级逻辑
		 */
		date: (doc.publishedAt || doc.updatedAt || doc.createdAt).toISOString(),
		tags: (metadata.tags || []).sort((a: string, b: string) =>
			a.localeCompare(b),
		),
		authorName: metadata.authorName || "xpx",
		readingTime: metadata.readingTime || calculatedReadingTime,
		path: doc.slug,
		area: doc.area,
		isPublished: doc.isPublished,
		status,
		metadata,
		body: {
			code: "",
			html: enhancedBodyHtml,
		},
	};
}

function mapDocumentToSummary(doc: any): BlogPostSummary {
	const { displayTitle, badges } = parseSlug(doc.slug, doc.title);
	const metadata = (doc.metadata as PostMetadata) || {};

	// Calculate reading time from the SQL char_length query
	const charLength = doc.contentLength || 0;
	const calculatedReadingTime =
		charLength > 0
			? `${Math.max(1, Math.ceil(charLength / 400))} MIN READ`
			: "5 MIN READ";

	let status: "draft" | "published" | "archived" = doc.isPublished
		? "published"
		: "draft";
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
		 * 优先使用 publishedAt 以尊重用户指定的发布/创作日期。
		 */
		date: (doc.publishedAt || doc.updatedAt || doc.createdAt).toISOString(),
		tags: (metadata.tags || []).sort((a: string, b: string) =>
			a.localeCompare(b),
		),
		authorName: metadata.authorName || "xpx",
		readingTime: metadata.readingTime || calculatedReadingTime,
		path: doc.slug,
		status,
	};
}

/**
 * Fetch a paginated list + total count via the @repo/database.
 */
export async function getPostsPage(
	page = 1,
	pageSize = 5,
	query?: string,
	pathPrefix?: string,
): Promise<{
	posts: BlogPostSummary[];
	totalCount: number;
}> {
	if (!hasUsableDatabaseUrl()) {
		return { posts: [], totalCount: 0 };
	}

	try {
		const results = await getPostsPageQuery(page, pageSize, query, pathPrefix);
		const totalCount = results.length > 0 ? Number(results[0].totalCount) : 0;
		const posts = results.map(mapDocumentToSummary);

		return { posts, totalCount };
	} catch (err) {
		console.error(`[DB ERROR] getPostsPage failed (page: ${page}):`, err);
		return { posts: [], totalCount: 0 };
	}
}

export async function queryBlogPostFeed(
	params: BlogPostFeedParams = {},
): Promise<BlogPostFeedResult> {
	const page = Math.max(1, params.page || 1);
	const pageSize = Math.max(1, Math.min(50, params.pageSize || 5));
	const query = params.query?.trim() || "";
	const tags = [
		...new Set((params.tags || []).map((tag) => tag.trim()).filter(Boolean)),
	];

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
		filtered = filtered.filter((post) =>
			tags.every((t) => post.tags.includes(t)),
		);
	}

	if (query) {
		const loweredQuery = query.toLowerCase();
		filtered = filtered.filter(
			(post) =>
				post.title.toLowerCase().includes(loweredQuery) ||
				post.description?.toLowerCase().includes(loweredQuery),
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
			highlightedDescription: renderSearchSnippet(
				description,
				query,
				"description",
			),
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

	for (let i = 0; i < 2; i++) {
		try {
			const results = await getAllPostSummariesQuery();
			return results.map(mapDocumentToSummary);
		} catch (err: any) {
			const isNetworkError =
				err.message?.includes("fetch failed") || err.name === "TypeError";
			if (isNetworkError && i === 0) {
				await new Promise((resolve) => setTimeout(resolve, 1500));
				continue;
			}
			// Only throw if we're not in a build-time dummy scenario
			const url = process.env.DATABASE_URL;
			if (url && !url.includes("build-time-dummy")) {
				throw err;
			}
			return [];
		}
	}
	return [];
}

/**
 * getPostBySlug - Higher-performance pre-rendered blog data fetching.
 * Uses Next.js 16 'use cache' directive to persist the fully rendered HTML and metadata.
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
	"use cache";
	const normalizedSlug = normalizeSlug(slug);
	cacheLife("hours");
	cacheTag("posts", `post-${normalizedSlug}`);

	if (!hasUsableDatabaseUrl()) {
		return null;
	}

	// Industrial Rule: Exponential backoff or simple retry for cold-start wakeups
	let lastErr: any;
	for (let i = 0; i < 2; i++) {
		try {
			// Fetch the raw document from DB using normalized slug for canonical matching
			const doc = await getPostBySlugQuery(normalizedSlug);
			if (!doc) {
				return null;
			}

			// Render MDX to optimized HTML (includes KaTeX, Shiki, etc.)
			return await mapDocumentToPost(doc);
		} catch (err: any) {
			lastErr = err;
			// If it's a fetch/connection error, retry once after a short delay
			const isNetworkError =
				err.message?.includes("fetch failed") || err.name === "TypeError";
			if (isNetworkError && i === 0) {
				await new Promise((resolve) => setTimeout(resolve, 1500));
				continue;
			}
			throw err; // Re-throw to prevent "use cache" from caching a null/failure
		}
	}
	throw lastErr;
}

/**
 * Simplified Pre-warming logic.
 * Call this in root layouts or entry-level pages to ensure instant performance.
 */
export async function warm() {
	await getAllPostSummaries();
}

export async function getRelatedPosts(
	currentPost: BlogPost,
	limit = 3,
): Promise<BlogPostSummary[]> {
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

export async function searchBlogPosts(
	query: string,
	limit = 8,
	pathPrefix?: string,
): Promise<BlogSearchResult[]> {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) {
		return [];
	}

	// 1. Hit DB for post-level matches
	const { posts } = await getPostsPage(1, limit, trimmed, pathPrefix);

	// 2. Hit DB for section-level matches (High-fidelity structural search)
	const sections = await searchPostSectionsQuery(trimmed, limit, pathPrefix);

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
			highlightedDescription: renderSearchSnippet(
				description,
				query,
				"description",
			),
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
			highlightedDescription: renderSearchSnippet(
				sec.textContent.slice(0, 160),
				query,
				"description",
			),
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
export async function searchBlogPostSummaries(
	query: string,
	limit = 24,
): Promise<BlogPostSummary[]> {
	const result = await queryBlogPostFeed({
		query,
		page: 1,
		pageSize: limit,
	});
	return result.posts;
}

/**
 * getAllPostsForLlm - Retrieves full content and metadata for all published posts.
 * Primarily used by the /llms-full.txt endpoint for LLM context injection.
 */
export async function getAllPostsForLlm() {
	"use cache";
	cacheLife("hours");
	cacheTag("posts", "post-full-content");

	if (!hasUsableDatabaseUrl()) {
		return [];
	}

	try {
		const results = await getAllPostsForSearchQuery();
		return results;
	} catch (err) {
		console.error("[DB ERROR] getAllPostsForLlm failed:", err);
		return [];
	}
}
