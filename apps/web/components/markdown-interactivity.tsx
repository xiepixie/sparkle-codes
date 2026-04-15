"use client";

import { isSameWikiPage, normalizeSlug, parseWikiLink } from "@repo/utils";
import { MarkdownRenderer } from "@v2/markdown-parser";
import DOMPurify from "dompurify";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { type PreviewData, WikiLinkPreviewManager } from "./wiki-link-preview";

/**
 * --- UTILITIES START ---
 */
function supportsFinePointer() {
	if (typeof window === "undefined") {
		return false;
	}
	return (
		window.matchMedia("(pointer: fine)").matches &&
		!window.matchMedia("(hover: none)").matches
	);
}

function openTouchPreviewFromTarget(
	target: HTMLElement,
	setPreview: (preview: PreviewState | null) => void,
) {
	const image = target.closest(
		".wiki-image-wrapper img",
	) as HTMLImageElement | null;
	if (image) {
		setPreview({
			type: "image",
			title: "Image Preview",
			imageSrc: image.currentSrc || image.src,
			imageAlt: image.alt,
		});
		return true;
	}

	const mermaidContainer = target.closest(
		".mermaid-render-container",
	) as HTMLElement | null;
	if (mermaidContainer) {
		setPreview({
			type: "html",
			title: "Diagram Preview",
			htmlContent: mermaidContainer.innerHTML,
		});
		return true;
	}

	return false;
}

/**
 * --- COMPONENT START ---
 */

interface MarkdownInteractivityProps {
	html: string;
	currentSlug?: string;
	currentPostMeta?: PreviewData;
}

interface PreviewState {
	type: "image" | "html";
	title: string;
	imageSrc?: string;
	imageAlt?: string;
	htmlContent?: string;
}

interface ClientWikiNavigationTarget {
	isSamePage: boolean;
	fragment: string;
	destinationHref?: string;
}

function resolveClientWikiNavigation(
	targetUrl: string,
	href: string | undefined,
	currentSlug: string | undefined,
): ClientWikiNavigationTarget {
	const effectiveDestination = href || targetUrl;
	const linkInfo = parseWikiLink(effectiveDestination);
	const fragment = linkInfo.fragment || "";

	// Primary check: data-target path vs current slug
	let isSamePage = isSameWikiPage(targetUrl, normalizeSlug(currentSlug || ""));

	// Secondary check: href path vs current slug
	// Why: data-target carries the Obsidian vault filename (e.g. "博客测试2"),
	// which can differ from the web slug (e.g. "sparkle-rendering-pipeline-deep-dive").
	// Without this check, heading links on the same page fall through to router.push,
	// which does not trigger hash scrolling for same-pathname navigation.
	if (!isSamePage && href) {
		const hrefInfo = parseWikiLink(href);
		const hrefSlug = normalizeSlug(hrefInfo.path);
		const currentNormalized = normalizeSlug(currentSlug || "");
		if (hrefSlug && currentNormalized && hrefSlug === currentNormalized) {
			isSamePage = true;
		}
	}

	const decodedFragment = fragment
		? fragment.startsWith("#")
			? fragment.slice(1)
			: fragment
		: "";

	return {
		isSamePage,
		fragment: decodedFragment,
		destinationHref: href,
	};
}

function scrollToFragment(fragment: string) {
	if (!fragment) {
		return;
	}

	// 🛡️ [Architecture] Per DOCS/wikilink.md §4.1:
	// The fragment can be raw (from internal code) or encoded (from URL).
	const decoded = (() => {
		const target = fragment.startsWith("#") ? fragment.slice(1) : fragment;
		try {
			// Normal decode — handles standard URI encoding
			return decodeURIComponent(target);
		} catch {
			return target;
		}
	})();

	const targetElement = document.getElementById(decoded);

	if (!targetElement) {
		// If it's a valid encoded hash but getElementById failed, try one more time decoded
		console.warn(`[Scroll] Target not found for fragment: "${decoded}"`);
		return;
	}

	// Calculate offset for sticky headers (ReadingHeader + NavBar)
	const headerOffset = 80;
	const elementPosition = targetElement.getBoundingClientRect().top;
	const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

	window.scrollTo({
		top: offsetPosition,
		behavior: "smooth",
	});

	// Update browser URL without jumping back to top (native hash navigation is avoided)
	const cleanUrl = `${window.location.pathname}${window.location.search}#${encodeURIComponent(decoded)}`;
	window.history.pushState(null, "", cleanUrl);

	// UX: Visual arrival confirmation — flash the target element
	targetElement.classList.remove("jump-highlight");
	void targetElement.offsetWidth; // Force reflow to restart animation
	targetElement.classList.add("jump-highlight");
}

/**
 * MarkdownInteractivity is the app-layer wrapper around MarkdownRenderer.
 *
 * 职责边界：
 * - `MarkdownRenderer` 负责 DOM hydration 与通用交互节点。
 * - 本组件负责 Next.js 路由、当前页面上下文、以及移动端预览状态。
 * - 这样 parser package 不需要知道应用路由，而 web app 也不需要重复做 DOM hydration。
 */
export function MarkdownInteractivity({
	html,
	currentSlug,
	currentPostMeta,
}: MarkdownInteractivityProps) {
	const router = useRouter();
	const containerRef = useRef<HTMLDivElement>(null);
	const [preview, setPreview] = useState<PreviewState | null>(null);
	const { resolvedTheme } = useTheme();

	const isFinePointer = React.useMemo(() => supportsFinePointer(), []);

	// 0. Global Fragment Watcher
	// Why: Handles same-page anchor jumps from external components (FloatingChatWidget, CommandMenu)
	useEffect(() => {
		const handleHashChange = () => {
			if (window.location.hash) {
				scrollToFragment(window.location.hash);
			}
		};

		const handleCustomScroll = (e: Event) => {
			const customEvent = e as CustomEvent<{ fragment: string }>;
			if (customEvent.detail?.fragment) {
				scrollToFragment(customEvent.detail.fragment);
			}
		};

		window.addEventListener("hashchange", handleHashChange);
		window.addEventListener(
			"sparkle:scroll-to-fragment",
			handleCustomScroll as EventListener,
		);

		// Initial check on mount/content change
		if (window.location.hash) {
			const timer = setTimeout(() => {
				scrollToFragment(window.location.hash);
			}, 300);
			return () => {
				clearTimeout(timer);
				window.removeEventListener("hashchange", handleHashChange);
				window.removeEventListener(
					"sparkle:scroll-to-fragment",
					handleCustomScroll as EventListener,
				);
			};
		}

		return () => {
			window.removeEventListener("hashchange", handleHashChange);
			window.removeEventListener(
				"sparkle:scroll-to-fragment",
				handleCustomScroll as EventListener,
			);
		};
	}, [html]);

	// 1. Navigation Controller (Next.js context dependent)
	const handleWikiLinkClick = useCallback(
		(targetUrl: string, href?: string) => {
			const navigation = resolveClientWikiNavigation(
				targetUrl,
				href,
				currentSlug,
			);

			if (navigation.isSamePage) {
				scrollToFragment(navigation.fragment);
				return;
			}

			if (navigation.destinationHref) {
				router.push(navigation.destinationHref);
			}
		},
		[router, currentSlug],
	);

	// 2. Mobile Preview Interaction
	useEffect(() => {
		const container = containerRef.current;
		if (!container || isFinePointer) {
			return;
		}

		const handleInteraction = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (openTouchPreviewFromTarget(target, setPreview)) {
				e.preventDefault();
				e.stopPropagation();
			}
		};

		container.addEventListener("click", handleInteraction);
		return () => container.removeEventListener("click", handleInteraction);
	}, [isFinePointer]);

	if (!html) {
		return null;
	}

	return (
		<>
			<div className="markdown-interactivity-wrapper w-full" ref={containerRef}>
				<MarkdownRenderer
					html={html}
					currentSlug={currentSlug}
					onWikiLinkClick={handleWikiLinkClick}
					resolvedTheme={resolvedTheme}
				/>
			</div>

			{preview ? (
				<div className="fixed inset-0 z-[140] bg-background/88 backdrop-blur-xl md:hidden">
					<div className="flex h-full flex-col">
						<div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4">
							<div className="min-w-0">
								<div className="text-sm font-semibold text-foreground">
									{preview.title}
								</div>
								<div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
									Long-press/Drag to pan
								</div>
							</div>
							<button
								type="button"
								onClick={() => setPreview(null)}
								className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-background/60 px-4 text-xs font-bold uppercase tracking-[0.2em] text-foreground/80 active:scale-95"
							>
								Close
							</button>
						</div>

						<div
							className="min-h-0 flex-1 overflow-auto px-4 py-5"
							style={{ touchAction: "pan-x pan-y pinch-zoom" }}
						>
							{preview.type === "image" && preview.imageSrc ? (
								<div className="flex min-h-full min-w-max items-center justify-center">
									<div
										className="relative"
										style={{ minWidth: "min(92vw, 28rem)", height: "auto" }}
									>
										<Image
											src={preview.imageSrc}
											alt={preview.imageAlt || "Preview image"}
											width={800}
											height={600}
											className="h-auto w-full rounded-2xl shadow-ambient"
											style={{ height: "auto" }}
											unoptimized
											priority
										/>
									</div>
								</div>
							) : (
								<div
									className="mermaid-mobile-preview min-h-full min-w-max"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized with DOMPurify before rendering
									dangerouslySetInnerHTML={{
										__html: DOMPurify.sanitize(preview.htmlContent || ""),
									}}
								/>
							)}
						</div>
					</div>
				</div>
			) : null}
			<WikiLinkPreviewManager
				containerRef={containerRef}
				currentSlug={currentSlug}
				currentPostMeta={currentPostMeta}
				onNavigate={handleWikiLinkClick}
			/>
		</>
	);
}
