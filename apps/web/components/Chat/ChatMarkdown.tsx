"use client";

import { cn } from "@repo/ui";
import { parseWikiLink, slugifyPath } from "@repo/utils";
import { useRouter } from "next/navigation";
import React, { useMemo } from "react";
import { toast } from "sonner";

/**
 * Lightweight Markdown renderer for streaming AI chat responses.
 *
 * Design Decisions:
 * - Zero external dependencies (no react-markdown, no remark).
 * - Handles the subset of Markdown that LLMs actually produce:
 *   headings, bold, italic, inline code, fenced code blocks,
 *   ordered/unordered lists, links, horizontal rules, blockquotes.
 * - Streaming-safe: works correctly with partially-arrived text.
 * - Does NOT use dangerouslySetInnerHTML — all output is React nodes.
 */

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

/** Parse a single inline text segment into React nodes (bold, italic, code, links, citations). */
function renderInline(
	text: string,
	keyPrefix: string,
	citations: Citation[] = [],
	router?: any,
	onLinkClick?: (url: string) => void,
): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	// Matches: **bold**, *italic*, `code`, [text](url), [n] citation, [[wikilink]]
	const inlineRegex =
		/(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\[(\d+)\]|\[\[([^\]]+)\]\]|((?:^|(?<=<br\s*\/?>))\s*[-*+]\s+)|(<br\s*\/?>))/gi;
	let lastIndex = 0;
	let match: RegExpExecArray | null = inlineRegex.exec(text);

	while (match !== null) {
		// --- Text before match ---
		if (match.index > lastIndex) {
			nodes.push(
				<span key={`${keyPrefix}-t-${lastIndex}`}>
					{text.substring(lastIndex, match.index)}
				</span>,
			);
		}

		const key = `${keyPrefix}-m-${match.index}`;

		if (match[2]) {
			// **bold**
			nodes.push(<strong key={key}>{match[2]}</strong>);
		} else if (match[3]) {
			// *italic*
			nodes.push(<em key={key}>{match[3]}</em>);
		} else if (match[4]) {
			// `code`
			nodes.push(<code key={key}>{match[4]}</code>);
		} else if (match[5]) {
			// [text](url)
			const linkText = match[5];
			const href = match[6];

			if (linkText.startsWith("Source:")) {
				// Special Citation Style
				nodes.push(
					<button
						key={key}
						type="button"
						onClick={() =>
							onLinkClick ? onLinkClick(href) : router.push(href)
						}
						className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/[0.04] dark:bg-primary/[0.08] border border-primary/20 text-[12px] font-bold text-primary/90 hover:bg-primary/10 hover:border-primary/40 transition-all no-underline mx-1"
						title={linkText}
					>
						<span className="opacity-60 uppercase tracking-tighter text-[10px]">
							Source:
						</span>
						<span className="truncate max-w-[240px] font-semibold">
							{linkText.replace("Source: ", "")}
						</span>
					</button>,
				);
			} else {
				const isInternal =
					href.startsWith("/") || href.includes("sparkle.codes");
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
					>
						{linkText}
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
						className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white transition-all mx-0.5 -translate-y-[2px]"
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
			const [linkPart, alias] = match[8].split("|");
			const wiki = parseWikiLink(linkPart);
			const slug = slugifyPath(wiki.path);
			const href = `/blog/${slug}${wiki.fragment ? `#${wiki.fragment}` : ""}`;
			const display = alias || wiki.basename || wiki.path;

			nodes.push(
				<button
					key={key}
					type="button"
					onClick={() => (onLinkClick ? onLinkClick(href) : router.push(href))}
					className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/[0.04] dark:bg-primary/[0.08] border border-primary/20 text-[12px] font-bold text-primary/90 hover:bg-primary/10 hover:border-primary/40 transition-all no-underline mx-1"
					title={`Source: ${display}`}
				>
					<span className="opacity-60 uppercase tracking-tighter text-[10px]">
						Source:
					</span>
					<span className="truncate max-w-[240px] font-semibold">
						{display}
					</span>
				</button>,
			);
		} else if (match[9]) {
			// Inline List Bullet (Now Group 9)
			nodes.push(
				<span key={key} className="inline-block text-primary/80 font-black mr-1.5">
					•
				</span>,
			);
		} else if (match[10]) {
			// <br> (Now Group 10)
			nodes.push(<br key={key} />);
		}

		lastIndex = inlineRegex.lastIndex;
		match = inlineRegex.exec(text);
	}

	if (lastIndex < text.length) {
		nodes.push(
			<span key={`${keyPrefix}-end`}>{text.substring(lastIndex)}</span>,
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
		if (line.match(/^\s*([-*_])\1\1+\s*$/)) {
			elements.push(
				<hr key={`hr-${i}`} className="my-6 border-t border-border/10" />,
			);
			i++;
			continue;
		}

		// 2. Fenced Code Blocks
		const codeMatch = line.match(/^\s*```\s*(\w*)/);
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
					className="group/code relative my-6 max-w-full rounded-xl border border-border/10 bg-black/[0.02] dark:bg-white/[0.02] overflow-hidden"
				>
					<div className="flex items-center justify-between px-4 py-2 border-b border-border/5 bg-black/[0.02] dark:bg-white/[0.02]">
						<span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
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
							className="text-[10px] font-bold text-primary/40 hover:text-primary transition-colors uppercase tracking-tight"
						>
							Copy
						</button>
					</div>
					<pre className="p-4 overflow-x-auto text-[13px] leading-relaxed bg-transparent">
						<code className="font-mono text-foreground/80 bg-transparent border-none p-0">
							{codeContent}
						</code>
					</pre>
				</div>,
			);
			continue;
		}

		// 3. Headings
		const headingMatch = line.match(/^\s*(#{1,6})\s+(.+)/);
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
		const quoteMatch = line.match(/^\s*>\s?(.*)/);
		if (quoteMatch) {
			const quoteLines: string[] = [];
			while (i < lines.length) {
				const currentQuoteMatch = lines[i].match(/^\s*>\s?(.*)/);
				if (!currentQuoteMatch && lines[i].trim() !== "") {
					break;
				}
				quoteLines.push(currentQuoteMatch ? currentQuoteMatch[1] : "");
				i++;
			}
			elements.push(
				<blockquote key={`bq-${i}`}>
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
		const listMatch = line.match(/^\s*([-+*]|\d+\.)\s+(.*)/);
		if (listMatch) {
			const listType = /^\d/.test(listMatch[1]) ? "ol" : "ul";
			const items: React.ReactNode[] = [];
			const indent = line.search(/\S/);

			while (i < lines.length) {
				const listItemMatch = lines[i].match(/^\s*([-+*]|\d+\.)\s+(.*)/);
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
		const tableMatch = line.match(/^\s*\|(.+)\|/);
		if (tableMatch) {
			const tableRows: string[][] = [];
			let hasSeparator = false;

			while (i < lines.length && lines[i].match(/^\s*\|(.+)\|/)) {
				const rowLine = lines[i].trim();
				// Check for separator line: |---| or | :--- |
				if (rowLine.match(/^\s*\|[\s-:|]+\|\s*$/)) {
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
						className="my-6 w-full overflow-x-auto rounded-xl border border-border/10 bg-black/[0.01] dark:bg-white/[0.01]"
					>
						<table className="w-full border-collapse text-left text-[13.5px]">
							<thead>
								<tr className="border-b border-border/10 bg-black/[0.02] dark:bg-white/[0.02]">
									{header.map((cell, idx) => (
										<th
											key={`th-${idx}`}
											className="px-4 py-2.5 font-black uppercase tracking-wider text-primary/70"
										>
											{renderInline(cell, `th-${i}-${idx}`, citations, router, onLinkClick)}
										</th>
									))}
								</tr>
							</thead>
							<tbody className="divide-y divide-border/5">
								{body.map((row, rowIdx) => (
									<tr
										key={`tr-${rowIdx}`}
										className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
									>
										{row.map((cell, cellIdx) => (
											<td key={`td-${cellIdx}`} className="px-4 py-2.5 text-foreground/80">
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
				"markdown-body !max-w-full break-words overflow-x-auto",
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
