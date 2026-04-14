"use client";

import { cn } from "@repo/ui";
import { parseWikiLink, slugifyPath } from "@repo/utils";
import katex from "katex";
import "katex/dist/katex.min.css";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useMemo } from "react";
import { toast } from "@repo/ui";

/**
 * INDUSTRIAL CONSTANTS: Pre-compiled regexes to avoid redundant allocation 
 * in recursive render loops (crucial for streaming performance).
 */
const INLINE_REGEX =
	/(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[+((?:[^[\]]|\[[^\]]*\])*)\]+\(([^)]+)\)\]*|\[(\d+)\]|\[\[([^\]\(\)]+)\]\]|\$([^$]+?)\$|((?:^|\n)\s*[-*+]\s+)|(<br\s*\/?>))/gi;

const HR_REGEX = /^\s*([-*_])\1\1+\s*$/;
const FENCED_CODE_REGEX = /^\s*```\s*(\w*)/;
const MATH_BLOCK_HEADER_REGEX = /^\s*\$\$\s*$/;
const HEADING_REGEX = /^\s*(#{1,6})\s+(.+)/;
const QUOTE_REGEX = /^\s*>\s?(.*)/;
const LIST_ITEM_REGEX = /^\s*([-+*]|\d+\.)\s+(.*)/;
const TABLE_ROW_REGEX = /^\s*\|(.+)\|/;
const TABLE_SEPARATOR_REGEX = /^\s*\|[\s-:|]+\|\s*$/;
const INTERNAL_LINK_REGEX = /^(https?:\/\/)?(sparkle\.codes|example\.com|localhost(:\d+)?)/;

interface Citation {
	id: number;
	title: string;
	slug: string;
	heading?: string;
	headingId?: string;
}

interface ChatMarkdownProps {
	text: string;
	citations?: Citation[];
	onLinkClick?: (url: string) => void;
}

/** Render math using KaTeX */
function MathBlock({ content }: { content: string }) {
	const html = useMemo(() => {
		try {
			return katex.renderToString(content, {
				displayMode: true,
				throwOnError: false,
			});
		} catch {
			return content;
		}
	}, [content]);

	return (
		<div
			className="math-block w-full overflow-x-auto my-4 py-2 scrollbar-thin scrollbar-thumb-foreground/10 hover:scrollbar-thumb-foreground/20 scrollbar-track-transparent"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output is safe here
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

function InlineMath({ content }: { content: string }) {
	const html = useMemo(() => {
		try {
			return katex.renderToString(content, {
				displayMode: false,
				throwOnError: false,
			});
		} catch {
			return content;
		}
	}, [content]);

	return (
		<span
			className="math-inline mx-1"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output is safe here
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

/** Parse a single inline text segment into React nodes (bold, italic, code, links, citations). */
function renderInline(
	text: string,
	keyPrefix: string,
	citations: Citation[] = [],
	router?: any,
	onLinkClick?: (url: string) => void,
): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	let lastIndex = 0;
	// INDUSTRIAL UPGRADE: Create a local copy of the regex to prevent infinite loops
	// during recursion. Shared global regexes with the /g flag maintain state (lastIndex),
	// which causes nested calls to corrupt the outer loop's iteration.
	const localRegex = new RegExp(INLINE_REGEX);
	let match: RegExpExecArray | null = localRegex.exec(text);

	while (match !== null) {
		// --- Text before match ---
		if (match.index > lastIndex) {
			nodes.push(
				<span key={`${keyPrefix}-t-${lastIndex}`}>
					{text.substring(lastIndex, match.index).replace(/\\([_*[\]()$])/g, "$1")}
				</span>,
			);
		}

		const key = `${keyPrefix}-m-${match.index}`;

		if (match[2]) {
			// **bold**
			nodes.push(<strong key={key}>{renderInline(match[2], `${keyPrefix}-b-${match.index}`, citations, router, onLinkClick)}</strong>);
		} else if (match[3]) {
			// *italic*
			nodes.push(<em key={key}>{renderInline(match[3], `${keyPrefix}-i-${match.index}`, citations, router, onLinkClick)}</em>);
		} else if (match[4]) {
			// `code`
			nodes.push(<code key={key}>{match[4]}</code>);
		} else if (match[5]) {
			// [text](url)
			const linkText = match[5];
			const rawHref = match[6];
			
			// Robust Internal Detection: check for leading slash, blog/docs prefixes, or project-specific domains
			const isInternal = rawHref.startsWith("/") || 
				rawHref.startsWith("blog/") || 
				rawHref.startsWith("docs/") ||
				INTERNAL_LINK_REGEX.test(rawHref);
			
			let href = rawHref;
			if (isInternal) {
				// Normalize relative internal links to absolute
				if (!href.startsWith("/") && (href.startsWith("blog/") || href.startsWith("docs/"))) {
					href = `/${href}`;
				}

				// Strip domain to ensure SPA navigation
				href = href.replace(/^https?:\/\/[^/]+/, "");
				
				// Standardize fragment assembly for internal blog links
				const hashIndex = href.indexOf("#");
				if ((href.startsWith("/blog/") || href.startsWith("/docs/")) && hashIndex !== -1) {
					const base = href.substring(0, hashIndex);
					const frag = href.substring(hashIndex + 1);
					const decodedFrag = decodeURIComponent(frag);
					
					// Symmetry Rule: Ensure heading IDs match the Sentinel/Rust output (h-slug)
					const finalFrag = decodedFrag.startsWith("^") 
						? decodedFrag 
						: `h-${slugifyPath(decodedFrag.replace(/^h-/, ""))}`;
					href = `${base}#${finalFrag}`;
				}
			}

			const lowerText = linkText.toLowerCase();
			if (lowerText.startsWith("source:")) {
				// Special Citation Style
				// Why: Citations are rendered as interactive 'Source' buttons that perform path-normalized navigation
				const label = linkText.replace(/source:\s*/i, "");
				nodes.push(
					<Link
						key={key}
						href={href}
						onClick={(e) => {
							if (isInternal && onLinkClick) {
								e.preventDefault();
								onLinkClick(href);
							}
						}}
						className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-[12px] font-bold text-primary/90 hover:bg-primary/20 hover:border-primary/40 transition-all active:scale-95 no-underline mx-1 shadow-sm"
						title={linkText}
					>
						<span className="opacity-60 uppercase tracking-tighter text-[10px]">
							Source:
						</span>
						<span className="truncate max-w-[240px] font-semibold">
							{renderInline(label, `${key}-t`, citations, router, onLinkClick)}
						</span>
					</Link>,
				);
			} else if (/^\[?\d+\]?$/.test(linkText)) {
				// Citation pill with explicit URL
				const citationStr = linkText.replace(/[[\]]/g, '');
				nodes.push(
					<a
						key={key}
						href={href}
						onClick={(e) => {
							if (isInternal && onLinkClick) {
								e.preventDefault();
								onLinkClick(href);
							}
						}}
						target={isInternal ? undefined : "_blank"}
						rel={isInternal ? undefined : "noopener noreferrer"}
						className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded-full bg-primary/10 text-primary border border-primary/20 transition-all active:scale-95 mx-0.5 -translate-y-[2px] no-underline shadow-sm"
						data-cursor="action"
						title={href}
					>
						{citationStr}
					</a>
				);
			} else if (isInternal) {
				// Internal Link: Use the standardized "Reference Card" style for all internal blog navigation
				nodes.push(
					<Link
						key={key}
						href={href}
						onClick={(e) => {
							if (onLinkClick) {
								e.preventDefault();
								onLinkClick(href);
							}
						}}
						className="inline-flex items-center gap-2 pl-2 pr-3 py-1 rounded-sm bg-primary/5 border-l-2 border-primary/40 transition-all active:scale-95 no-underline mx-1 relative top-[-1px] group/wiki shadow-sm"
						title={href}
						data-cursor="link"
					>
						<span className="flex items-center justify-center w-3.5 h-3.5 text-primary/50 transition-colors">
							<Sparkles size={11} strokeWidth={2.5} />
						</span>
						<span className="flex items-center gap-1.5 text-[12px] overflow-hidden">
							<span className="text-[9px] font-black uppercase tracking-[0.1em] text-primary/30 transition-colors shrink-0">REF</span>
							<span className="font-bold text-primary/80 truncate max-w-[200px] tracking-tight">
								{renderInline(linkText, `${key}-in`, citations, router, onLinkClick)}
							</span>
						</span>
					</Link>,
				);
			} else {
				// External Link: Use plain <a> to avoid next/link prefetch on foreign domains
				nodes.push(
					<a
						key={key}
						href={href}
						target="_blank"
						rel="noopener noreferrer"
					>
						{renderInline(linkText, `${key}-in`, citations, router, onLinkClick)}
					</a>,
				);
			}
		} else if (match[7]) {
			// [n] citation
			const citationId = Number.parseInt(match[7], 10);
			const citation = citations.find((c) => c.id === citationId);

			if (citation) {
				nodes.push(
					<button
						type="button"
						key={key}
						onClick={() => {
							const target = `/blog/${citation.slug}${citation.headingId ? `#${citation.headingId}` : ""}`;
							if (onLinkClick) {
								onLinkClick(target);
							} else {
								router.push(target);
							}
						}}
						className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded-full bg-primary/10 text-primary border border-primary/20 transition-all active:scale-95 mx-0.5 -translate-y-[2px] shadow-sm"
						data-cursor="action"
						title={`${citation.title}${citation.heading ? ` - ${citation.heading}` : ""}`}
					>
						{citationId}
					</button>,
				);
			} else {
				nodes.push(<span key={key}>{`[${match[7]}]`}</span>);
			}
		} else if (match[8]) {
			// [[wikilink]]
			const [linkTarget, alias] = match[8].split("|");
			const wiki = parseWikiLink(linkTarget);
			
			// 1. Path De-duplication: Strip redundant blog/ or docs/ prefixes
			// Why: AI often outputs [[blog#title]] which we want to resolve to current page or /blog/
			const cleanedPath = wiki.path
				.replace(/^https?:\/\/[^/]+/, "")
				.replace(/^(blog|docs)\//, "")
				.replace(/^\/+/, "");
			
			// 2. Anchor Idempotency: skip re-slugify if it's already a standard heading ID
			const fragmentId = wiki.fragment 
				? (wiki.isBlock || wiki.fragment.startsWith("h-") 
					? wiki.fragment 
					: `h-${slugifyPath(wiki.fragment)}`)
				: "";
				
			// 3. Absolute Routing: only prefix with /blog/ if it refers to another document
			const isSamePage = !cleanedPath || cleanedPath === "blog" || cleanedPath === "docs";
			const href = isSamePage 
				? (fragmentId ? `#${fragmentId}` : "")
				: `/blog/${slugifyPath(cleanedPath)}${fragmentId ? `#${fragmentId}` : ""}`;
				
			const display = (alias || wiki.basename || wiki.path || wiki.fragment || "").normalize("NFC");

			nodes.push(
				<Link
					key={key}
					href={href}
					onClick={(e) => {
						if (onLinkClick) {
							e.preventDefault();
							onLinkClick(href);
						}
					}}
					className="inline-flex items-center gap-2 pl-2 pr-3 py-1 rounded-sm bg-primary/5 border-l-2 border-primary/40 transition-all active:scale-95 no-underline mx-1 relative top-[-1px] group/wiki shadow-sm"
					title={display}
					data-cursor="link"
				>
					<span className="flex items-center justify-center w-3.5 h-3.5 text-primary/50 transition-colors">
						<Sparkles size={11} strokeWidth={2.5} />
					</span>
					<span className="flex items-center gap-1.5 text-[12px] overflow-hidden">
						<span className="text-[9px] font-black uppercase tracking-[0.1em] text-primary/30 transition-colors shrink-0">REF</span>
						<span className="font-bold text-primary/80 truncate max-w-[200px] tracking-tight">{display}</span>
					</span>
				</Link>,
			);
		} else if (match[9]) {
			// $inline math$
			nodes.push(<InlineMath key={key} content={match[9].replace(/\\_/g, "_")} />);
		} else if (match[10]) {
			// Inline List Bullet
			nodes.push(
				<span key={key} className="inline-block text-primary/80 font-black mr-1.5">
					•
				</span>,
			);
		} else if (match[11]) {
			// <br>
			nodes.push(<br key={key} />);
		}

		lastIndex = localRegex.lastIndex;
		match = localRegex.exec(text);
	}

	if (lastIndex < text.length) {
		const remainingText = text.substring(lastIndex);
		nodes.push(
			<span key={`${keyPrefix}-end`}>
				{remainingText.replace(/\\([_*[\]()$])/g, "$1")}
			</span>,
		);
	}

	return nodes;
}

/**
 */
function parseMarkdown(
	text: string,
	citations: Citation[] = [],
	router?: any,
	onLinkClick?: (url: string) => void,
): React.ReactNode[] {
	if (!text) {
		return [];
	}

	const elements: React.ReactNode[] = [];
	const lines = text.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// 1. Horizontal Rules
		if (HR_REGEX.test(line)) {
			elements.push(
				<hr key={`hr-${i}`} className="my-10 h-0.5 border-0 bg-gradient-to-r from-transparent via-border/80 to-transparent" />,
			);
			i++;
			continue;
		}

		// 2. Fenced Code Blocks
		const codeMatch = line.match(FENCED_CODE_REGEX);
		if (codeMatch) {
			const lang = codeMatch[1] || "text";
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // skip closing ```
			const codeContent = codeLines.join("\n");

			elements.push(
				<div
					key={`code-${i}`}
					className="group/code relative my-6 max-w-full rounded-xl border border-black/20 dark:border-white/10 bg-[#0d1117] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
				>
					<div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
						<span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
							{lang}
						</span>
						<button
							type="button"
							onClick={() => {
								navigator.clipboard.writeText(codeContent);
								toast.success("Copied to clipboard", {
									description: "The code block is ready to paste.",
									duration: 2000,
								});
							}}
							className="text-[10px] font-bold text-zinc-400 hover:text-zinc-100 transition-colors uppercase tracking-tight active:scale-95"
						>
							Copy
						</button>
					</div>
					<pre
						className="p-4 overflow-x-auto text-[13px] leading-relaxed bg-transparent scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scrollbar-track-transparent"
						/* Why color-scheme: dark — The code block has a forced dark bg (#0d1117).
						 * Without this, the browser paints the native overlay scrollbar using the page's
						 * light-mode color scheme, producing a white thumb on a dark background.
						 * This forces the OS-level scrollbar to render in dark mode regardless of page theme. */
						style={{ colorScheme: "dark" }}
					>
						<code className="font-mono text-zinc-200 bg-transparent border-none p-0">
							{codeContent}
						</code>
					</pre>
				</div>,
			);
			continue;
		}

		// 2.5. Math Blocks ($$ ... $$)
		const mathBlockHeaderMatch = line.match(MATH_BLOCK_HEADER_REGEX);
		if (mathBlockHeaderMatch || line.trim().startsWith("$$")) {
			const mathLines: string[] = [];
			const startLine = i;
			
			// Detect single-line block $$ math $$
			if (line.trim().startsWith("$$") && line.trim().endsWith("$$") && line.trim().length > 4) {
				mathLines.push(line.trim().slice(2, -2));
			} else {
				i++;
				while (i < lines.length && !lines[i].trim().startsWith("$$")) {
					mathLines.push(lines[i]);
					i++;
				}
			}
			const mathContent = mathLines.join("\n").replace(/\\_/g, "_");
			elements.push(<MathBlock key={`math-${startLine}`} content={mathContent} />);
			i++;
			continue;
		}

		// 3. Headings
		const headingMatch = line.match(HEADING_REGEX);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
			elements.push(
				<Tag key={`h-${i}`}>
					{renderInline(
						headingMatch[2],
						`h${i}`,
						citations,
						router,
						onLinkClick,
					)}
				</Tag>,
			);
			i++;
			continue;
		}

		// 4. Blockquotes
		const quoteMatch = line.match(QUOTE_REGEX);
		if (quoteMatch) {
			const quoteLines: string[] = [];
			while (i < lines.length) {
				const currentQuoteMatch = lines[i].match(QUOTE_REGEX);
				if (!currentQuoteMatch && lines[i].trim() !== "") {
					break;
				}
				quoteLines.push(currentQuoteMatch ? currentQuoteMatch[1] : "");
				i++;
			}
			elements.push(
				<blockquote key={`bq-${i}`} className="pl-4 pr-2 py-1 my-4 border-l-4 border-primary/30 bg-primary/5 rounded-r-lg text-muted-foreground">
					{renderInline(
						quoteLines.join("\n"),
						`bq${i}`,
						citations,
						router,
						onLinkClick,
					)}
				</blockquote>,
			);
			continue;
		}

		// 5. Lists
		const listMatch = line.match(LIST_ITEM_REGEX);
		if (listMatch) {
			const listType = /^\d/.test(listMatch[1]) ? "ol" : "ul";
			const items: React.ReactNode[] = [];
			const indent = line.search(/\S/);
	
			while (i < lines.length) {
				const listItemMatch = lines[i].match(LIST_ITEM_REGEX);
				if (!listItemMatch) {
					break;
				}

				const currentIndent = lines[i].search(/\S/);
				if (currentIndent < indent) {
					break;
				}

				items.push(
					<li key={`li-${i}`}>
						{renderInline(listItemMatch[2], `li${i}`, citations, router, onLinkClick)}
					</li>,
				);
				i++;
			}
			const ListTag = listType;
			elements.push(<ListTag key={`list-${i}`}>{items}</ListTag>);
			continue;
		}

		// 5. Tables
		const tableMatch = line.match(TABLE_ROW_REGEX);
		if (tableMatch) {
			const tableRows: string[][] = [];
			let hasSeparator = false;
	
			while (i < lines.length && lines[i].match(TABLE_ROW_REGEX)) {
				const rowLine = lines[i].trim();
				// Check for separator line: |---| or | :--- |
				if (TABLE_SEPARATOR_REGEX.test(rowLine)) {
					hasSeparator = true;
					i++;
					continue;
				}

				// SMART SPLIT: Protect pipes inside [[wiki-links|alias]]
				const protectedLine = rowLine.replace(
					/\[\[([^\]]+)\|([^\]]+)\]\]/g,
					"[[$1__WIKI_PIPE__$2]]",
				);

				const cells = protectedLine
					.split("|")
					.filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
					.map((c) => c.trim().replace(/__WIKI_PIPE__/g, "|"));

				tableRows.push(cells);
				i++;
			}

			if (hasSeparator && tableRows.length > 0) {
				const header = tableRows[0];
				const body = tableRows.slice(1);

				elements.push(
					<div
						key={`table-${i}`}
						className="my-6 w-full overflow-x-auto rounded-xl border border-border/20 bg-muted/30 shadow-sm"
					>
						<table className="w-full border-collapse text-left text-[13.5px]">
							<thead>
								<tr className="border-b border-border/20 bg-muted/50">
									{header.map((cell, idx) => (
										<th
											key={`th-${idx}`}
											className="px-4 py-3 font-black uppercase tracking-wider text-primary/70"
										>
											{renderInline(cell, `th-${i}-${idx}`, citations, router, onLinkClick)}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-border/10">
								{body.map((row, rowIdx) => (
									<tr
										key={`tr-${rowIdx}`}
										className="hover:bg-muted/50 transition-colors"
									>
										{row.map((cell, cellIdx) => (
											<td key={`td-${cellIdx}`} className="px-4 py-3 text-foreground/80">
												{renderInline(cell, `td-${i}-${rowIdx}-${cellIdx}`, citations, router, onLinkClick)}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>,
				);
				continue;
			}
			// If not a valid table, fallback to paragraph logic by NOT continuing
		}

		// 6. Normal Paragraphs
		if (line.trim()) {
			elements.push(
				<p key={`p-${i}`}>
					{renderInline(line.trim(), `p${i}`, citations, router, onLinkClick)}
				</p>,
			);
		}
		i++;
	}
	return elements;
}

export function ChatMarkdown({
	text,
	citations = [],
	onLinkClick,
	className,
}: ChatMarkdownProps & { className?: string }) {
	const router = useRouter();
	const rendered = useMemo(
		() => parseMarkdown(text, citations, router, onLinkClick),
		[text, citations, router, onLinkClick],
	);
	return (
		<div
			className={cn(
				"markdown-body !max-w-full !m-0 !text-left break-words overflow-x-auto scrollbar-thin scrollbar-thumb-foreground/10 hover:scrollbar-thumb-foreground/20 scrollbar-track-transparent",
				// Custom overrides for chat context:
				// - Disable italics for blockquotes (looks cleaner in chat)
				"[&_blockquote]:font-normal [&_blockquote]:italic-none [&_blockquote]:not-italic",
				className,
			)}
			style={
				{
					"--md-max-width": "100%",
					fontSize: "15.5px",
					background: "transparent",
					lineHeight: "1.6",
				} as any
			}
		>
			{rendered}
		</div>
	);
}
