"use client";

import { generateContentHash } from "@repo/utils";
import "katex/dist/katex.min.css";
import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { toast } from "sonner";
import "./markdown.css";

// --- CONSTANTS & HELPERS ---
//
// 职责边界：
// - 本组件不重新解析 Markdown，只消费服务端已经产出的稳定 HTML 协议。
// - 本组件只负责“渐进 hydration”：数学公式、Mermaid、图片工具栏、复制按钮、callout 图标等。
// - 路由跳转与业务态交互由 apps/web 的包装层负责，避免 parser package 直接依赖应用路由。

const hasWindow = typeof window !== "undefined";
const ric =
	hasWindow && "requestIdleCallback" in window
		? (cb: any, opts?: any) => (window as any).requestIdleCallback(cb, opts)
		: (cb: any, opts?: any) =>
				globalThis.setTimeout(() => {
					cb({ didTimeout: true, timeRemaining: () => 0 });
				}, opts?.timeout ?? 1);

const MATH_SELECTOR =
	"[data-tex].math-inline, [data-tex].math-block, .sentinel-math";

let katexModulePromise: Promise<any> | null = null;
let mermaidModulePromise: Promise<any> | null = null;
let domPurifyModulePromise: Promise<any> | null = null;
let morphdomModulePromise: Promise<any> | null = null;

async function getKatex() {
	if (!katexModulePromise) {
		katexModulePromise = import("katex").then((mod) => mod.default ?? mod);
	}
	return katexModulePromise;
}

async function getMermaid() {
	if (!mermaidModulePromise) {
		mermaidModulePromise = import("mermaid").then((mod) => mod.default ?? mod);
	}
	return mermaidModulePromise;
}

async function getDOMPurify() {
	if (!domPurifyModulePromise) {
		domPurifyModulePromise = import("dompurify").then(
			(mod) => mod.default ?? mod,
		);
	}
	return domPurifyModulePromise;
}

async function getMorphdom() {
	if (!morphdomModulePromise) {
		morphdomModulePromise = import("morphdom").then(
			(mod) => mod.default ?? mod,
		);
	}
	return morphdomModulePromise;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

class LRUCache<K, V> {
	private cache = new Map<K, V>();
	private maxSize: number;
	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}
	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			this.cache.delete(key);
			this.cache.set(key, value);
		}
		return value;
	}
	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}
}

const texHtmlCache = new LRUCache<string, string>(2000);

function copyToClipboard(text: string): Promise<boolean> {
	if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
		return Promise.resolve(false);
	}
	return navigator.clipboard
		.writeText(text)
		.then(() => true)
		.catch(() => false);
}

// --- MATH HYDRATION ---

class MathRenderHub {
	private observer: IntersectionObserver;
	private queue: Set<HTMLElement> = new Set();
	private isSweepRunning = false;

	constructor() {
		if (typeof window === "undefined") {
			this.observer = {} as any;
			return;
		}

		this.observer = new IntersectionObserver(
			(entries) => {
				const toRender: HTMLElement[] = [];
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const el = entry.target as HTMLElement;
						this.observer.unobserve(el);
						if (el.dataset.renderedKey) {
							// For SSR-enhanced math, we still need to dry-hydrate attributes
							hydrateMathAttributes(el);
						} else {
							toRender.push(el);
						}
					}
				}
				if (toRender.length > 0) {
					this.renderBatch(toRender);
				}
			},
			{ root: null, rootMargin: "1200px", threshold: 0.01 },
		);
	}

	private renderBatch(items: HTMLElement[]) {
		const sorted = items.filter((el) => document.contains(el));
		for (const el of sorted) {
			if (!el.dataset.renderedKey) {
				renderMathElement(el);
			} else {
				hydrateMathAttributes(el);
			}
			this.queue.delete(el);
		}
	}

	public register(el: HTMLElement) {
		if (el.dataset.renderedKey) {
			return;
		}
		this.observer.observe(el);
		this.queue.add(el);
		this.startIdleSweep();
	}

	public unregister(el: HTMLElement) {
		this.observer.unobserve(el);
		this.queue.delete(el);
	}

	private startIdleSweep() {
		if (this.isSweepRunning || this.queue.size === 0) {
			return;
		}
		this.isSweepRunning = true;
		ric((deadline: any) => this.sweep(deadline), { timeout: 2000 });
	}

	private sweep(deadline: any) {
		const items = Array.from(this.queue);
		if (items.length === 0) {
			this.isSweepRunning = false;
			return;
		}

		let i = 0;
		while (
			i < items.length &&
			(deadline.timeRemaining() > 1 || deadline.didTimeout)
		) {
			const el = items[i];
			if (document.contains(el) && !el.dataset.renderedKey) {
				renderMathElement(el);
			}
			this.queue.delete(el);
			i++;
		}

		if (this.queue.size > 0) {
			ric((d: any) => this.sweep(d), { timeout: 2000 });
		} else {
			this.isSweepRunning = false;
		}
	}

	public cleanUp() {
		this.isSweepRunning = false;
		this.queue.clear();
		if (typeof this.observer.disconnect === "function") {
			this.observer.disconnect();
		}
	}
}

function buildMathRenderedContent(
	renderedHtml: string,
	cleanTex: string,
	isBlock: boolean,
): DocumentFragment {
	const fragment = document.createDocumentFragment();

	const contentWrapper = document.createElement(isBlock ? "div" : "span");
	contentWrapper.className = "katex-render-content";
	contentWrapper.innerHTML = renderedHtml;
	fragment.appendChild(contentWrapper);

	if (!isBlock) {
		const inlineSource = document.createElement("span");
		inlineSource.className = "latex-source-inline";
		inlineSource.textContent = cleanTex;
		fragment.appendChild(inlineSource);
		return fragment;
	}

	const sourceContainer = document.createElement("div");
	sourceContainer.className = "latex-source";

	const header = document.createElement("div");
	header.className = "code-fence-header";

	const headerLeft = document.createElement("div");
	headerLeft.className = "code-header-left";
	const headerLabel = document.createElement("span");
	headerLabel.className = "code-lang-text";
	headerLabel.textContent = "LaTeX";
	headerLeft.appendChild(headerLabel);

	const headerRight = document.createElement("div");
	headerRight.className = "code-header-right";

	const copyBtn = document.createElement("button");
	copyBtn.type = "button";
	copyBtn.className = "code-copy-btn-math";
	copyBtn.title = "Copy LaTeX";
	copyBtn.textContent = "COPY";

	const closeBtn = document.createElement("button");
	closeBtn.type = "button";
	closeBtn.className = "code-close-btn";
	closeBtn.title = "Close Source";
	closeBtn.textContent = "CLOSE";

	headerRight.appendChild(copyBtn);
	headerRight.appendChild(closeBtn);
	header.appendChild(headerLeft);
	header.appendChild(headerRight);

	const sourceCodeWrapper = document.createElement("div");
	sourceCodeWrapper.className = "mockup-code";
	const pre = document.createElement("pre");
	const code = document.createElement("code");
	code.textContent = cleanTex;
	pre.appendChild(code);
	sourceCodeWrapper.appendChild(pre);

	sourceContainer.appendChild(header);
	sourceContainer.appendChild(sourceCodeWrapper);
	fragment.appendChild(sourceContainer);

	return fragment;
}

function hydrateMathAttributes(el: HTMLElement) {
	const isBlock =
		el.classList.contains("math-block") ||
		el.classList.contains("math-display") ||
		el.tagName === "DIV";

	el.setAttribute("tabindex", "0");
	el.setAttribute("role", "button");
	el.setAttribute(
		"aria-expanded",
		el.classList.contains("source-mode") ? "true" : "false",
	);
	el.setAttribute(
		"aria-label",
		isBlock
			? "Toggle LaTeX source for block formula"
			: "Toggle LaTeX source for inline formula",
	);
	el.setAttribute(
		"title",
		isBlock
			? "Double-click or press Enter to show LaTeX source"
			: "Double-click or press Enter to show inline LaTeX source",
	);
}

function toggleMathSource(el: HTMLElement) {
	if (!el.dataset.tex) {
		return;
	}
	el.classList.toggle("source-mode");
	el.setAttribute(
		"aria-expanded",
		el.classList.contains("source-mode") ? "true" : "false",
	);
}

async function renderMathElement(el: HTMLElement) {
	const tex = el.dataset.tex || el.textContent || "";
	if (!tex || el.dataset.renderingMath === "true") {
		return;
	}

	// Clean leading/trailing $$ or $ and handle display mode detection
	const isBlock =
		el.classList.contains("math-block") ||
		el.classList.contains("math-display") ||
		el.tagName === "DIV" ||
		tex.trim().startsWith("$$");

	// Why: content arrives from database HTML attributes where entity decoding already happened.
	// We normalize once here so cache keys, copied LaTeX, and source-mode text all stay in sync.
	const cleanTex = tex.replace(/^(\$\$|\$)|(\$\$|\$)$/g, "").trim();

	el.dataset.tex = cleanTex;
	el.setAttribute("tabindex", "0");
	el.setAttribute("role", "button");
	el.setAttribute(
		"aria-expanded",
		el.classList.contains("source-mode") ? "true" : "false",
	);
	el.setAttribute(
		"aria-label",
		isBlock
			? "Toggle LaTeX source for block formula"
			: "Toggle LaTeX source for inline formula",
	);
	el.setAttribute(
		"title",
		isBlock
			? "Double-click or press Enter to show LaTeX source"
			: "Double-click or press Enter to show inline LaTeX source",
	);

	const cacheKey = `${isBlock ? "B" : "I"}:${cleanTex}`;
	const cached = texHtmlCache.get(cacheKey);

	if (cached) {
		el.replaceChildren(buildMathRenderedContent(cached, cleanTex, isBlock));
		el.dataset.renderedKey = generateContentHash(cleanTex);
		el.classList.add("is-rendered");
		return;
	}

	try {
		el.dataset.renderingMath = "true";
		const katex = await getKatex();
		const html = katex.renderToString(cleanTex, {
			displayMode: isBlock,
			throwOnError: false,
			trust: false,
			strict: false,
		});

		texHtmlCache.set(cacheKey, html);
		el.replaceChildren(buildMathRenderedContent(html, cleanTex, isBlock));
		el.dataset.renderedKey = generateContentHash(cleanTex);
		el.classList.add("is-rendered");
	} catch (err) {
		console.error("KaTeX error:", err);
	} finally {
		delete el.dataset.renderingMath;
	}
}

// --- INTERACTIVE HYDRATORS ---

async function hydrateMermaid(el: HTMLElement, isDark: boolean, force = false) {
	if (!el || (!force && el.dataset.renderedTheme === String(isDark))) {
		return;
	}

	try {
		const themeVariables = isDark
			? {
					darkMode: true,
					background: "transparent",
					mainBkg: "transparent",
					primaryColor: "#818cf8",
					primaryTextColor: "#f8fafc",
					textColor: "#f8fafc",
					nodeBkg: "#0a0a1a",
					nodeTextColor: "#f1f5f9",
					nodeBorder: "#4f46e5",
					clusterBkg: "rgba(30, 27, 75, 0.4)",
					clusterBorder: "#818cf8",
					clusterTextColor: "#cbd5e1",
					lineColor: "#6366f1",
					edgeLabelBackground: "#0a0a1a",
					tertiaryColor: "#1e1b4b",
					secondaryColor: "#312e81",
				}
			: {
					darkMode: false,
					background: "transparent",
					mainBkg: "transparent",
					primaryColor: "#513bb2",
					primaryTextColor: "#0f172a",
					textColor: "#0f172a",
					nodeBkg: "#ffffff",
					nodeTextColor: "#0f172a",
					nodeBorder: "#513bb2",
					clusterBkg: "rgba(81, 59, 178, 0.05)",
					clusterBorder: "#513bb2",
					clusterTextColor: "#513bb2",
					lineColor: "#513bb2",
					edgeLabelBackground: "#ffffff",
					tertiaryColor: "#f1f5f9",
					secondaryColor: "#e2e8f0",
				};

		const mermaid = await getMermaid();
		mermaid.initialize({
			startOnLoad: false,
			theme: "base",
			themeVariables,
			// Why: these diagrams are rendered from persisted markdown content.
			// Keeping Mermaid in strict mode protects the client boundary even if upstream sanitization regresses.
			securityLevel: "strict",
			fontFamily: "Inter, var(--font-pingfang-sc), sans-serif",
		});

		const content = el.dataset.mermaidContent || el.textContent || "";
		if (!content) {
			return;
		}

		const renderToken = `${generateContentHash(content)}:${isDark ? "dark" : "light"}`;
		el.dataset.mermaidRenderToken = renderToken;

		const uniqueId = `mermaid-${generateContentHash(content)}-${Math.random().toString(36).slice(2, 5)}`;
		const { svg } = await mermaid.render(uniqueId, content);
		if (!el.isConnected || el.dataset.mermaidRenderToken !== renderToken) {
			return;
		}

		const DOMPurify = await getDOMPurify();
		const sanitizedSvg = DOMPurify.sanitize(svg, {
			ADD_TAGS: ["foreignObject"],
			USE_PROFILES: { svg: true, svgFilters: true, html: true },
		});

		let container = el.nextElementSibling;
		if (
			!container ||
			!container.classList.contains("mermaid-render-container")
		) {
			container = document.createElement("div");
			container.className =
				"mermaid-render-container my-10 flex justify-center overflow-x-auto transition-all group/mermaid";
			el.parentNode?.insertBefore(container, el.nextSibling);
		}
		const svgTemplate = document.createElement("template");
		svgTemplate.innerHTML = sanitizedSvg;
		container.replaceChildren(svgTemplate.content.cloneNode(true));
		el.style.display = "none";
		el.dataset.renderedTheme = String(isDark);
		el.dataset.mermaidContent = content;
	} catch (err) {
		console.error("Mermaid error:", err);
	}
}

function hydrateCalloutIcons(el: HTMLElement) {
	// Base Lucide-inspired SVG components for reuse and consistency
	const SVG = {
		INFO: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
		CHECK:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
		CHECK_CIRCLE:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
		ALERT:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
		X_CIRCLE:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
		HELP: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
		BUG: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>',
		PENCIL:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>',
		SPARKLE:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
		LIST: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
		QUOTE:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1 0 2.5 0 6-2 7Zm14 0c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1 0 2.5 0 6-2 7Z"/></svg>',
		ZAP: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-2 10h10L11 22l2-10H3Z"/></svg>',
		CLIPBOARD_LIST:
			'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
	};

	// Reduced redundancy by mapping types into functional groups
	const calloutIcons: Record<string, string> = {
		note: SVG.PENCIL,
		todo: SVG.CHECK_CIRCLE,
		info: SVG.INFO,
		abstract: SVG.CLIPBOARD_LIST,
		summary: SVG.CLIPBOARD_LIST,
		tldr: SVG.CLIPBOARD_LIST,
		tip: SVG.SPARKLE,
		hint: SVG.SPARKLE,
		important: SVG.SPARKLE,
		success: SVG.CHECK,
		done: SVG.CHECK,
		check: SVG.CHECK,
		question: SVG.HELP,
		help: SVG.HELP,
		faq: SVG.HELP,
		warning: SVG.ALERT,
		attention: SVG.ALERT,
		caution: SVG.ALERT,
		failure: SVG.X_CIRCLE,
		fail: SVG.X_CIRCLE,
		missing: SVG.X_CIRCLE,
		danger: SVG.ZAP,
		error: SVG.ZAP,
		bug: SVG.BUG,
		example: SVG.LIST,
		quote: SVG.QUOTE,
		cite: SVG.QUOTE,
	};

	const type = el.dataset.calloutType?.toLowerCase() || "note";
	const customIcon = el.dataset.calloutIcon?.toLowerCase();

	if (el.dataset.iconHydrated === (customIcon || type)) {
		return;
	}

	const iconEl = el.querySelector(
		".md-callout__icon, .md-callout-icon, .callout-icon",
	);
	if (iconEl) {
		// Priority: User custom icon > Type-based icon > Note fallback
		iconEl.innerHTML =
			calloutIcons[customIcon || ""] || calloutIcons[type] || calloutIcons.note;
	}
	el.dataset.iconHydrated = customIcon || type;
}

function hydrateImageEmbed(el: HTMLElement) {
	const src = el.dataset.src || el.dataset.target;
	if (!src) {
		return;
	}

	// Why: if the server already emitted the full image shell, the client should only
	// attach behaviors. Rebuilding that subtree would risk losing SSR-first layout stability.
	const alreadyRendered =
		el.dataset.rendered === src && el.querySelector("img");

	const r2PublicUrl =
		process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://cdn.sparkle.codes";
	const label = el.dataset.alt || "";
	const encodedSrc = encodeURIComponent(src).replace(/%2F/g, "/");
	const primaryUrl = src.startsWith("http")
		? src
		: `${r2PublicUrl.replace(/\/$/, "")}/${encodedSrc}`;
	const localUrl = `/obsidian-assets/${encodedSrc}`;

	if (alreadyRendered) {
		if (el.dataset.imageHydrated === src) {
			return;
		}

		// Just attach missing logic to existing elements
		const img = el.querySelector("img");
		if (img) {
			img.addEventListener("error", () => {
				if (img.src !== `${window.location.origin}${localUrl}`) {
					img.src = localUrl;
				} else {
					img.style.display = "none";
					const errorDiv = el.querySelector(".wiki-image-error") as HTMLElement;
					if (errorDiv) {
						errorDiv.style.display = "block";
					}
				}
			});
		}

		// Add missing buttons if they weren't in the pre-render
		const toolbar = el.querySelector(".img-toolbar");
		if (toolbar && !toolbar.querySelector(".download-img-btn")) {
			const downloadBtn = document.createElement("button");
			downloadBtn.className =
				"img-action-btn download-img-btn flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all pointer-events-auto border-none";
			downloadBtn.dataset.url = primaryUrl;
			downloadBtn.dataset.filename = src;
			downloadBtn.title = "Download";
			downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3))"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;
			toolbar.appendChild(downloadBtn);
		}
		el.dataset.imageHydrated = src;
		return;
	}

	// Fallback for non-pre-rendered content (though blog.ts should catch most)
	let widthStyle = "max-width: 100%;";
	let displayAlt = label;
	if (label && /^\d+(x\d+)?$/.test(label)) {
		const [w] = label.split("x");
		widthStyle = `width: ${w}px; max-width: 100%;`;
		displayAlt = "";
	}

	el.innerHTML = "";
	const wrapper = document.createElement("div");
	wrapper.className =
		"wiki-image-wrapper group relative my-10 flex flex-col items-center";

	const resizerContainer = document.createElement("div");
	resizerContainer.className =
		"relative transition-all duration-700 group-hover:scale-[1.01] z-0";
	resizerContainer.style.cssText = widthStyle;

	const img = document.createElement("img");
	img.src = primaryUrl;
	img.alt = displayAlt || src;
	img.className =
		"block w-full h-auto rounded-xl shadow-ambient group-hover:shadow-[0_24px_70px_rgba(0,0,0,0.4)] transition-all duration-700 relative z-0";
	img.loading = "lazy";
	img.decoding = "async";

	const errorDiv = document.createElement("div");
	errorDiv.className =
		"wiki-image-error p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500/60 text-[10px] text-center font-black uppercase tracking-widest my-4";
	errorDiv.style.display = "none";
	errorDiv.innerText = `⚠️ Image Sync Failed: ${src}`;

	img.addEventListener("error", () => {
		if (img.src !== `${window.location.origin}${localUrl}`) {
			img.src = localUrl;
		} else {
			img.style.display = "none";
			errorDiv.style.display = "block";
		}
	});

	const toolbar = document.createElement("div");
	toolbar.className =
		"img-toolbar absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-30 sm:top-4 sm:right-4 pointer-events-none";

	const copyBtn = document.createElement("button");
	copyBtn.className =
		"img-action-btn copy-img-btn flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all pointer-events-auto border-none";
	copyBtn.dataset.url = primaryUrl;
	copyBtn.title = "Copy Link";
	copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3))"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

	const downloadBtn = document.createElement("button");
	downloadBtn.className =
		"img-action-btn download-img-btn flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all pointer-events-auto border-none";
	downloadBtn.dataset.url = primaryUrl;
	downloadBtn.dataset.filename = src;
	downloadBtn.title = "Download";
	downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3))"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`;

	toolbar.appendChild(copyBtn);
	toolbar.appendChild(downloadBtn);

	resizerContainer.appendChild(img);
	resizerContainer.appendChild(errorDiv);
	resizerContainer.appendChild(toolbar);
	wrapper.appendChild(resizerContainer);

	if (displayAlt) {
		const capContainer = document.createElement("div");
		capContainer.className = "mt-5 text-center";
		const caption = document.createElement("span");
		caption.className =
			"px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-[9px] text-primary/60 font-black tracking-[0.3em] uppercase";
		caption.textContent = displayAlt;
		capContainer.appendChild(caption);
		wrapper.appendChild(capContainer);
	}

	el.appendChild(wrapper);
	el.dataset.rendered = src;
	el.dataset.imageHydrated = src;
}

function hydrateCodeBlocks(el: HTMLElement) {
	if (el.dataset.codeHydrated) {
		return;
	}
	const header = el.querySelector(".code-fence-header");
	if (header && !header.querySelector(".code-copy-btn")) {
		const copyBtn = document.createElement("button");
		copyBtn.className =
			"code-copy-btn group/copy-btn flex items-center justify-center p-1.5 rounded-md hover:bg-primary/10 transition-all";
		copyBtn.title = "Copy Code";
		copyBtn.innerHTML = `
            <svg class="w-3.5 h-3.5 text-muted-foreground group-hover/copy-btn:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.586-1.414l-3.242-3.242A2 2 0 0013.758 2H10a2 2 0 00-2 2z" />
                <path d="M16 18v2a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2" />
            </svg>
        `;
		const rightGroup = header.querySelector(".code-header-right");
		if (rightGroup) {
			rightGroup.insertBefore(copyBtn, rightGroup.firstChild);
		} else {
			header.appendChild(copyBtn);
		}
	}
	el.dataset.codeHydrated = "true";
}

// --- COMPONENT PROPS ---

export interface MarkdownRendererProps {
	html?: string;
	content?: string;
	className?: string;
	// Reserved for app-layer wrappers that want to keep a stable renderer API.
	// The parser package itself does not make routing decisions from this value.
	currentSlug?: string;
	onWikiLinkClick?: (target: string, href?: string) => void;
	onNodeAdded?: (el: HTMLElement) => void;
	resolvedTheme?: string;
}

// --- MAIN RENDERER ---

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(
	({
		html: initialHtml,
		content,
		className = "",
		currentSlug: _currentSlug,
		onWikiLinkClick,
		onNodeAdded,
		resolvedTheme,
	}) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const mathHubRef = useRef<MathRenderHub | null>(null);
		const isFirstMount = useRef(true);
		const isDark = resolvedTheme === "dark";
		const lastHtmlRef = useRef<string>(initialHtml || "");

		const stableHtml = useMemo(() => {
			if (initialHtml) {
				return initialHtml;
			}
			if (content) {
				return `<p>${escapeHtml(content)}</p>`;
			}
			return "";
		}, [initialHtml, content]);

		if (!mathHubRef.current && typeof window !== "undefined") {
			mathHubRef.current = new MathRenderHub();
		}

		useEffect(() => {
			return () => {
				mathHubRef.current?.cleanUp();
				mathHubRef.current = null;
			};
		}, []);

		// 2. DOM Patching & Hydration
		// Why: We use useEffect instead of useLayoutEffect to avoid blocking the initial
		// paint with heavy DOM reconciliation. By using dangerouslySetInnerHTML for SSR
		// and morphdom for hydration, we get fast initial content with efficient updates.
		useEffect(() => {
			const mathHub = mathHubRef.current;
			const container = containerRef.current;
			if (!container || !stableHtml || !mathHub) {
				return;
			}
			let cancelled = false;

			const hydrateEnhancements = (root: HTMLElement) => {
				// Priority 1: Math (Visual integrity)
				root.querySelectorAll(MATH_SELECTOR).forEach((el) => {
					mathHub.register(el as HTMLElement);
				});
				if (root.matches(MATH_SELECTOR)) {
					mathHub.register(root);
				}

				// Priority 2: Interaction (Can be deferred to idle)
				ric(
					() => {
						// Hydrate Code Blocks
						root.querySelectorAll(".code-fence-container").forEach((el) => {
							hydrateCodeBlocks(el as HTMLElement);
						});
						if (root.matches(".code-fence-container")) {
							hydrateCodeBlocks(root);
						}

						// Hydrate Mermaid
						root
							.querySelectorAll(
								".language-mermaid, div.mermaid, [data-lang='mermaid']",
							)
							.forEach((el) => {
								hydrateMermaid(el as HTMLElement, isDark);
							});
						if (
							root.matches(
								".language-mermaid, div.mermaid, [data-lang='mermaid']",
							)
						) {
							hydrateMermaid(root, isDark);
						}

						// Hydrate Callouts
						root.querySelectorAll(".md-callout, .callout").forEach((el) => {
							hydrateCalloutIcons(el as HTMLElement);
						});
						if (root.matches(".md-callout, .callout")) {
							hydrateCalloutIcons(root);
						}

						// Hydrate Images
						root
							.querySelectorAll(".wiki-embed[data-embed-kind='image']")
							.forEach((el) => {
								hydrateImageEmbed(el as HTMLElement);
							});
						if (root.matches(".wiki-embed[data-embed-kind='image']")) {
							hydrateImageEmbed(root);
						}
					},
					{ timeout: 2000 },
				);
			};

			// If it's the first mount and we have valid initial HTML, we can skip the heavy
			// morphdom pass and just perform interactive hydration.
			// This dramatically reduces styles recalculation on first load.
			if (isFirstMount.current) {
				isFirstMount.current = false;
				lastHtmlRef.current = stableHtml;
				hydrateEnhancements(container);
				return;
			}

			// Fast path: if HTML hasn't changed, only re-sweep hydration
			if (lastHtmlRef.current === stableHtml) {
				hydrateEnhancements(container);
				return;
			}

			lastHtmlRef.current = stableHtml;
			void (async () => {
				const [DOMPurify, morphdom] = await Promise.all([
					getDOMPurify(),
					getMorphdom(),
				]);
				if (cancelled) {
					return;
				}

				// Why: most blog navigations render stable SSR HTML on first paint.
				// Deferring sanitize + morphdom until the content truly changes keeps
				// the initial client work small without weakening later update safety.
				const fragment = DOMPurify.sanitize(stableHtml, {
					RETURN_DOM_FRAGMENT: true,
					ADD_ATTR: [
						"id",
						"style",
						"data-src",
						"data-alt",
						"data-embed-kind",
						"data-tex",
						"data-target",
						"data-page",
						"data-fragment",
						"data-callout-type",
						"data-callout-icon",
						"data-callout-fold",
						"data-language",
						"data-lang",
						"data-code",
						"data-task",
						"data-block-ref",
					],
					ADD_TAGS: ["svg", "path"],
					USE_PROFILES: { html: true, mathMl: true, svg: true },
				}) as unknown as DocumentFragment;

				const tempDiv = document.createElement("div");
				tempDiv.appendChild(fragment);

				morphdom(container, tempDiv, {
					childrenOnly: true,
					onBeforeElUpdated: (from: Node, to: Node) => {
						if (
							!(from instanceof HTMLElement) ||
							!(to instanceof HTMLElement)
						) {
							return true;
						}
						// Source Mode state preservation
						if (from.dataset.tex && from.dataset.tex === to.dataset.tex) {
							if (from.classList.contains("source-mode")) {
								to.classList.add("source-mode");
								to.setAttribute("aria-expanded", "true");
							}
							if (from.dataset.renderedKey) {
								to.innerHTML = from.innerHTML;
								to.dataset.renderedKey = from.dataset.renderedKey;
							}
							return false;
						}
						// Callout Fold state preservation
						if (
							from.matches(".md-callout, .callout") &&
							from.getAttribute("data-callout-type") ===
								to.getAttribute("data-callout-type") &&
							from.hasAttribute("data-callout-fold")
						) {
							const liveFoldState = from.getAttribute("data-callout-fold");
							if (liveFoldState) {
								to.setAttribute("data-callout-fold", liveFoldState);
							}
						}
						return true;
					},
					onNodeAdded: (n: Node) => {
						if (n instanceof HTMLElement) {
							hydrateEnhancements(n);
							if (onNodeAdded) {
								onNodeAdded(n);
							}
						}
						return n;
					},
				});

				if (!cancelled) {
					hydrateEnhancements(container);
				}
			})();

			return () => {
				cancelled = true;
			};
		}, [stableHtml, onNodeAdded]);

		// 3. Theme-Specific Updates (Optimization for JANK)
		// Why: content re-morphing on theme change is expensive and triggers forced reflows.
		// Decoupling theme updates from the main reconciliation loop keeps the switch responsive.
		useEffect(() => {
			const container = containerRef.current;
			if (!container || isFirstMount.current) {
				return;
			}

			ric(() => {
				// Specifically update Mermaid diagrams which are theme-dependent
				container
					.querySelectorAll(
						".language-mermaid, div.mermaid, [data-lang='mermaid']",
					)
					.forEach((el) => {
						hydrateMermaid(el as HTMLElement, isDark);
					});
			});
		}, [isDark]);

		// 3. Event Handling (Delegation)
		const handleClick = useCallback(
			(e: React.MouseEvent) => {
				const target = e.target as HTMLElement;

				// WikiLinks
				const wikiLink = target.closest(".wiki-link, .internal-link");
				if (wikiLink instanceof HTMLAnchorElement) {
					const linkTarget =
						wikiLink.dataset.target || wikiLink.getAttribute("href");
					const href = wikiLink.getAttribute("href");
					if (linkTarget && onWikiLinkClick) {
						e.preventDefault();
						onWikiLinkClick(linkTarget, href || undefined);
						return;
					}
				}

				// Callout Folds
				const calloutHeader = target.closest(
					".md-callout__header, .md-callout-header, .callout-title",
				);
				if (calloutHeader) {
					const callout = calloutHeader.closest(
						".md-callout, .callout",
					) as HTMLElement;
					if (callout?.hasAttribute("data-callout-fold")) {
						const current = callout.getAttribute("data-callout-fold");
						callout.setAttribute(
							"data-callout-fold",
							current === "+" ? "-" : "+",
						);
					}
				}

				// Math Options & Inline Math Copy
				const mathCopyElement = target.closest(
					".math-copy-option, .code-copy-btn-math, .inline-copy-btn, .code-copy-btn[data-is-math]",
				);
				if (mathCopyElement) {
					const mathEl = mathCopyElement.closest("[data-tex]") as HTMLElement;
					const tex = mathEl?.dataset.tex;
					
					if (tex) {
						let finalTex = tex;
						let label = "LaTeX";
						const wrapType = mathCopyElement.getAttribute("data-wrap");
						
						if (wrapType === "$$") { finalTex = `$$\n${tex}\n$$`; label = "$$"; }
						else if (wrapType === "\\[") { finalTex = `\\[\n${tex}\n\\]`; label = "\\["; }
						else if (wrapType === "$") { finalTex = `$${tex}$`; label = "inline $"; }
						
						copyToClipboard(finalTex).then(() => {
							toast.success(`Copied as ${label}`);
							
							// Handle visual feedback
							const container = mathCopyElement.closest(".code-fence-container, .group\\/code");
							if (container) {
								container.classList.add("is-copied");
								setTimeout(() => container.classList.remove("is-copied"), 2000);
							}
						});
					}
					return;
				}

				// Standard Code Copy
				const codeCopyBtn = target.closest(".code-copy-btn");
				if (codeCopyBtn) {
					const container = codeCopyBtn.closest(".code-fence-container");
					if (container) {
						// Shiki line-by-line mode might have multiple <pre> elements
						const preElements = container.querySelectorAll(".mockup-code pre");
						let text = "";
						if (preElements.length > 0) {
							text = Array.from(preElements)
								.map((pre) => pre.textContent || "")
								.join("\n");
						} else {
							// Fallback to searching any pre/code in container
							const codeEl =
								container.querySelector("pre code") ||
								container.querySelector("pre");
							text = codeEl?.textContent || "";
						}

						if (text) {
							copyToClipboard(text).then(() => {
								toast.success("Code copied");
								container.classList.add("is-copied");
								setTimeout(() => container.classList.remove("is-copied"), 2000);
							});
						}
					}
					return;
				}

				// Close Source Mode
				const closeBtn = target.closest(".code-close-btn");
				if (closeBtn) {
					const mathEl = closeBtn.closest(".source-mode") as HTMLElement;
					if (mathEl) {
						mathEl.classList.remove("source-mode");
					}
					return;
				}

				// Image Toolbar Actions
				const imgActionBtn = target.closest(".img-action-btn") as HTMLElement;
				if (imgActionBtn) {
					e.stopPropagation();
					e.preventDefault();
					const url = imgActionBtn.dataset.url;
					const filename = imgActionBtn.dataset.filename;

					if (imgActionBtn.classList.contains("copy-img-btn") && url) {
						copyToClipboard(url).then(() => toast.success("Image URL copied"));
					} else if (
						imgActionBtn.classList.contains("download-img-btn") &&
						url
					) {
						const a = document.createElement("a");
						a.href = url;
						a.download = filename || "downloaded-image.png";
						a.target = "_blank";
						document.body.appendChild(a);
						a.click();
						document.body.removeChild(a);
					}
					return;
				}
			},
			[onWikiLinkClick],
		);

		return (
			<article
				ref={containerRef}
				className={`markdown-body space-y-6 ${className}`}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is produced by the trusted server pipeline, and client-side updates are sanitized before morphdom applies them.
				dangerouslySetInnerHTML={{ __html: stableHtml }}
				onClick={handleClick}
				onKeyDown={(e) => {
					const target = e.target as HTMLElement;
					const mathEl = target.closest("[data-tex]") as HTMLElement | null;
					if (mathEl && (e.key === "Enter" || e.key === " ")) {
						e.preventDefault();
						toggleMathSource(mathEl);
					}
				}}
				aria-label="Markdown Content"
				onDoubleClick={(e) => {
					const target = e.target as HTMLElement;
					const mathEl = target.closest("[data-tex]") as HTMLElement | null;
					if (mathEl) {
						const tex = mathEl.dataset.tex;
						const isBlock = mathEl.classList.contains("math-block") || mathEl.tagName === "DIV";
						
						if (!isBlock && tex) {
							// Inline Math: Quick copy with $ wrapping AND Toggle Source
							const finalTex = `$${tex}$`;
							copyToClipboard(finalTex).then(() => {
								toast.success("Copied as $ ... $");
							});
							toggleMathSource(mathEl);
						} else {
							// Block Math: Toggle source view for interaction
							toggleMathSource(mathEl);
						}
					}
				}}
			/>
		);
	},
);

// Standalone component for small snippets
export const LatexRenderer: React.FC<{
	tex: string;
	block?: boolean;
	className?: string;
}> = ({ tex, block = false, className = "" }) => {
	const elRef = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		if (elRef.current) {
			renderMathElement(elRef.current);
		}
	}, [tex]);

	return (
		<span
			ref={elRef}
			className={`math-render ${block ? "math-block" : "math-inline"} ${className}`}
			data-tex={tex}
		>
			{tex}
		</span>
	);
};

export function sanitizeLatex(tex: string): string {
	return tex.replace(/\\htmlData|\\url|\\href/g, "");
}
