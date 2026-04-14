"use client";

import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import "katex/dist/katex.min.css";
import { generateContentHash } from "@repo/utils";
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

/**
 * DECOUPLED NOTIFICATION HUB (决策型注释)
 * 为什么：MarkdownRenderer 作为一个核心解析包，不应硬依赖于 Web 特有的 UI Toast 实例。
 * 通过自定义事件 app-notify 派发消息，由 ClientProviders 进行捕获并桥接到 @repo/ui/toast。
 * 这样做实现了包的解耦，并允许在不同环境下（如 Docs 或 Web）灵活调整通知实现。
 */
function dispatchNotify(detail: {
	message: string;
	level?: "success" | "error" | "info" | "warning";
	description?: string;
}) {
	if (typeof window === "undefined") {
		return;
	}
	window.dispatchEvent(
		new CustomEvent("app-notify", {
			detail,
		}),
	);
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

	private estimateComplexity(el: HTMLElement): number {
		const tex = el.dataset.tex || el.textContent || '';
		let score = tex.length;
		if (tex.includes('\\begin{')) { score += 50; }
		if (tex.includes('\\frac') || tex.includes('\\matrix')) { score += 30; }
		if (tex.includes('\\int') || tex.includes('\\sum')) { score += 20; }
		return score;
	}

	private sweep(deadline: any) {
		const items = Array.from(this.queue);
		if (items.length === 0) {
			this.isSweepRunning = false;
			return;
		}

		const scoredItems = items
			.filter(el => document.contains(el) && !el.dataset.renderedKey)
			.map(el => ({ el, priority: this.estimateComplexity(el) }))
			.sort((a, b) => a.priority - b.priority);

		let i = 0;
		while (
			i < scoredItems.length &&
			(deadline.timeRemaining() > 1 || deadline.didTimeout)
		) {
			const { el } = scoredItems[i];
			renderMathElement(el);
			this.queue.delete(el);
			i++;
		}

		for (const el of items) {
			if (!document.contains(el) || el.dataset.renderedKey) {
				this.queue.delete(el);
			}
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

const LATEX_GREEK = new Set(['\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\zeta', '\\eta', '\\theta', '\\iota', '\\kappa', '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\rho', '\\sigma', '\\tau', '\\upsilon', '\\phi', '\\chi', '\\psi', '\\omega', '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Upsilon', '\\Phi', '\\Psi', '\\Omega', '\\varepsilon', '\\varphi', '\\varpi', '\\varrho', '\\varsigma', '\\vartheta']);
const LATEX_FUNCTIONS = new Set(['\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\exp', '\\lim', '\\max', '\\min', '\\sup', '\\inf', '\\det', '\\deg', '\\dim', '\\ker', '\\arg', '\\arccos', '\\arcsin', '\\arctan', '\\sinh', '\\cosh', '\\tanh', '\\cot', '\\sec', '\\csc', '\\arcsinh', '\\arccosh', '\\arctanh']);
const LATEX_SYMBOLS = new Set(['\\sum', '\\int', '\\prod', '\\partial', '\\nabla', '\\infty', '\\forall', '\\exists', '\\in', '\\notin', '\\subset', '\\supset', '\\cup', '\\cap', '\\to', '\\rightarrow', '\\Rightarrow', '\\gets', '\\leftarrow', '\\Leftarrow', '\\leftrightarrow', '\\Leftrightarrow', '\\approx', '\\neq', '\\le', '\\ge', '\\times', '\\cdot', '\\pm', '\\mp', '\\hbar', '\\imath', '\\jmath', '\\ell', '\\wp', '\\Re', '\\Im', '\\aleph', '\\beth', '\\daleth', '\\gimel', '\\complement', '\\ell', '\\eth', '\\hbar', '\\hslash', '\\mho', '\\partial', '\\sqsubset', '\\sqsupset', '\\vartriangle', '\\triangledown', '\\triangleleft', '\\triangleright', '\\Box', '\\Diamond', '\\flat', '\\natural', '\\sharp', '\\clubsuit', '\\diamondsuit', '\\heartsuit', '\\spadesuit', '\\surd', '\\top', '\\bottom', '\\neg', '\\lnot', '\\land', '\\lor', '\\ni', '\\owns', '\\propto', '\\sim', '\\perp', '\\cdot', '\\circ', '\\ast', '\\times', '\\div', '\\pm', '\\mp', '\\oplus', '\\ominus', '\\otimes', '\\oslash', '\\odot', '\\wedge', '\\vee', '\\cap', '\\cup', '\\sqcap', '\\sqcup', '\\uplus', '\\amalg', '\\setminus', '\\bullet', '\\star', '\\dagger', '\\ddagger', '\\wr']);

function highlightLatex(tex: string): string {
    let source = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const tokens: Array<{ placeholder: string; html: string }> = [];
    let tokenId = 0;
    const createToken = (match: string, className: string): string => {
        const placeholder = `\x00T${tokenId++}\x00`;
        tokens.push({ placeholder, html: `<span class="${className}">${escapeHtml(match)}</span>` });
        return placeholder;
    };
    source = source.replace(/\\\\/g, m => createToken(m, 'tex-newline'));
    source = source.replace(/\\[a-zA-Z]+/g, m => {
        if (LATEX_GREEK.has(m)) { return createToken(m, 'tex-greek'); }
        if (LATEX_FUNCTIONS.has(m)) { return createToken(m, 'tex-function'); }
        if (LATEX_SYMBOLS.has(m)) { return createToken(m, 'tex-symbol'); }
        if (m === '\\begin' || m === '\\end') { return createToken(m, 'tex-env-cmd'); }
        return createToken(m, 'tex-command');
    });
    source = source.replace(/(\{)([a-zA-Z*]+)(\})/g, (_match, p1, p2, p3) => {
        return createToken(p1, 'tex-brace') + createToken(p2, 'tex-env-name') + createToken(p3, 'tex-brace');
    });
    source = source.replace(/\\[{}$#%&_^~]/g, m => createToken(m, 'tex-escape'));
    source = source.replace(/[{}[\]()]/g, m => createToken(m, 'tex-brace'));
    source = source.replace(/[&_^=+\-*/<>]|\\pm|\\mp|\\to|\\approx/g, m => createToken(m, 'tex-operator'));
    source = escapeHtml(source);
    for (const { placeholder, html } of tokens) {
        source = source.replace(placeholder, html);
    }
    return source;
}

function formatLatexSource(tex: string): string[] {
    let source = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    source = source.replace(/(\\begin\{[^}]+\})/g, '\n$1\n');
    source = source.replace(/(\\end\{[^}]+\})/g, '\n$1\n');
    source = source.replace(/\\\\/g, '\\\\\n');
    source = source.replace(/\s*&\s*/g, ' & ');
    if (!source.includes('\n') && source.length > 50) {
        let depth = 0; let result = '';
        for (let i = 0; i < source.length; i++) {
            const char = source[i];
            if (char === '{') { depth++; } else if (char === '}') { depth--; }
            if (depth === 0 && i > 25 && char === '=' && source[i - 1] !== '\\' && source[i - 1] !== '<' && source[i - 1] !== '>') {
                result += '\n  = '; continue;
            }
            result += char;
        }
        source = result;
    }
    const rawLines = source.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const nestingEnvs = new Set([
        'aligned', 'align', 'align*', 'alignat', 'alignat*', 'flalign', 'flalign*',
        'eqnarray', 'eqnarray*', 'cases', 'dcases', 'rcases', 'dcases*', 'rcases*',
        'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix',
        'array', 'tabular', 'tabular*', 'equation', 'equation*', 'gather', 'gather*',
        'multline', 'multline*', 'split', 'subequations', 'empheq',
    ]);
    const result: string[] = [];
    let depth = 0;
    const INDENT = '  ';
    for (const line of rawLines) {
        const endMatch = line.match(/^\\end{([\w*]+)}/);
        if (endMatch && nestingEnvs.has(endMatch[1])) { depth = Math.max(0, depth - 1); }
        result.push(INDENT.repeat(depth) + line);
        const beginMatch = line.match(/^\\begin{([\w*]+)}/);
        if (beginMatch && nestingEnvs.has(beginMatch[1])) {
            if (!line.includes(`\\end{${beginMatch[1]}}`)) { depth++; }
        }
    }
    return result.length > 0 ? result : [''];
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
		inlineSource.className = "shiki-inline latex-source-inline";
		inlineSource.innerHTML = highlightLatex(cleanTex);
		fragment.appendChild(inlineSource);
		return fragment;
	}

	const sourceContainer = document.createElement("div");
	sourceContainer.className = "latex-source code-fence-container !overflow-visible";

	const header = document.createElement("div");
	header.className = "code-fence-header shadow-inset-sm !z-50";

	const headerLeft = document.createElement("div");
	headerLeft.className = "code-header-left";
	const dotsContent = document.createElement("div");
	dotsContent.className = "code-dots";
	dotsContent.innerHTML = `<div class="code-dot code-dot-red"></div><div class="code-dot code-dot-amber"></div><div class="code-dot code-dot-green"></div>`;
	headerLeft.appendChild(dotsContent);

	const headerRight = document.createElement("div");
	headerRight.className = "code-header-right flex items-center gap-3";
	const headerLabel = document.createElement("span");
	headerLabel.className = "code-lang-text";
	headerLabel.textContent = "LaTeX";
	headerRight.appendChild(headerLabel);

	const copySettings = document.createElement("div");
	copySettings.className = "flex items-center gap-1.5 ml-2 mr-1";

	// 1. Selector (The "Settings" keys)
	const selector = document.createElement("div");
	selector.className = "flex items-center bg-muted/40 p-0.5 rounded-lg border border-border/10 focus-within:border-primary/20 transition-all";
	
	const options = [
		{ label: "$$", value: "$$", title: "Format: $$ ... $$" },
		{ label: "\\[ ... \\]", value: "\\[", title: "Format: \\[ ... \\]" },
		{ label: "RAW", value: "raw", title: "Format: Raw LaTeX" }
	];

	options.forEach((opt, idx) => {
		const btn = document.createElement("button");
		btn.type = "button";
		const isActive = idx === 0;
		// Frameless Design: Only color and opacity change, no background boxes
		btn.className = `math-copy-selector h-6 px-1.5 text-[10px] transition-all uppercase tracking-tighter active:scale-95 flex items-center justify-center min-w-[30px] border-b-2 ${
			isActive 
				? "text-primary border-primary font-black opacity-100" 
				: "text-muted-foreground/30 border-transparent font-medium hover:text-muted-foreground/60"
		}`;
		btn.dataset.value = opt.value;
		btn.title = opt.title;
		btn.textContent = opt.label;
		selector.appendChild(btn);
	});

	// 2. Action (The "Functional" key)
	const copyBtn = document.createElement("button");
	copyBtn.type = "button";
	copyBtn.className = "math-copy-btn h-7 px-3 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg transition-all border border-primary/20 hover:border-primary/40 active:scale-95 flex items-center justify-center";
	copyBtn.dataset.wrap = "$$"; // Initial default
	copyBtn.innerHTML = "<span>COPY</span>";

	const closeBtn = document.createElement("button");
	closeBtn.type = "button";
	closeBtn.className = "code-close-btn ml-1 opacity-40 hover:opacity-100 transition-opacity";
	closeBtn.title = "Close Source";
	closeBtn.innerHTML = "<span>CLOSE</span>";

	// We attach the selector as a field to influence the copyBtn's behavior
	copySettings.appendChild(selector);
	copySettings.appendChild(copyBtn);
	copySettings.appendChild(closeBtn);

	headerRight.appendChild(copySettings);

	header.appendChild(headerLeft);
	header.appendChild(headerRight);

	const sourceCodeWrapper = document.createElement("div");
	sourceCodeWrapper.className = "code-fence mockup-code";
    
	const formattedLines = formatLatexSource(cleanTex);
	const blockId = `math-src-${generateContentHash(cleanTex)}`;
    
	sourceCodeWrapper.innerHTML = formattedLines.map((line, i) => {
		const lineId = `${blockId}-L${i + 1}`;
		return `<pre id="${lineId}" data-key="${lineId}" tabindex="-1" data-prefix="${i + 1}" data-line="${i + 1}"><code>${highlightLatex(line)}</code></pre>`;
	}).join('');

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
	el.setAttribute("data-cursor", "explore");
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
		dispatchNotify({
			message: "Mathematics Rendering Error",
			level: "error",
			description: "The LaTeX syntax in this block appears to be invalid.",
		});
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
		dispatchNotify({
			message: "Diagram Rendering Error",
			level: "error",
			description: "Failed to render the Mermaid diagram. Please check the syntax.",
		});
	}
}

function hydrateCalloutIcons(el: HTMLElement) {
	/**
	 * HYDRATION ANXIETY MITIGATION (Vector-in-CSS)
	 * -------------------------------------------
	 * Why: JS-based injection caused Layout Shifts (CLS) and visual flicker during hydration.
	 * Decision: Render strictly in CSS using |-webkit-mask-image| and |--callout-icon|.
	 * Constraint: This function only markers hydration state without modifying the DOM structure.
	 */
	const type = el.dataset.calloutType?.toLowerCase() || "note";
	const customIcon = el.dataset.calloutIcon?.toLowerCase();

	const iconEl = el.querySelector(
		".md-callout__icon, .md-callout-icon, .callout-icon",
	);

	if (iconEl) {
		el.dataset.iconHydrated = customIcon || type;
	}
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

function hydrateLinks(root: HTMLElement) {
	root.querySelectorAll("a").forEach((a) => {
		const href = a.getAttribute("href");
		if (!href) {
			return;
		}

		// Robust Internal Detection: check for leading slash, blog/docs prefixes, or project-specific domains
		const isInternal =
			href.startsWith("/") ||
			href.startsWith("#") ||
			href.startsWith("mailto:") ||
			href.startsWith("tel:") ||
			href.startsWith(window.location.origin);

		if (!isInternal && href.startsWith("http")) {
			a.setAttribute("target", "_blank");
			a.setAttribute("rel", "noopener noreferrer");
		}
	});
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

				// Priority 2: Deferred Interactions (Performance)
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

						// Hydrate Images
						root
							.querySelectorAll(".wiki-embed[data-embed-kind='image']")
							.forEach((el) => {
								hydrateImageEmbed(el as HTMLElement);
							});
						if (root.matches(".wiki-embed[data-embed-kind='image']")) {
							hydrateImageEmbed(root);
						}

						// Hydrate Links (External target Fix)
						hydrateLinks(root);
					},
					{ timeout: 2000 },
				);
			};

			// If it's the first mount and we have valid initial HTML, we can skip the heavy
			// morphdom pass and just perform interactive hydration.
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
						"data-link-type",
						"data-document-id",
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
						// Callout preservation (Icons and Folds)
						if (
							from.matches(".md-callout, .callout") &&
							from.getAttribute("data-callout-type") ===
								to.getAttribute("data-callout-type")
						) {
							// Preserve Icons
							if (from.dataset.iconHydrated) {
								const fromIcon = from.querySelector(
									".md-callout__icon, .callout-icon",
								);
								const toIcon = to.querySelector(
									".md-callout__icon, .callout-icon",
								);
								if (fromIcon && toIcon && fromIcon.innerHTML) {
									toIcon.innerHTML = fromIcon.innerHTML;
									to.dataset.iconHydrated = from.dataset.iconHydrated;
								}
							}
							// Preserve Fold State
							if (from.hasAttribute("data-callout-fold")) {
								const liveFoldState = from.getAttribute("data-callout-fold");
								if (liveFoldState) {
									to.setAttribute("data-callout-fold", liveFoldState);
								}
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

		// 2.5 Sync Hydration for visual-critical elements (Icons, etc.)
		// Why: using useLayoutEffect ensures these are in the DOM before paint
		// and before View Transition snapshots are taken.
		// Note: This must be at the top level of the component.
		useLayoutEffect(() => {
			const container = containerRef.current;
			if (!container || !stableHtml) { return; }

			container.querySelectorAll(".md-callout, .callout").forEach((el) => {
				hydrateCalloutIcons(el as HTMLElement);
			});
			if (container.matches(".md-callout, .callout")) {
				hydrateCalloutIcons(container);
			}
		}, [stableHtml]);

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

				// 🏛️ [Navigation Boundary] Intercept both Wiki-links and standard Internal links.
				// This ensures that clicking any link to a local blog post or page 
				// triggers a Next.js soft navigation instead of a full browser reload.
				const wikiLink = target.closest(".wiki-link, .internal-link, a");
				if (wikiLink instanceof HTMLAnchorElement) {
					const href = wikiLink.getAttribute("href");
					const isInternal = href && (href.startsWith("/") || href.startsWith(window.location.origin));
					
					if (isInternal) {
						const linkTarget = wikiLink.dataset.target || href;
						if (onWikiLinkClick) {
							e.preventDefault();
							onWikiLinkClick(linkTarget, href || undefined);
							return;
						}
					} else if (href?.startsWith("http")) {
						// For external links, ensure consistent target="_blank" behavior 
						// even if hydration hasn't completed or if the element was updated.
						wikiLink.setAttribute("target", "_blank");
						wikiLink.setAttribute("rel", "noopener noreferrer");
					}
					// For external links, we let the default browser behavior (<a> tag) handle it.
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
				// Math Format Selector (Setting Key)
				const formatSelector = target.closest(".math-copy-selector") as HTMLElement;
				if (formatSelector) {
					const value = formatSelector.dataset.value;
					const container = formatSelector.closest(".code-header-right");
					const copyBtn = container?.querySelector(".math-copy-btn") as HTMLElement;
					
					if (value && copyBtn) {
						// 1. Update State Visually (Frameless)
						const allSelectors = container?.querySelectorAll(".math-copy-selector");
						allSelectors?.forEach(s => {
							s.classList.remove("text-primary", "border-primary", "font-black", "opacity-100");
							s.classList.add("text-muted-foreground/30", "border-transparent", "font-medium");
						});
						formatSelector.classList.remove("text-muted-foreground/30", "border-transparent", "font-medium");
						formatSelector.classList.add("text-primary", "border-primary", "font-black", "opacity-100");
						
						// 2. Update Functional Button Logic
						copyBtn.dataset.wrap = value;
						
						// Tactile feedback
						formatSelector.style.transform = "translateY(-1px)";
						setTimeout(() => { formatSelector.style.transform = ""; }, 100);
					}
					return;
				}

				// Math Copy Action (Functional Key)
				const mathCopyBtn = target.closest(".math-copy-btn") as HTMLElement;
				if (mathCopyBtn) {
					const mathEl = mathCopyBtn.closest("[data-tex]") as HTMLElement;
					const tex = mathEl?.dataset.tex;
					
					if (tex) {
						let finalTex = tex;
						let label = "LaTeX";
						const wrapType = mathCopyBtn.dataset.wrap;
						
						if (wrapType === "$$") { finalTex = `$$\n${tex}\n$$`; label = "$$ ... $$"; }
						else if (wrapType === "\\[") { finalTex = `\\[\n${tex}\n\\]`; label = "\\[ ... \\]"; }
						else if (wrapType === "raw") { finalTex = tex; label = "RAW TEXT"; }
						
						copyToClipboard(finalTex).then(() => {
							dispatchNotify({
								message: `Copied as ${label}`,
								level: "success",
								description: "The formula is now in your clipboard.",
							});
							
							// Handle visual feedback
							const container = mathCopyBtn.closest(".code-fence-container, .group\\/code");
							if (container) {
								container.classList.add("is-copied");
								setTimeout(() => container.classList.remove("is-copied"), 2000);
							}
						});
					}
					return;
				}

				// Handle legacy options if any remain
				target.closest(
					".math-copy-option, .code-copy-btn-math, .inline-copy-btn, .code-copy-btn[data-is-math]",
				);

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
								dispatchNotify({
									message: "Code block copied",
									level: "success",
									description: "Snippet has been saved to your clipboard.",
								});
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
						copyToClipboard(url).then(() => dispatchNotify({
							message: "Image link copied",
							level: "success",
							description: "The asset URL has been saved to your clipboard.",
						}));
					} else if (
						imgActionBtn.classList.contains("download-img-btn") &&
						url
					) {
						dispatchNotify({
							message: "Starting download",
							level: "info",
							description: filename || "The image is being saved.",
						});
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
						// Prevent the default double-click selection of surrounding text
						window.getSelection()?.removeAllRanges();
						
						const tex = mathEl.dataset.tex;
						const isBlock = mathEl.classList.contains("math-block") || mathEl.tagName === "DIV";
						
						if (!isBlock && tex) {
							// Inline Math: Quick copy with $ wrapping AND Toggle Source
							const finalTex = `$${tex}$`;
							copyToClipboard(finalTex).then(() => {
								dispatchNotify({
									message: "Copied as $ ... $",
									level: "success",
									description: "Inline LaTeX formula is ready for use.",
								});
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
    const dangerousCommands = [
        '\\htmlData',
        '\\HTML',
        '\\htmlClass',
        '\\htmlId',
        '\\htmlStyle'
    ];

    let clean = tex.trim();

    // Fix: Strip Obsidian-style blockquote prefixes if they leaked into the math content
    clean = clean.split('\n').map(line => line.replace(/^\s*>\s*/, '')).join('\n').trim();

    // Fix: Robustly strip delimiters if they were captured 
    while ((clean.startsWith('$$') && clean.endsWith('$$')) || (clean.startsWith('$') && clean.endsWith('$'))) {
        if (clean.startsWith('$$') && clean.endsWith('$$') && clean.length >= 4) {
            clean = clean.substring(2, clean.length - 2).trim();
        } else if (clean.startsWith('$') && clean.endsWith('$') && clean.length >= 2) {
            clean = clean.substring(1, clean.length - 1).trim();
        } else {
            break;
        }
    }

    for (const cmd of dangerousCommands) {
        const regex = new RegExp(`${cmd.replace(/\\/g, '\\\\')}(?![a-zA-Z])`, 'g');
        if (regex.test(clean)) {
            clean = clean.replace(regex, `\\text{[BLOCKED: ${cmd}]} `);
        }
    }
    return clean;
}
