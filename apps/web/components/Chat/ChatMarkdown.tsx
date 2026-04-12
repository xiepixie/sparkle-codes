"use client";

import React, { useMemo } from "react";
import { parseWikiLink, slugifyPath } from "@repo/utils";
import { cn } from "@repo/ui";

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
}

/** Parse a single inline text segment into React nodes (bold, italic, code, links, citations). */
function renderInline(text: string, keyPrefix: string, citations: Citation[] = []): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	// Matches: **bold**, *italic*, `code`, [text](url), [n] citation, [[wikilink]]
	const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\[(\d+)\]|\[\[([^\]]+)\]\])/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null = inlineRegex.exec(text);

	while (match !== null) {
		// --- Text before match ---
		if (match.index > lastIndex) {
			nodes.push(<span key={`${keyPrefix}-t-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
		}

		const key = `${keyPrefix}-m-${match.index}`;

		if (match[2]) {
			// **bold**
			nodes.push(<strong key={key} className="font-bold text-foreground">{match[2]}</strong>);
		} else if (match[3]) {
			// *italic*
			nodes.push(<em key={key} className="italic text-foreground/90">{match[3]}</em>);
		} else if (match[4]) {
			// `code`
			nodes.push(
				<code
					key={key}
					className="px-1.5 py-0.5 rounded-md bg-foreground/[0.03] dark:bg-white/5 text-primary/90 dark:text-primary font-mono text-[0.9em] border border-border/10"
				>
					{match[4]}
				</code>
			);
		} else if (match[5]) {
			// [text](url)
			nodes.push(
				<a
					key={key}
					href={match[6]}
					target="_blank"
					rel="noopener noreferrer"
					className="text-primary hover:underline underline-offset-4 decoration-primary/30"
				>
					{match[5]}
				</a>
			);
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
							if (window.location.pathname.includes(citation.slug)) {
								const el = document.getElementById(citation.headingId || "");
								if (el) {
									el.scrollIntoView({ behavior: 'smooth' });
								}
							} else {
								window.location.href = `/blog/${citation.slug}${citation.headingId ? `#${citation.headingId}` : ""}`;
							}
						}}
						className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-black rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white transition-all mx-0.5 -translate-y-[2px]"
						title={`${citation.title}${citation.heading ? ` - ${citation.heading}` : ""}`}
					>
						{citationId}
					</button>
				);
			} else {
				nodes.push(`[${match[7]}]`);
			}
		} else if (match[8]) {
			// [[target#fragment|alias]] (Obsidian/Wiki style)
			const content = match[8];
			const [linkPart, alias] = content.split("|");
			const wiki = parseWikiLink(linkPart);
			
			// We prioritize the path provided in the linkPart (already a slug from AI)
			const slug = slugifyPath(wiki.path);
			const fragment = wiki.fragment ? `#${wiki.fragment}` : "";
			const href = `/blog/${slug}${fragment}`;
			const display = alias || wiki.basename || wiki.path;

			nodes.push(
				<a
					key={key}
					href={href}
					className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/[0.04] dark:bg-primary/[0.08] border border-primary/20 text-[12px] font-bold text-primary/90 hover:bg-primary/10 hover:border-primary/40 transition-all no-underline mx-1"
					title={`Source: ${display}${wiki.fragment ? ` (#${wiki.fragment})` : ""}`}
				>
					<span className="opacity-60 uppercase tracking-tighter text-[10px]">Source:</span>
					<span className="truncate max-w-[240px] font-semibold">{display}</span>
				</a>
			);
		}

		lastIndex = (match.index ?? 0) + match[0].length;
		match = inlineRegex.exec(text);
	}

	// Push remaining text
	if (lastIndex < text.length) {
		nodes.push(text.substring(lastIndex));
	}

	return nodes;
}

/** 
 * Parse full markdown text into React elements.
 */
function parseMarkdown(text: string, citations: Citation[] = []): React.ReactNode[] {
	if (!text) {
		return [];
	}

	const elements: React.ReactNode[] = [];
	const lines = text.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// --- Fenced code block ---
		const codeMatch = line.match(/^```(\w*)/);
		if (codeMatch) {
			const lang = codeMatch[1] || "";
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // skip closing ```

			elements.push(
				<div key={`code-${i}`} className="my-5 rounded-xl overflow-hidden border border-border/10 bg-black/5 dark:bg-black/20">
					{lang && (
						<div className="px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 border-b border-border/5 bg-white/2">
							{lang}
						</div>
					)}
					<pre className="p-4 overflow-x-auto text-[13px] leading-relaxed">
						<code className="font-mono text-foreground/80">{codeLines.join("\n")}</code>
					</pre>
				</div>
			);
			continue;
		}

		// --- Heading ---
		const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const content = headingMatch[2];
			const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
			const sizeClasses: Record<number, string> = {
				1: "text-lg font-black mt-8 mb-4",
				2: "text-base font-black mt-6 mb-3",
				3: "text-sm font-black mt-5 mb-2",
				4: "text-sm font-bold mt-4 mb-2",
			};
			elements.push(
				<Tag key={`h-${i}`} className={cn(sizeClasses[level] || sizeClasses[4], "text-foreground leading-tight tracking-tight")}>
					{renderInline(content, `h${i}`, citations)}
				</Tag>
			);
			i++;
			continue;
		}

		// --- Horizontal rule ---
		if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			elements.push(
				<hr key={`hr-${i}`} className="my-8 border-t border-border/10" />
			);
			i++;
			continue;
		}

		// --- Blockquote ---
		if (line.startsWith("> ")) {
			const quoteLines: string[] = [];
			while (i < lines.length && lines[i].startsWith("> ")) {
				quoteLines.push(lines[i].replace(/^>\s?/, ""));
				i++;
			}
			elements.push(
				<blockquote
					key={`bq-${i}`}
					className="my-4 pl-4 border-l-2 border-primary/20 text-foreground/70 dark:text-muted-foreground italic leading-relaxed"
				>
					{renderInline(quoteLines.join(" "), `bq${i}`, citations)}
				</blockquote>
			);
			continue;
		}

		// --- Unordered list ---
		if (/^[-*+]\s+/.test(line)) {
			const items: React.ReactNode[] = [];
			while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
				items.push(
					<li key={`ul-${i}`} className="relative pl-6 py-0.5">
						<span className="absolute left-1 top-[0.6em] w-1.5 h-[1.5px] bg-primary/40 rounded-full" />
						{renderInline(lines[i].replace(/^[-*+]\s+/, ""), `uli${i}`, citations)}
					</li>
				);
				i++;
			}
			elements.push(
				<ul key={`ul-block-${i}`} className="my-4 space-y-1.5">
					{items}
				</ul>
			);
			continue;
		}

		// --- Ordered list ---
		if (/^\d+\.\s+/.test(line)) {
			const items: React.ReactNode[] = [];
			while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
				items.push(
					<li key={`ol-${i}`} className="relative pl-6 py-0.5">
						<span className="absolute left-0 top-[0.3em] text-[10px] font-black text-primary/30 tabular-nums">
							{lines[i].match(/^(\d+)/)?.[1]}.
						</span>
						{renderInline(lines[i].replace(/^\d+\.\s+/, ""), `oli${i}`, citations)}
					</li>
				);
				i++;
			}
			elements.push(
				<ol key={`ol-block-${i}`} className="my-4 space-y-1.5">
					{items}
				</ol>
			);
			continue;
		}

		// --- Empty line → spacing ---
		if (line.trim() === "") {
			i++;
			continue;
		}

		// --- Paragraph (default) ---
		elements.push(
			<p key={`p-${i}`} className="my-3 leading-[1.7] text-foreground dark:text-foreground/85">
				{renderInline(line, `p${i}`, citations)}
			</p>
		);
		i++;
	}

	return elements;
}

/**
 * ChatMarkdown — premium, streaming-safe markdown renderer with citation support.
 */
export function ChatMarkdown({ text, citations = [] }: ChatMarkdownProps) {
	const rendered = useMemo(() => parseMarkdown(text, citations), [text, citations]);
	return <div className="chat-markdown">{rendered}</div>;
}
