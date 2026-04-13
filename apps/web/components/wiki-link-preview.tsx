import { cn } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import {
	isSameWikiPage,
	normalizeSlug,
	parseWikiLink,
	slugifyPath,
} from "@repo/utils";
import DOMPurify from "dompurify";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPostPreview } from "../app/actions/preview";
import { MarkdownSnippet } from "./markdown-snippet";

export interface PreviewData {
	title?: string;
	slug?: string;
	description?: string;
	area?: string;
	status?: string;
	tags?: string[];
	htmlContent?: string;
	isFragment?: boolean;
	fragmentType?: "heading" | "block";
}

/**
 * Extract a fragment section from the current page DOM.
 * Uses multiple strategies: direct ID lookup, heading slug match, block anchor.
 * Returns an HTML snippet of the heading + following content (up to the next heading of same/higher level).
 */
function extractFragmentFromDOM(
	container: HTMLElement,
	fragment: string,
): string | null {
	// 🛡️ [Architecture] Fragment is now a direct DOM ID pre-slugified by Rust backend
	const decodedFragment = (() => {
		try {
			return decodeURIComponent(
				fragment.startsWith("#") ? fragment.slice(1) : fragment,
			);
		} catch {
			return fragment.startsWith("#") ? fragment.slice(1) : fragment;
		}
	})();

	const targetEl = container.querySelector(
		`[id="${CSS.escape(decodedFragment)}"]`,
	) as HTMLElement | null;

	if (!targetEl) {
		return null;
	}

	// For block anchors (<span class="block-ref-anchor" id="^...">), return the content of the parent block + context heading
	if (targetEl.classList.contains("block-ref-anchor")) {
		const parent = targetEl.parentElement;
		if (parent) {
			// Find the nearest preceding heading for structural context
			let prevHeading: HTMLElement | null = null;
			let curr: Element | null = parent;
			// If parent is the heading itself, don't look further
			if (parent.tagName.match(/^H(\d)$/i)) {
				prevHeading = null; // We are already in the heading
			} else {
				while (curr && !prevHeading) {
					curr = curr.previousElementSibling;
					if (curr?.tagName.match(/^H(\d)$/i)) {
						prevHeading = curr as HTMLElement;
					}
				}
			}

			const headingHtml = prevHeading
				? `<div class="preview-context-heading -mx-6 px-6 pointer-events-none sticky top-0 bg-background/80 backdrop-blur-lg z-20 shadow-sm py-2.5 border-b border-primary/5 flex items-center gap-2.5 mb-4 mb-2">
           <div class="w-1 h-3.5 bg-primary/40 rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]"></div>
           <div class="flex-1 min-w-0 [&_*]:!m-0 [&_*]:!text-sm [&_*]:!font-bold [&_*]:!text-muted-foreground [&_*]:truncate [&_*]:!leading-tight">
             ${prevHeading.outerHTML}
           </div>
         </div>`
				: "";

			// We return the heading context and the target block
			// Use outerHTML to preserve <li> or <p> or <hX> tags for correct styling
			let contentHtml = parent.outerHTML;
			if (parent.tagName === "LI") {
				// Wrap in a list container to ensure marker rendering
				contentHtml = `<ul class="list-none !pl-0 !ml-0 my-0"> ${contentHtml} </ul>`;
			}

			return `
        ${headingHtml}
        <div class="wiki-block-highlight highlight-target my-1 relative border-l-2 border-primary/20 pl-4 py-1.5 -ml-1 transition-colors hover:border-primary/40" data-block-id="${targetEl.id}">
           <div class="relative z-10 [&_*:first-child]:!mt-0 [&_*:last-child]:!mb-0">${contentHtml}</div>
        </div>`;
		}
		return null;
	}

	// For headings, collect content until the next heading of same or higher level
	const headingMatch = targetEl.tagName.match(/^H(\d)$/i);
	if (headingMatch) {
		const level = Number.parseInt(headingMatch[1], 10);
		// Include the heading itself (with its original ID for any relative links)
		const parts: string[] = [targetEl.outerHTML];

		let sibling = targetEl.nextElementSibling;
		let collectedLength = 0;
		const MAX_CHARS = 1500; // Increased limit for better context

		while (sibling && collectedLength < MAX_CHARS) {
			// Stop at next heading of same or higher level
			const sibMatch = sibling.tagName.match(/^H(\d)$/i);
			if (sibMatch && Number.parseInt(sibMatch[1], 10) <= level) {
				break;
			}
			parts.push(sibling.outerHTML);
			collectedLength += (sibling.textContent || "").length;
			sibling = sibling.nextElementSibling;
		}

		return `<div class="preview-section-context px-1 [&_*:first-child]:!mt-0 [&_*:last-child]:!mb-0">${parts.join("")}</div>`;
	}

	// Fallback: return the element itself wrapped in a highlight container
	return `<div class="highlight-target bg-primary/[0.04] p-5 rounded-[var(--radius-lg)] border border-primary/10 shadow-sm leading-relaxed [&_*:first-child]:!mt-0 [&_*:last-child]:!mb-0">${targetEl.outerHTML}</div>`;
}

export function WikiLinkPreviewManager({
	containerRef,
	currentSlug,
	currentPostMeta,
	onNavigate,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
	currentSlug?: string;
	currentPostMeta?: PreviewData;
	onNavigate?: (targetUrl: string, href?: string) => void;
}) {
	const [hoveredLink, setHoveredLink] = useState<{
		element: HTMLElement;
		slug: string;
		href: string | null;
	} | null>(null);
	const [previewData, setPreviewData] = useState<PreviewData | "error" | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);

	// Positional states
	const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
	const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
	const cardRef = useRef<HTMLDivElement>(null);
	const [isHoveringCard, setIsHoveringCard] = useState(false);
	const [isCalculated, setIsCalculated] = useState(false);

	// Mounted state for portal context
	const [mounted, setMounted] = useState(false);

	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// LRU cache inside ref
	const cacheRef = useRef<
		Map<string, { data: PreviewData; timestamp: number }>
	>(new Map());
	const CACHE_TTL = 5 * 60 * 1000;

	const router = useRouter();

	const hoveredLinkRef = useRef(hoveredLink);
	hoveredLinkRef.current = hoveredLink;

	const isHoveringCardRef = useRef(isHoveringCard);
	isHoveringCardRef.current = isHoveringCard;

	useEffect(() => {
		setMounted(true);
		const container = containerRef.current;
		if (!container) {
			return;
		}

		let isTouch = false;

		const handlePreviewTrigger = (
			link: HTMLElement,
			_e?: MouseEvent | TouchEvent,
		) => {
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current);
			}

			const slug = link.dataset.target || link.getAttribute("href");
			if (!slug) {
				return;
			}

			if (hoveredLinkRef.current?.element === link) {
				return;
			}

			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			timeoutRef.current = setTimeout(
				async () => {
					const documentId = link.dataset.documentId;
					const href = link.getAttribute("href") || slug;

					// 1. 使用协议层统一解析 (Layer 1: Resolution)
					const linkInfo = parseWikiLink(href);
					const fragment = linkInfo.fragment || "";

					// 2. 将解析后的路径转换为 Target Slug (Layer 2: Slugify)
					const normalizedPath = linkInfo.path
						? normalizeSlug(linkInfo.path)
						: "";
					const targetDocId = slugifyPath(normalizedPath) || currentSlug || "";

					// 3. 构造 Cache Key (优先使用 documentId 实现 O(1) 匹配)
					// 格式: UUID[#fragment] 或 slug[#fragment]
					const cacheKey = documentId
						? `${documentId}${fragment ? `#${fragment}` : ""}`
						: fragment
							? `${targetDocId}#${fragment}`
							: targetDocId;

					setHoveredLink({
						element: link as HTMLElement,
						slug: cacheKey,
						href,
					});
					setIsLoading(true);
					setPreviewData(null);
					// Reset calculation state for each new link
					setIsCalculated(false);

					// Capture anchor coordinates immediately to provide a stable reference
					const rect = link.getBoundingClientRect();
					setCardPos({
						top: rect.bottom + window.scrollY,
						left: rect.left + window.scrollX,
					});
					setPlacement("bottom");

					try {
						// 4. 同一文档判定 (基于 Wiki-Link 规范协议)
						// 使用 isSameWikiPage 来处理 [[文件名]] 这种不需要完整路径也能匹配当前文档的情况
						const isSameDocument = isSameWikiPage(
							targetDocId,
							currentSlug || "",
						);

						if (isSameDocument) {
							// ... [omitting rest of same-page logic for brevity as it's already robust enough]
							// For fragment links to the current document, try to extract the target section from DOM
							const fragment = linkInfo.fragment || "";
							if (fragment && containerRef.current) {
								const fragmentHtml = extractFragmentFromDOM(
									containerRef.current,
									fragment,
								);
								if (fragmentHtml) {
									setPreviewData({
										...currentPostMeta,
										title: currentPostMeta?.title || "Current Document",
										slug: currentSlug || currentPostMeta?.slug,
										htmlContent: fragmentHtml,
									});
									setIsLoading(false);
									return;
								}
							}
							setPreviewData({
								...(currentPostMeta || {
									title: "Current Document",
									description: "You are already reading this document.",
								}),
								slug: currentSlug || currentPostMeta?.slug,
							});
							setIsLoading(false);
							return;
						}

						// Cache check (Phase 2)
						const cached = cacheRef.current.get(cacheKey);
						if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
							setPreviewData(cached.data);
							setIsLoading(false);
							return;
						}

						const data = await getPostPreview(href, documentId);
						if (data) {
							cacheRef.current.set(cacheKey, { data, timestamp: Date.now() });
						}
						setPreviewData(data || "error");
					} catch (error) {
						console.error("Failed to load preview", error);
						setPreviewData("error");
					} finally {
						setIsLoading(false);
					}
				},
				isTouch ? 300 : 500,
			);
		};

		const handleMouseOver = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const link = target.closest(
				"a.wiki-link, a.internal-link",
			) as HTMLElement;
			if (link) {
				handlePreviewTrigger(link, e);
			}
		};

		const handleMouseOut = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const link = target.closest("a.wiki-link, a.internal-link");
			if (link) {
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}
				closeTimeoutRef.current = setTimeout(() => {
					if (!isHoveringCardRef.current) {
						setHoveredLink(null);
						setPreviewData(null);
					}
				}, 300);
			}
		};

		// Touch events for mobile (Phase 8)
		const handleTouchStart = (e: TouchEvent) => {
			isTouch = true;
			const target = e.target as HTMLElement;
			const link = target.closest(
				"a.wiki-link, a.internal-link",
			) as HTMLElement;
			if (link) {
				handlePreviewTrigger(link, e);
			}
		};

		const handleTouchEnd = () => {
			if (timeoutRef.current && isTouch) {
				clearTimeout(timeoutRef.current);
			}
		};

		container.addEventListener("mouseover", handleMouseOver);
		container.addEventListener("mouseout", handleMouseOut);
		container.addEventListener("touchstart", handleTouchStart, {
			passive: true,
		});
		container.addEventListener("touchend", handleTouchEnd);

		// Global click listener to close card on mobile when clicked outside
		const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
			if (hoveredLinkRef.current && cardRef.current) {
				const target = e.target as Node;
				if (
					!cardRef.current.contains(target) &&
					!hoveredLinkRef.current.element.contains(target)
				) {
					setHoveredLink(null);
					setPreviewData(null);
				}
			}
		};
		document.addEventListener("click", handleGlobalClick);
		document.addEventListener("touchstart", handleGlobalClick, {
			passive: true,
		});

		return () => {
			container.removeEventListener("mouseover", handleMouseOver);
			container.removeEventListener("mouseout", handleMouseOut);
			container.removeEventListener("touchstart", handleTouchStart);
			container.removeEventListener("touchend", handleTouchEnd);
			document.removeEventListener("click", handleGlobalClick);
			document.removeEventListener("touchstart", handleGlobalClick);
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current);
			}
		};
	}, [containerRef, currentSlug, currentPostMeta]);

	// Industrial-grade coordinate calibration
	useLayoutEffect(() => {
		if (hoveredLink && cardRef.current && typeof window !== "undefined") {
			const link = hoveredLink.element;
			const linkRect = link.getBoundingClientRect();

			// Use a persistent reference to the card DOM node to measure real dimensions
			// Note: cardRef.current might be rendering 'loading' or 'content' states
			const cardRect = cardRef.current.getBoundingClientRect();

			// Industrial placement constants
			const GAP = 12; // Slightly larger gap for airier feel
			const MARGIN = 16;
			const VIEWPORT_WIDTH = window.innerWidth;
			const VIEWPORT_HEIGHT = window.innerHeight;

			// 1. Calculate ideal horizontal position (align with link start)
			let x = linkRect.left + window.scrollX;

			// 2. Adjust for right viewport overflow
			if (x + cardRect.width > VIEWPORT_WIDTH - MARGIN) {
				x = VIEWPORT_WIDTH - cardRect.width - MARGIN;
			}

			// 3. Adjust for left viewport overflow
			if (x < MARGIN) {
				x = MARGIN;
			}

			// 4. Vertical Placement Strategy (Flipping)
			// We prefer 'bottom' but flip to 'top' if space is insufficient.
			// Once data is loaded (previewData is set), we stick to the decision to avoid jumping.
			let y: number;
			let newPlacement: "top" | "bottom";

			const spaceBelow = VIEWPORT_HEIGHT - linkRect.bottom;
			const spaceAbove = linkRect.top;

			// Heuristic: If we are already calculated, don't flip unless strictly necessary
			const shouldFlip =
				!isCalculated &&
				spaceBelow < cardRect.height + GAP &&
				spaceAbove > spaceBelow;

			if (shouldFlip) {
				y = linkRect.top + window.scrollY - cardRect.height - GAP;
				newPlacement = "top";
			} else {
				y = linkRect.bottom + window.scrollY + GAP;
				newPlacement = "bottom";
			}

			// 5. Vertical boundary safety (ensure it's not off-screen if it's too tall)
			const topViewportBound = window.scrollY + MARGIN;
			if (newPlacement === "top" && y < topViewportBound) {
				y = topViewportBound;
			}

			// Avoid sub-pixel rendering blur
			setCardPos({ top: Math.round(y), left: Math.round(x) });
			setPlacement(newPlacement);

			// Confirm calibration completion
			// We use a double-frame wait to ensure height has settled
			const frame = requestAnimationFrame(() => setIsCalculated(true));
			return () => cancelAnimationFrame(frame);
		}
	}, [hoveredLink, previewData, isLoading, isCalculated]);

	const handleCardMouseEnter = () => {
		setIsHoveringCard(true);
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
		}
	};

	const handleCardMouseLeave = () => {
		setIsHoveringCard(false);
		closeTimeoutRef.current = setTimeout(() => {
			setHoveredLink(null);
			setPreviewData(null);
		}, 300);
	};

	const handleNavigate = (targetUrl: string, href?: string) => {
		setHoveredLink(null);
		setIsLoading(false);
		setPreviewData(null);
		if (onNavigate) {
			onNavigate(targetUrl, href);
		} else if (href) {
			router.push(href);
		}
	};

	const resolveTargetUrl = (): string => {
		// DO NOT trust hoveredLink.href's pathname blindly, as Rust cannot yet pre-resolve hierarchical slugs.
		// Instead, ALWAYS prefer the database-validated canonical slug.
		const target = hoveredLink?.slug || "";
		const decodedTarget = decodeURIComponent(target);
		const linkInfo = parseWikiLink(decodedTarget);
		const hasValidPreview = previewData && typeof previewData !== "string";
		const canonicalSlug = hasValidPreview ? previewData.slug : null;

		// The core resolution: Database Truth > Heuristic > Current Post
		const mainSlug =
			canonicalSlug || slugifyPath(normalizeSlug(linkInfo.path)) || currentSlug;

		let fragment = linkInfo.fragment || "";
		if (fragment) {
			// NOTE: We only strip block prefixes to match the raw HTML structure rendered by Rust.
			// We don't blindly format headings unless we strictly need to, to respect what Rust outputs in the DOM.
			const isBlock = fragment.startsWith("^") || linkInfo.isBlock;
			if (isBlock) {
				const cleanFragment = fragment.startsWith("^")
					? fragment.slice(1)
					: fragment;
				fragment = `#${cleanFragment}`;
			} else {
				// Leave heading anchors largely alone depending on the Rust output's raw fragment
				// If Rust generates "#2. 标题", we must maintain it for the document.getElementById to match.
				fragment = `#${fragment}`;
			}
		}

		return `/blog/${encodeURIComponent(mainSlug || "")}${fragment}`;
	};

	if (!hoveredLink || !mounted) {
		return null;
	}

	const content = (
		// biome-ignore lint/a11y/noStaticElementInteractions: Hover card wrapping element doesn't need focus
		<div
			ref={cardRef}
			className={cn(
				"absolute z-[100] transition-[transform,opacity] duration-300 ease-out transform-gpu",
				isCalculated
					? "opacity-100 scale-100"
					: "opacity-0 scale-95 pointer-events-none",
			)}
			style={{ top: `${cardPos.top}px`, left: `${cardPos.left}px` }}
			onMouseEnter={handleCardMouseEnter}
			onMouseLeave={handleCardMouseLeave}
		>
			<Card className="w-[min(480px,90vw)] max-w-[480px] shadow-[var(--shadow-ambient)] dark:shadow-none border border-border/80 bg-background/95 dark:bg-card/95 backdrop-blur-2xl overflow-hidden ring-1 ring-white/10 dark:ring-white/5 relative rounded-[var(--radius-xl)]">
				<div className="absolute inset-0 rounded-[var(--radius-xl)] pointer-events-none shadow-[var(--shadow-inner-glow)]" />

				{isLoading ? (
					<div className="p-8 flex flex-col items-center justify-center gap-4">
						<div className="relative">
							<div className="absolute inset-0 bg-primary/20 blur-xl rounded-full mix-blend-screen animate-pulse" />
							<Loader2 className="w-8 h-8 text-primary animate-spin relative z-10" />
						</div>
						<p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest animate-pulse font-mono flex items-center gap-2">
							<span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
							Resolving context
						</p>
					</div>
				) : previewData === "error" ? (
					<div className="p-8 flex flex-col items-center justify-center text-center gap-3">
						<div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive/80 mb-1 ring-1 ring-destructive/20 border border-destructive/20 shadow-glow">
							<span className="text-xl font-bold">!</span>
						</div>
						<p className="text-base text-foreground font-semibold">
							Link Broken
						</p>
						<p className="text-sm text-muted-foreground/80 max-w-[200px]">
							The target document couldn't be loaded or doesn't exist.
						</p>
					</div>
				) : previewData ? (
					<>
						<div
							className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary/60 via-primary/40 to-transparent ${placement === "top" ? "top-auto bottom-0" : ""}`}
						/>
						<CardHeader className="p-6 pb-3">
							<div className="flex justify-between items-start mb-2 gap-4">
								<div className="flex gap-2 items-center flex-wrap">
									{previewData.area && (
										<Badge className="text-[10px] uppercase font-bold tracking-wider text-primary border-primary/20 bg-primary/5 px-2 py-0.5 rounded-sm shadow-sm ring-1 ring-primary/10">
											{previewData.area}
										</Badge>
									)}
									{(!previewData.status || previewData.status === "draft") && (
										<Badge className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground border-border/40 bg-muted/20 px-2 py-0.5 rounded-sm shadow-sm">
											Draft
										</Badge>
									)}
								</div>
								<button
									type="button"
									className="text-primary/40 hover:text-primary transition-[color,transform] cursor-pointer hover:scale-110 active:scale-95 group/open-btn"
									data-cursor="action"
									data-magnet="true"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleNavigate(
											hoveredLink?.slug || "",
											resolveTargetUrl() || undefined,
										);
									}}
									aria-label="Open document"
								>
									<ArrowRight className="w-5 h-5 transition-transform group-hover/open-btn:translate-x-0.5" />
								</button>
							</div>

							<CardTitle
								className="text-2xl font-black leading-tight text-foreground transition-colors hover:text-primary mt-1 mb-2 group inline-block tracking-tight cursor-pointer"
								data-cursor="navigate"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									handleNavigate(
										hoveredLink?.slug || "",
										resolveTargetUrl() || undefined,
									);
								}}
							>
								<div className="flex flex-col drop-shadow-sm">
									<MarkdownSnippet
										content={previewData.title || ""}
										hitKind="title"
										className="group-hover:text-primary transition-colors"
									/>
									<span className="block h-[2px] w-0 bg-primary/40 transition-[width] duration-300 group-hover:w-full mt-1.5 rounded-full" />
								</div>
							</CardTitle>
						</CardHeader>
						<CardContent className="p-6 pt-0">
							{/* biome-ignore lint: Accessibility handled via hover card interaction */}
							<div
								className="prose prose-sm prose-starry dark:prose-invert starry-night-theme markdown-body wiki-link-preview-content max-w-none text-foreground leading-relaxed overflow-x-hidden overflow-y-auto max-h-[45vh] min-h-[120px] relative scrollbar-thin scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40 pr-1.5"
								onClick={(e) => {
									// Catch wiki-link clicks inside the preview to prevent page reloads
									const target = e.target as HTMLElement;
									const link = target.closest("a") as HTMLAnchorElement;
									if (link) {
										const isWikiLink =
											link.classList.contains("wiki-link") ||
											link.hasAttribute("data-page");
										const isBlogLink = link
											.getAttribute("href")
											?.startsWith("/blog/");

										if (isWikiLink || isBlogLink) {
											e.preventDefault();
											e.stopPropagation();
											let targetHref = link.getAttribute("href") || "";

											// If it's a wiki link in the preview, handle it properly with unified protocol
											if (isWikiLink) {
												// We extract the pure fragment and dataset and let the canonical logic handle it
												targetHref = resolveTargetUrl(); // Re-use the card's strict resolution logic for embedded links
											}

											if (targetHref) {
												const directSlug = decodeURIComponent(
													link.dataset.target || targetHref,
												);
												handleNavigate(directSlug, targetHref);
											}
										}
									}
								}}
							>
								{previewData.htmlContent ? (
									<div
										className="relative z-10"
										// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized backend output (Phase 7)
										dangerouslySetInnerHTML={{
											__html:
												typeof window !== "undefined"
													? DOMPurify.sanitize(previewData.htmlContent)
													: previewData.htmlContent,
										}}
									/>
								) : (
									<MarkdownSnippet
										content={previewData.description || ""}
										className="text-sm block"
									/>
								)}
								{!previewData.htmlContent &&
									(!previewData.description ||
										previewData.description === "No context available.") && (
										<span className="italic opacity-60 flex items-center gap-2 mt-2">
											<FileText className="w-4 h-4" /> No content snippet
											available.
										</span>
									)}
							</div>

							{previewData.tags && previewData.tags.length > 0 && (
								<div className="flex flex-wrap gap-2 pt-4 mt-2">
									{previewData.tags.slice(0, 4).map((tag: string) => (
										<span
											key={tag}
											className="text-[10px] font-medium text-foreground/70 bg-secondary/50 border border-border/50 rounded px-2 py-0.5 transition-[color,border-color] hover:text-primary hover:border-primary/30 cursor-pointer"
											data-cursor="tag"
											data-magnet="true"
										>
											#{tag}
										</span>
									))}
									{previewData.tags.length > 4 && (
										<span className="text-[10px] font-medium text-muted-foreground/60 bg-transparent px-2 py-0.5">
											+{previewData.tags.length - 4}
										</span>
									)}
								</div>
							)}
						</CardContent>
					</>
				) : (
					<div className="p-8 flex flex-col items-center justify-center text-center gap-3">
						<div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground/40 text-xl font-bold mb-1 ring-1 ring-border shadow-[var(--shadow-inner-glow)]">
							?
						</div>
						<p className="text-base text-foreground font-semibold">
							Unknown Link
						</p>
						<p className="text-sm text-muted-foreground/70">
							This document hasn't been created yet.
						</p>
					</div>
				)}
			</Card>
		</div>
	);

	return createPortal(content, document.body);
}
