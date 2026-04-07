"use client";

import { generateContentHash } from "@repo/utils";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import mermaid from "mermaid";
import { useTheme } from "next-themes";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * --- UTILITIES START ---
 */

const LATEX_GREEK = new Set(['\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\zeta', '\\eta', '\\theta', '\\iota', '\\kappa', '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\rho', '\\sigma', '\\tau', '\\upsilon', '\\phi', '\\chi', '\\psi', '\\omega', '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Upsilon', '\\Phi', '\\Psi', '\\Omega', '\\varepsilon', '\\varphi', '\\varpi', '\\varrho', '\\varsigma', '\\vartheta']);
const LATEX_FUNCTIONS = new Set(['\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\exp', '\\lim', '\\max', '\\min', '\\sup', '\\inf', '\\det', '\\deg', '\\dim', '\\ker', '\\arg', '\\arccos', '\\arcsin', '\\arctan', '\\sinh', '\\cosh', '\\tanh', '\\cot', '\\sec', '\\csc', '\\arcsinh', '\\arccosh', '\\arctanh']);
const LATEX_SYMBOLS = new Set(['\\sum', '\\int', '\\prod', '\\partial', '\\nabla', '\\infty', '\\forall', '\\exists', '\\in', '\\notin', '\\subset', '\\supset', '\\cup', '\\cap', '\\to', '\\rightarrow', '\\Rightarrow', '\\gets', '\\leftarrow', '\\Leftarrow', '\\leftrightarrow', '\\Leftrightarrow', '\\approx', '\\neq', '\\le', '\\ge', '\\times', '\\cdot', '\\pm', '\\mp', '\\hbar', '\\imath', '\\jmath', '\\ell', '\\wp', '\\Re', '\\Im', '\\aleph', '\\beth', '\\daleth', '\\gimel', '\\complement', '\\eth', '\\hbar', '\\hslash', '\\mho', '\\partial', '\\sqsubset', '\\sqsupset', '\\vartriangle', '\\triangledown', '\\triangleleft', '\\triangleright', '\\Box', '\\Diamond', '\\flat', '\\natural', '\\sharp', '\\clubsuit', '\\diamondsuit', '\\heartsuit', '\\spadesuit', '\\surd', '\\top', '\\bottom', '\\neg', '\\lnot', '\\land', '\\lor', '\\ni', '\\owns', '\\propto', '\\sim', '\\perp', '\\cdot', '\\circ', '\\ast', '\\times', '\\div', '\\pm', '\\mp', '\\oplus', '\\ominus', '\\otimes', '\\oslash', '\\odot', '\\wedge', '\\vee', '\\cap', '\\cup', '\\sqcap', '\\sqcup', '\\uplus', '\\amalg', '\\setminus', '\\bullet', '\\star', '\\dagger', '\\ddagger', '\\wr']);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightLatex(tex: string): string {
  let source = tex
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const tokens: Array<{ placeholder: string; html: string }> = [];
  let tokenId = 0;
  const createToken = (match: string, className: string): string => {
    const placeholder = `\x00Token${tokenId++}\x00`;
    tokens.push({ placeholder, html: `<span class="${className}">${escapeHtml(match)}</span>` });
    return placeholder;
  };

  source = source.replace(/\\\\/g, m => createToken(m, 'text-muted-foreground opacity-50'));
  source = source.replace(/(\\begin\{[^}]+\})|(\\end\{[^}]+\})/g, m => createToken(m, 'text-primary font-bold'));
  
  source = source.replace(/(\\text\{)([^}]+)(\})/g, (_match, p1, p2, p3) => {
    return createToken(p1, 'text-primary font-bold') + p2 + createToken(p3, 'text-primary font-bold');
  });

  source = source.replace(/(\\[a-zA-Z]+)/g, (match) => {
    if (LATEX_GREEK.has(match)) { return createToken(match, 'text-amber-500 font-bold'); }
    if (LATEX_FUNCTIONS.has(match)) { return createToken(match, 'text-blue-500 italic font-bold'); }
    if (LATEX_SYMBOLS.has(match)) { return createToken(match, 'text-primary font-bold'); }
    return createToken(match, 'text-primary font-medium');
  });

  source = source.replace(/(\{)([a-zA-Z*]+)(\})/g, (_match, p1, p2, p3) => {
    return createToken(p1, 'opacity-50') + createToken(p2, 'text-blue-400') + createToken(p3, 'opacity-50');
  });
  source = source.replace(/[{}[\]()]/g, m => createToken(m, 'opacity-50 font-bold'));
  source = source.replace(/[&_^=+\-*/<>]|\\pm|\\mp|\\to|\\approx/g, m => createToken(m, 'text-amber-500 font-bold'));

  source = escapeHtml(source);
  for (const token of tokens) {
    source = source.replace(token.placeholder, token.html);
  }
  return source;
}

function formatLatexSource(tex: string): string[] {
  let source = tex
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Insert logical line breaks for high-fidelity source viewing
  source = source.replace(/(\\begin\{[^}]+\})/g, '\n$1\n');
  source = source.replace(/(\\end\{[^}]+\})/g, '\n$1\n');
  source = source.replace(/\\\\/g, '\\\\\n');
  
  // Clean up excessive newlines and whitespace
  source = source.replace(/\n\s*\n/g, '\n');

  const rawLines = source.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const nestingEnvs = new Set(['aligned', 'align', 'align*', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'array', 'equation', 'gather', 'split']);

  const result: string[] = [];
  let depth = 0;
  const INDENT = '    '; // Premium 4-space indent

  for (const line of rawLines) {
    const endMatch = line.match(/^\\end\{([\w*]+)\}/);
    if (endMatch && nestingEnvs.has(endMatch[1])) { depth = Math.max(0, depth - 1); }
    
    // Space out alignment symbols (&) for premium visual structure
    // Special handling for double alignment symbols (&&) common in some environments
    let formattedLine = line.replace(/\s*&&\s*/g, '    &&    ');
    formattedLine = formattedLine.replace(/(?<!&)\s*&\s*(?!&)/g, '  &  ');
    
    result.push(INDENT.repeat(depth) + formattedLine);
    
    const beginMatch = line.match(/^\\begin\{([\w*]+)\}/);
    if (beginMatch && nestingEnvs.has(beginMatch[1]) && !line.includes(`\\end{${beginMatch[1]}}`)) { depth++; }
  }
  return result.length > 0 ? result : [""];
}

function cleanMathSource(tex: string): string {
  if (!tex) { return ""; }
  let cleaned = tex
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Remove potential blockquote markers if copied from one
  cleaned = cleaned.split('\n').map(line => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('>')) {
      return trimmed.slice(1).replace(/^[ \t]/, '');
    }
    return line;
  }).join('\n');

  // Specific cleanup for KaTeX internal artifacts if any
  return cleaned.trim();
}

function getLatexCopyContent(tex: string, isBlock: boolean, format: 'dollar' | 'bracket'): string {
  if (isBlock) {
    return format === 'dollar' ? `$$\n${tex}\n$$` : `\\[\n${tex}\n\\]`;
  }
  return format === 'dollar' ? `$${tex}$` : `\\(${tex}\\)`;
}

function renderMathElement(el: HTMLElement) {
  if (el.dataset.renderedKey) { return; }
  const tex = cleanMathSource(el.dataset.tex || el.textContent || "");
  if (!tex) { return; }

  const isDisplay = el.classList.contains("math-block") || el.classList.contains("math-display") || el.classList.contains("math-block-long");
  const complexityScore = tex.length 
      + (tex.match(/\\begin/g) || []).length * 80 
      + (tex.match(/\\frac/g) || []).length * 40
      + (tex.match(/\\sqrt/g) || []).length * 30
      + (tex.match(/&/g) || []).length * 15
      + (tex.match(/\\\\/g) || []).length * 20;

  if (isDisplay && complexityScore > 160) {
    el.classList.add("math-block-long");
  }

  try {
    if (isDisplay) {
      el.innerHTML = "";
      katex.render(tex, el, { throwOnError: false, displayMode: true, trust: true });
    } else {
      el.style.background = "transparent";
      el.style.border = "none";
      katex.render(tex, el, { throwOnError: false, displayMode: false, trust: true });
    }
    el.setAttribute("data-rendered-key", "true");
    el.dataset.rendered = "true";
  } catch (err) {
    console.error("Math render error:", err);
  }
}

const ric = (typeof window !== 'undefined' && window.requestIdleCallback)
  ? window.requestIdleCallback.bind(window)
  : (cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, _options?: { timeout?: number }) => 
      setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 10 }), 1);

class MathRenderHub {
  private observer: IntersectionObserver;
  private queue: Set<HTMLElement> = new Set();
  private isSweepRunning = false;

  constructor() {
    if (typeof window === 'undefined') {
      this.observer = {} as any;
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      const toRender: HTMLElement[] = [];
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          this.observer.unobserve(el);
          if (!el.dataset.renderedKey) { toRender.push(el); }
        }
      });
      if (toRender.length > 0) {
        toRender.forEach(el => {
          renderMathElement(el);
          this.queue.delete(el);
        });
      }
    }, { rootMargin: '1200px' });
  }

  public register(el: HTMLElement) {
    if (el.dataset.renderedKey) { return; }
    this.observer.observe(el);
    this.queue.add(el);
    this.startIdleSweep();
  }

  public unregister(el: HTMLElement) {
    if (this.observer.unobserve) { this.observer.unobserve(el); }
    this.queue.delete(el);
  }

  private startIdleSweep() {
    if (this.isSweepRunning || this.queue.size === 0) { return; }
    this.isSweepRunning = true;
    ric((deadline: IdleDeadline) => this.sweep(deadline), { timeout: 2000 });
  }

  private sweep(deadline: IdleDeadline) {
    const items = Array.from(this.queue);
    let processed = 0;
    while (processed < items.length && (deadline.timeRemaining() > 1 || deadline.didTimeout)) {
      const el = items[processed];
      if (el && !el.dataset.rendered) { renderMathElement(el); }
      this.queue.delete(el);
      processed++;
      if (processed >= 8) { break; }
    }
    this.isSweepRunning = false;
    if (this.queue.size > 0) { this.startIdleSweep(); }
  }
}

const mathHub = typeof window !== 'undefined' ? new MathRenderHub() : null;

function supportsFinePointer() {
  if (typeof window === "undefined") { return false; }
  return window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(hover: none)").matches;
}

function extractSection(html: string, fragment: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  
  if (fragment.startsWith('^')) {
    const blockId = fragment.slice(1);
    const anchor = temp.querySelector(`[id="${blockId}"]`);
    if (anchor) {
      if (anchor.classList.contains('block-anchor')) {
        return anchor.parentElement?.outerHTML || anchor.outerHTML;
      }
      return anchor.outerHTML;
    }
    return '';
  }

  const fragments = fragment.split('#').map(norm);
  let startNode: Element | null = null;
  let currentLevel = 0;

  for (const f of fragments) {
    let candidates: Element[] = [];
    if (!startNode) {
        candidates = Array.from(temp.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    } else {
      let curr = startNode.nextElementSibling;
      while (curr) {
        if (/^H[1-6]$/.test(curr.tagName)) {
          const level = Number.parseInt(curr.tagName[1], 10);
          if (level <= currentLevel) { break; }
          candidates.push(curr);
        }
        curr = curr.nextElementSibling;
      }
    }
    const found = candidates.find(h => norm(h.textContent || '') === f);
    if (!found) { return ''; }
    startNode = found;
    currentLevel = Number.parseInt(found.tagName[1], 10);
  }

  if (!startNode) { return ''; }
  const fragment_nodes: Node[] = [startNode.cloneNode(true)];
  let cur = startNode.nextSibling;
  while (cur) {
    if (cur.nodeType === 1 && /^H[1-6]$/.test((cur as Element).tagName)) {
      if (Number.parseInt((cur as Element).tagName[1], 10) <= currentLevel) { break; }
    }
    fragment_nodes.push(cur.cloneNode(true));
    cur = cur.nextSibling;
  }
  const wrap = document.createElement("div");
  wrap.className = "wiki-embed-section-content";
  for (const node of fragment_nodes) {
    wrap.appendChild(node);
  }
  return wrap.innerHTML;
}

function toggleMathSource(el: HTMLElement, forceRefresh = false) {
    if (!el) {
        return;
    }
    const animateSwap = (renderNext: () => void) => {
        if (forceRefresh) {
            renderNext();
            return;
        }

        const startHeight = el.getBoundingClientRect().height;
        el.style.height = `${startHeight}px`;
        el.style.overflow = "hidden";
        el.classList.add("math-transitioning");

        renderNext();

        const finish = () => {
            el.classList.remove("math-transitioning");
            el.style.removeProperty("height");
            el.style.removeProperty("overflow");
            el.removeEventListener("transitionend", finish);
        };

        requestAnimationFrame(() => {
            const endHeight = el.scrollHeight;
            if (Math.abs(endHeight - startHeight) < 2) {
                finish();
                return;
            }

            el.addEventListener("transitionend", finish);
            el.style.height = `${endHeight}px`;
        });
    };

    const isShowingSource = el.dataset.sourceMode === "true";
    
    // Safety: ensure raw tex is saved in a stable attribute if it's not already
    if (!el.dataset.tex) {
        el.dataset.tex = el.textContent || "";
    }
    
    const rawTex = el.dataset.tex || "";
    const tex = cleanMathSource(rawTex);
    const isBlock = el.classList.contains('math-block') || el.classList.contains('math-display') || el.classList.contains('math-block-long');
    
    const currentFormat = (el.dataset.copyFormat as 'dollar' | 'bracket') || 'dollar';
    
    if (isShowingSource && !forceRefresh) {
        animateSwap(() => {
            el.classList.remove('show-source', 'source-mode');
            el.dataset.sourceMode = "false";
            el.innerHTML = '';
            el.removeAttribute('data-rendered');
            el.removeAttribute('data-rendered-key');
            renderMathElement(el);
        });
    } else {
        const formattedLines = formatLatexSource(tex);

        if (isBlock) {
          animateSwap(() => {
            el.classList.add('show-source', 'source-mode');
            el.dataset.sourceMode = "true";
            el.innerHTML = `
            <div class="code-fence-container latex-source" data-lang="latex">
                <div class="code-fence-header group/latex-hdr">
                    <div class="code-header-left">
                        <div class="code-dots"><div class="code-dot code-dot-red"></div><div class="code-dot code-dot-amber"></div><div class="code-dot code-dot-green"></div></div>
                    </div>
                    <div class="code-header-right flex items-center gap-4">
                        <span class="latex-header-label">LATEX</span>
                        <div class="latex-header-actions flex items-center gap-1.5 transition-all duration-300">
                           <span class="latex-header-label">FMT</span>
                           <button class="format-toggle-btn" data-active="${currentFormat === 'dollar'}" data-format="dollar">$</button>
                           <button class="format-toggle-btn" data-active="${currentFormat === 'bracket'}" data-format="bracket">\\[</button>
                           
                           <button class="code-copy-btn-math ml-2" title="Copy Source"><span class="tracking-[0.1em]">COPY</span></button>
                           <button class="code-close-btn" title="Back to formula"><span>BACK</span></button>
                        </div>
                    </div>
                </div>
                <div class="code-fence mockup-code">
                    <div class="latex-lines-container">
                        ${formattedLines.map((line, i) => 
                            `<pre data-prefix="${i + 1}" data-line="${i + 1}"><code>${highlightLatex(line)}</code></pre>`
                        ).join('')}
                    </div>
                </div>
            </div>`;
            
            // Re-bind listeners
            el.querySelectorAll('.format-toggle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const newFormat = (btn as HTMLElement).dataset.format as 'dollar' | 'bracket';
                    if (newFormat === el.dataset.copyFormat) { return; }
                    el.dataset.copyFormat = newFormat;
                    
                    // Force refresh source view without closing
                    const updatedCopyContent = getLatexCopyContent(tex, isBlock, newFormat);
                    navigator.clipboard.writeText(updatedCopyContent);
                    toast.success(`Format changed to ${newFormat === 'dollar' ? '$$' : '\\['}`, { duration: 1000 });
                    
                    // Re-render only the internal element to avoid recursive toggle
                    // Use a flag to indicate we are only updating format, not toggling visibility
                    toggleMathSource(el, true); 
                });
            });

            el.querySelector('.code-close-btn')?.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                toggleMathSource(el); 
            });

            el.querySelector('.code-copy-btn-math')?.addEventListener('click', (e) => {
                const copyBtn = e.currentTarget as HTMLElement;
                e.stopPropagation();
                const format = (el.dataset.copyFormat as 'dollar' | 'bracket') || 'dollar';
                const copyStr = getLatexCopyContent(tex, isBlock, format);
                
                navigator.clipboard.writeText(copyStr).then(() => {
                  const span = copyBtn.querySelector("span");
                  if (span) {
                    const originalText = span.textContent;
                    span.textContent = "COPIED";
                    copyBtn.classList.add("!text-emerald-400", "scale-105");
                    setTimeout(() => {
                      if (span) { span.textContent = originalText; }
                      copyBtn.classList.remove("!text-emerald-400", "scale-105");
                    }, 2000);
                  }
                  toast.success("LaTeX source copied", {
                    duration: 2000,
                    icon: (
                      <div className="flex items-center justify-center rounded-full bg-emerald-500/20 p-1">
                    <svg role="img" aria-label="Success" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="text-emerald-500">
                          <title>Success</title>
                          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )
                  });
                });
            });
          });
        } else {
            el.classList.add('show-source', 'source-mode');
            el.dataset.sourceMode = "true";
            el.innerHTML = `<code class="math-source-content !px-3 !py-1">${highlightLatex(tex)}</code>`;
            // Unified: Let handleDblClick on the container handle the toggle back.
            // We only need to ensure the container-level listener isn't blocked.
        }


        // Persistent Clipboard Action
        const copyContent = getLatexCopyContent(tex, isBlock, currentFormat);
        navigator.clipboard.writeText(copyContent);
        toast.success(`Copied as ${currentFormat === 'dollar' ? '$$' : '\\['}`, { duration: 1500 });
    }
}

function ensureImageToolbarVisibility(root: HTMLElement, isFinePointer: boolean) {
  root.querySelectorAll(".wiki-image-wrapper").forEach((wrapper) => {
    const toolbar = wrapper.querySelector(".img-toolbar") as HTMLElement | null;
    if (!toolbar) { return; }

    if (isFinePointer) {
      toolbar.classList.remove("opacity-100", "translate-y-0");
      toolbar.classList.add("opacity-0", "translate-y-[-10px]");
      return;
    }

    toolbar.classList.remove("opacity-0", "translate-y-[-10px]");
    toolbar.classList.add("opacity-100", "translate-y-0");
  });
}

function openTouchPreviewFromTarget(target: HTMLElement, setPreview: (preview: PreviewState | null) => void) {
  const image = target.closest(".wiki-image-wrapper img") as HTMLImageElement | null;
  if (image) {
    setPreview({
      type: "image",
      title: "Image Preview",
      imageSrc: image.currentSrc || image.src,
      imageAlt: image.alt,
    });
    return true;
  }

  const mermaidContainer = target.closest(".mermaid-render-container") as HTMLElement | null;
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
}

interface PreviewState {
  type: "image" | "html";
  title: string;
  imageSrc?: string;
  imageAlt?: string;
  htmlContent?: string;
}

export function MarkdownInteractivity({ html }: MarkdownInteractivityProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const { resolvedTheme } = useTheme();
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const sanitizedHtml = React.useMemo(() => {
    // We sanitize on the client to ensure security, but since we trust the server-generated 
    // content (from our Rust core), we suppress hydration warnings on the container.
    if (typeof window === "undefined") { return html; }
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ["math", "annotation", "semantics", "mtext", "mn", "mo", "mi", "mspace", "mover", "munder", "msubsup", "mfrac", "msqrt", "mroot", "mtable", "mtr", "mtd", "merror", "mpadded", "mphantom", "mstyle", "msub", "msup", "mmultiscripts", "button", "svg", "path", "circle", "rect"],
      ADD_ATTR: ["display", "encoding", "mathvariant", "data-tex", "data-embed-kind", "data-src", "data-target", "data-page", "data-fragment", "data-prefix", "data-lang", "data-pre-rendered", "data-rendered-key", "data-callout-type", "data-callout-fold", "data-filename", "data-code"],
      ALLOW_DATA_ATTR: true
    });
  }, [html]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) { return; }
    const isFinePointer = supportsFinePointer();

    // --- Sub-transformers ---
    const transformCalloutIcons = (root: HTMLElement) => {
      const calloutIcons = {
        info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
        todo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-square"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 11 3 3 6-6"/></svg>',
        success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
        check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
        done: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
        warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
        caution: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-octagon"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
        danger: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap"><path d="M4 14.89 14 3.11V10h6L10 20.89V14H4z"/></svg>',
        tip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lightbulb"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.1.7.9 1.2 1.7 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
        help: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-help-circle"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
        question: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-help-circle"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
        note: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sticky-note"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v5h6"/></svg>',
        abstract: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>',
        example: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-beaker"><path d="M4.5 3h15"/><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/><path d="M6 14h12"/></svg>',
        quote: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-quote"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>',
      } as Record<string, string>;

      const callouts = root.querySelectorAll(".md-callout:not([data-icon-hydrated])");
      callouts.forEach(callout => {
        const type = (callout as HTMLElement).dataset.calloutType || "note";
        const iconEl = callout.querySelector(".md-callout-icon");
        if (iconEl && !iconEl.innerHTML.trim()) {
          iconEl.innerHTML = calloutIcons[type] || calloutIcons.note;
        }
        (callout as HTMLElement).setAttribute("data-icon-hydrated", "true");
      });
    };

    // NOTE: Callouts are now handled by the Rust core parser for improved performance and SSR consistency.
    // transformCallouts removed to prevent hydration conflicts.


    // transformBadgesAndHashtags removed - replaced by server-side regex pre-rendering (lib/blog.ts).
    // transformCodeBlocks removed - replaced by server-side pre-rendering (lib/blog.ts).

    const renderMermaid = async (root: HTMLElement) => {
      try {
        const isDark = resolvedTheme === "dark";
        
        // Premium Starry Night Palette
        const themeVariables = isDark ? {
          darkMode: true,
          background: 'transparent',
          mainBkg: 'transparent',
          primaryColor: '#818cf8', // Indigo 400
          // Use #f97316 (Orange 500) for text to contrast against both dark backgrounds and white blocks
          primaryTextColor: '#f97316',
          primaryBorderColor: '#6366f1', // Indigo 500
          lineColor: '#6366f1',
          secondaryColor: '#1e293b', // Slate 900
          tertiaryColor: '#0f172a', // Slate 950
          textColor: '#f97316',
          nodeBkg: '#0a0a12', 
          nodeTextColor: '#f97316', 
          nodeBorder: '#4f46e5',
          clusterBkg: 'rgba(30, 27, 75, 0.4)',
          clusterBorder: '#818cf8',
          titleColor: '#c084fc', // Purple 400
          edgeLabelBackground: '#020617',
          // Sequence Diagrams
          actorBkg: '#1e1b4b',
          actorTextColor: '#f97316',
          actorLineColor: '#818cf8',
          signalColor: '#818cf8',
          signalTextColor: '#f97316',
          labelBoxBkgColor: '#1e293b',
          labelTextColor: '#f97316',
          loopTextColor: '#f97316',
          noteBkgColor: '#1e293b',
          noteTextColor: '#f97316',
          // Gantt & Others
          sectionBkgColor: '#1e1b4b',
          sectionBkgColor2: '#1e293b',
          taskBkgColor: '#4338ca',
          taskTextColor: '#f97316',
          activeTaskBkgColor: '#6366f1',
          gridColor: '#334155'
        } : {
          darkMode: false,
          background: 'transparent',
          mainBkg: 'transparent',
          primaryColor: '#513bb2', // Imperial Purple
          primaryTextColor: '#1e293b',
          primaryBorderColor: '#64748b', // Slate 500 (More distinct)
          lineColor: '#475569', // Slate 600
          secondaryColor: '#f8fafc',
          tertiaryColor: '#f1f5f9',
          textColor: '#0f172a', // Deep Slate
          nodeBkg: '#ffffff', 
          nodeTextColor: '#0f172a',
          nodeBorder: '#94a3b8', // Slate 400 (More distinct)
          clusterBkg: 'rgba(241, 245, 249, 0.5)',
          clusterBorder: '#64748b', // Slate 500
          titleColor: '#513bb2',
          edgeLabelBackground: '#ffffff',
          // Sequence Diagrams
          actorBkg: '#f8fafc',
          actorTextColor: '#0f172a',
          actorLineColor: '#64748b',
          signalColor: '#0f172a',
          signalTextColor: '#0f172a',
          labelBoxBkgColor: '#f1f5f9',
          labelTextColor: '#0f172a',
          noteBkgColor: '#fffbeb', // Light amber tint for notes
          noteTextColor: '#0f172a'
        };

        mermaid.initialize({ 
          startOnLoad: false, 
          theme: "base", 
          themeVariables,
          securityLevel: "loose",
          fontFamily: "Inter, var(--font-pingfang-sc), sans-serif",
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
          sequence: { useMaxWidth: true, showSequenceNumbers: true },
          gantt: { useMaxWidth: true }
        });

        // Add a micro-delay to allow Mermaid internal state to sync with initialize
        await new Promise(r => requestAnimationFrame(r));
        
        const blocks = root.querySelectorAll(`
          pre.language-mermaid, 
          pre code.language-mermaid, 
          div.mermaid, 
          [data-language='mermaid'],
          [data-lang='mermaid']
        `);
        
        for (const block of Array.from(blocks)) {
          // Find outermost wrapper to replace (figure > header + pre)
          let targetNode = block as HTMLElement;
          if (targetNode.tagName === "CODE") {
             targetNode = targetNode.closest('figure') || targetNode.closest('pre') || targetNode;
          } else if (targetNode.tagName === "PRE") {
             targetNode = targetNode.closest('figure') || targetNode;
          }

          let content = targetNode.dataset.mermaidContent;
          const themeRendered = targetNode.dataset.renderedTheme;

          // Force re-render if theme changed
          if (themeRendered === String(isDark)) {
            continue;
          }
          
          if (!content) {
            // Robust extraction: Handle Shiki (.line), our custom mockup-code (.mockup-code > pre > code), or raw.
            const codeNode = block.tagName === "CODE" ? block : block.querySelector('code');
            if (codeNode) {
                const clone = codeNode.cloneNode(true) as HTMLElement;
                clone.querySelectorAll('.line-number, .line-numbers, [data-prefix], .prefix').forEach(n => { n.remove(); });
                const lines = clone.querySelectorAll('.line');
                if (lines.length > 0) {
                    content = Array.from(lines).map(line => line.textContent || "").join('\n');
                } else {
                    content = clone.innerText || clone.textContent || "";
                }
            } else {
                const clone = (block as HTMLElement).cloneNode(true) as HTMLElement;
                clone.querySelectorAll('.line-number, .line-numbers, [data-prefix], .prefix').forEach(n => { n.remove(); });
                content = clone.innerText || clone.textContent || "";
            }
            
            content = content.trim()
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");

            targetNode.dataset.mermaidContent = content;
          }

          if (!content || !content.match(/^(graph|flowchart|sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4Context|mindmap|timeline)/i)) {
              continue;
          }
          
          targetNode.dataset.renderedTheme = String(isDark);
          targetNode.style.display = 'none'; // Hide the original block

          // Use unique stable ID prefix from content
          const id = `mermaid-${generateContentHash(content)}`;
          const { svg } = await mermaid.render(id, content);
          
          // Look for an existing render container sibling
          const existingContainer = targetNode.nextElementSibling;
          if (existingContainer?.classList.contains('mermaid-render-container')) {
              existingContainer.innerHTML = svg;
          } else {
              const div = document.createElement("div");
              div.className = "mermaid-render-container my-10 flex justify-center overflow-x-auto transition-all group/mermaid";
              div.innerHTML = svg;
              targetNode.parentNode?.insertBefore(div, targetNode.nextSibling);
          }
        }
      } catch (err) { console.error("Mermaid error:", err); }
    };

    const hydrateWikiEmbeds = async (root: HTMLElement) => {
      const embeds = root.querySelectorAll(".wiki-embed:not(.hydrated)");
      for (const embed of Array.from(embeds)) {
        const el = embed as HTMLElement;
        const kind = el.dataset.embedKind;
        const src = el.dataset.src || el.dataset.target; // Support both
        if (!src) { continue; }

        // 1. Handle Images (R2 Integration with Local Fallback)
        if (kind === "image") {
          const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://cdn.sparkle.codes";
          const label = el.dataset.alt || "";
          
          let widthStyle = "max-width: 100%;";
          let displayAlt = label;
          if (label && /^\d+(x\d+)?$/.test(label)) {
             const [w] = label.split('x');
             widthStyle = `width: ${w}px; max-width: 100%;`;
             displayAlt = ""; 
          }

          const encodedSrc = encodeURIComponent(src).replace(/%2F/g, "/");
          // primaryUrl is R2, secondaryUrl is local public assets
          const primaryUrl = src.startsWith("http") ? src : `${r2PublicUrl.replace(/\/$/, "")}/${encodedSrc}`;
          const localUrl = `/obsidian-assets/${encodedSrc}`;
          
          el.innerHTML = `
            <div class="wiki-image-wrapper group/img relative my-10 flex flex-col items-center">
              <div class="relative transition-all duration-700 group-hover/img:scale-[1.01]" style="${widthStyle}">
                <img 
                  src="${primaryUrl}" 
                  alt="${displayAlt || src}" 
                  class="block w-full h-auto rounded-xl shadow-ambient group-hover/img:shadow-[0_24px_70px_rgba(0,0,0,0.4)] transition-all duration-700"
                  loading="lazy"
                  onerror="if(this.src !== '${window.location.origin}${localUrl}') { this.src='${localUrl}'; } else { this.style.display='none'; this.nextElementSibling.style.display='block'; }"
                />
                <div class="wiki-image-error p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500/60 text-[10px] text-center font-black uppercase tracking-widest my-4" style="display: none;">
                   ⚠️ Image Sync Failed: ${src}
                </div>

                <!-- Floating Toolbar: Premium Glass Interface -->
                <div class="img-toolbar absolute top-3 right-3 flex items-center gap-2 opacity-0 translate-y-[-10px] group-hover/img:opacity-100 group-hover/img:translate-y-0 transition-all duration-500 z-10 sm:top-4 sm:right-4">
                  <button 
                    class="img-action-btn copy-img-btn flex h-10 w-10 items-center justify-center rounded-xl bg-background/55 backdrop-blur-xl border border-white/10 text-foreground/70 hover:text-primary hover:border-primary/30 transition-all pointer-events-auto shadow-ambient sm:h-9 sm:w-9"
                    data-url="${primaryUrl}"
                    title="Copy Link"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  </button>
                  <button 
                    class="img-action-btn download-img-btn flex h-10 w-10 items-center justify-center rounded-xl bg-background/55 backdrop-blur-xl border border-white/10 text-foreground/70 hover:text-primary hover:border-primary/30 transition-all pointer-events-auto shadow-ambient sm:h-9 sm:w-9"
                    data-url="${primaryUrl}"
                    data-filename="${src}"
                    title="Download"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                  </button>
                </div>
              </div>
              
              ${displayAlt ? `
                <div class="mt-5 text-center">
                    <span class="px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-[9px] text-primary/60 font-black tracking-[0.3em] uppercase">
                        ${displayAlt}
                    </span>
                </div>
              ` : ''}
            </div>`;
          el.classList.add("hydrated");
          continue;
        }

        // 2. Handle Notes (Transclusion)
        try {
          const [path, frag] = src.split("#");
          // For now, assume path is relative or absolute to the root
          const res = await fetch(path);
          if (res.ok) {
            const txt = await res.text();
            const content = frag ? extractSection(txt, frag) : txt;
            const contentEl = el.querySelector(".wiki-embed-content");
            if (contentEl) {
              contentEl.innerHTML = content;
              el.classList.add("hydrated");
              contentEl.querySelectorAll(".math-block, .math-inline").forEach(m => { mathHub?.register(m as HTMLElement); });
            }
          }
        } catch (e) { console.error("Wiki embed error:", e); }
      }
    };

    const handleInteraction = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 0. Handle Callout Folds
      const calloutHeader = target.closest(".md-callout-header");
      if (calloutHeader) {
          const callout = calloutHeader.closest(".md-callout") as HTMLElement;
          if (callout?.hasAttribute("data-callout-fold")) {
              const current = callout.getAttribute("data-callout-fold");
              callout.setAttribute("data-callout-fold", current === "+" ? "-" : "+");
          }
      }

      // 0.1 Block single-click on math source view to avoid "accidental" toggle (Double-click only)
      const mathSource = target.closest(".math-source-content, .latex-lines-container, .latex-source, .math-block.source-mode");
      if (mathSource) {
          // If we click inside the source view and it's not a button, we don't do anything on single click.
          // This prevents single-click return as requested by the user.
          if (!target.closest(".format-toggle-btn, .code-close-btn, .code-copy-btn-math")) {
              e.preventDefault();
              e.stopPropagation();
              return;
          }
      }

      // 0.5 Handle Code Copying (Delegated)
      const copyBtn = target.closest(".code-copy-btn");
      if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        
        const codeFenceContainer = copyBtn.closest(".code-fence-container") as HTMLElement;
        if (!codeFenceContainer) { return; }

        // Strategy 1: Use the raw code injected in data-code attribute (Server-side strategy)
        // Strategy 2: Fallback to DOM traversal of pre > code lines
        let codeText = codeFenceContainer.getAttribute("data-code") || "";
        
        if (!codeText) {
          const codeBlock = codeFenceContainer.querySelector(".mockup-code");
          if (codeBlock) {
            const pres = codeBlock.querySelectorAll("pre");
            if (pres.length > 0) {
              codeText = Array.from(pres)
                .map(pre => {
                  const code = pre.querySelector("code");
                  return code ? code.textContent || "" : pre.textContent || "";
                })
                .join("\n");
            } else {
              codeText = (codeBlock as HTMLElement).innerText || "";
            }
          }
        }
        
        if (codeText) {
          const cleanContent = codeText.replace(/\n$/, ""); 
          
          // Special handling for LaTeX to use the correct user-selected format
          let textToCopy = cleanContent;
          const mathEl = copyBtn.closest(".math-block, .math-inline") as HTMLElement | null;
          if (mathEl) {
            const tex = mathEl.dataset.tex || "";
            const isBlock = mathEl.classList.contains("math-block");
            const format = (mathEl.dataset.copyFormat as "dollar" | "bracket") || (isBlock ? "bracket" : "dollar");
            
            if (isBlock) {
                textToCopy = format === "dollar" ? `$$${tex}$$` : `\\[${tex}\\]`;
            } else {
                textToCopy = format === "dollar" ? `$${tex}$` : `\\(${tex}\\)`;
            }
          }

          navigator.clipboard.writeText(textToCopy).then(() => {
            // Visual feedback on the button itself
            const span = copyBtn.querySelector("span");
            if (span) {
              const originalText = span.textContent;
              span.textContent = "COPIED";
              copyBtn.classList.add("!text-emerald-400", "scale-110", "bg-emerald-500/10");
              
              setTimeout(() => {
                if (span) { span.textContent = originalText; }
                copyBtn.classList.remove("!text-emerald-400", "scale-110", "bg-emerald-500/10");
              }, 2000);
            }
            
            toast.success("Code copied", {
              duration: 2000,
              icon: (
                <div className="flex items-center justify-center rounded-full bg-emerald-500/20 p-1">
                  <svg role="img" aria-label="Success" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="text-emerald-400">
                    <title>Success</title>
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )
            });
          }).catch(err => {
            console.error("Clipboard copy failed:", err);
            toast.error("Clipboard access denied");
          });
        }
        return;
      }

      // 1. Image Toolbar Actions (Copy & Download)
      const imgActionBtn = target.closest(".img-action-btn");
      if (imgActionBtn) {
        e.stopPropagation();
        e.preventDefault();
        const url = (imgActionBtn as HTMLElement).dataset.url;
        const filename = (imgActionBtn as HTMLElement).dataset.filename;
        
        if (imgActionBtn.classList.contains("copy-img-btn") && url) {
          navigator.clipboard.writeText(url).then(() => {
            toast.success("Image URL copied", {
              duration: 2000,
              icon: (
                <div className="flex items-center justify-center rounded-full bg-emerald-500/20 p-1">
                  <svg role="img" aria-label="Success" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="text-emerald-500">
                    <title>Success</title>
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )
            });
          });
        } else if (imgActionBtn.classList.contains("download-img-btn") && url) {
          const a = document.createElement("a");
          a.href = url;
          a.download = filename || "downloaded-image.png";
          a.target = "_blank"; // Open in new tab if CORS prevents direct download
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success("Download started", { duration: 1500 });
        }
        return;
      }

      // 1.5 Touch-first math interaction (Double-click only now)
      if (!isFinePointer) {
        if (openTouchPreviewFromTarget(target, setPreview)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // 2. Fragment Jump & WikiLink Navigation (Delegated)
      const link = target.closest("a");
      if (link) {
        const href = link.getAttribute("href") || "";
        const dataTarget = link.getAttribute("data-target") || link.dataset.target || "";
        const dataFragment = link.getAttribute("data-fragment") || link.dataset.fragment || "";
        const dataPage = link.getAttribute("data-page") || link.dataset.page || "";
        
        // Construct a full target identifier
        const fullPath = (href === "#" || !href) ? (dataTarget || `${dataPage}${dataFragment ? `#${dataFragment}` : ""}`) : href;
        if (!fullPath && !dataFragment) { return; }

        // Extract path and fragment
        const [pathPartRaw, fragmentPartRaw] = fullPath.split("#");
        const pathPart = decodeURIComponent(pathPartRaw || "");
        const fragment = decodeURIComponent(fragmentPartRaw || dataFragment || "");
        
        const currentPath = window.location.pathname;
        const currentPathDecoded = decodeURIComponent(currentPath);
        const currentSlug = decodeURIComponent(currentPath.split("/").pop() || "");
        
        // Local logic: Path matches current slug, or empty path, or matches filename suffix
        // Obsidian Style: [[测试]] should be local if current page is [[Folder/测试]]
        const isLocal = !pathPart || 
                        pathPart === currentSlug || 
                        currentPathDecoded.endsWith(`-${pathPart}`) ||
                        currentPathDecoded.endsWith(`/${pathPart}`) ||
                        currentPathDecoded.endsWith(`-${encodeURIComponent(pathPart)}`) ||
                        currentPathDecoded.endsWith(`/${encodeURIComponent(pathPart)}`);
        
        if (isLocal && fragment) {
          e.preventDefault();
          const targetId = fragment;
          let targetEl: HTMLElement | null = null;
          
          // Strategy 1: Direct ID Match (including ^id and h- heading slugs)
          const bid = targetId.startsWith("^") ? targetId.slice(1) : targetId;
          const slugId = targetId.startsWith("h-") ? targetId : `h-${encodeURIComponent(targetId.trim().toLowerCase().replace(/\s+/g, '-')).slice(0, 50)}`;

          targetEl = document.getElementById(targetId) || 
                     document.getElementById(bid) ||
                     document.getElementById(slugId) ||
                     container.querySelector(`[id="${targetId}"], [id="${bid}"], [id="^${bid}"], [id="${slugId}"]`);
          
          // Strategy 2: ReadingHeader Slugify Compatibility (h-...)
          if (!targetEl) {
              const slugify = (s: string) => `h-${encodeURIComponent(s.trim().toLowerCase().replace(/\s+/g, '-')).slice(0, 50)}`;
              const s1 = slugify(targetId);
              targetEl = document.getElementById(s1) || container.querySelector(`[id="${s1}"]`);
          }

          // Strategy 3: Fuzzy Text Content Match (Headings)
          if (!targetEl) {
              const targetText = targetId.toLowerCase().replace(/\s+/g, '');
              targetEl = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))
                  .find(h => (h.textContent || '').toLowerCase().replace(/\s+/g, '') === targetText) as HTMLElement;
          }

          if (targetEl) {
            // Instant Leap
            const headerHeight = 120; // Unified with ReadingHeader offset
            const absoluteY = targetEl.getBoundingClientRect().top + window.scrollY;
            
            window.scrollTo({ 
              top: absoluteY - headerHeight, 
              behavior: "auto" 
            });
          
            // Visual Feedback: Highlight the target element (or its parent if it's an empty anchor)
            const highlightTarget = targetEl.classList.contains('block-anchor') ? (targetEl.parentElement || targetEl) : targetEl;
            highlightTarget.classList.add("jump-highlight");
            setTimeout(() => {
              highlightTarget?.classList.remove("jump-highlight");
            }, 1500);
            
            // Update URL hash without scroll jump (using the REAL target ID found)
            window.history.pushState(null, "", `#${targetEl.id}`);
            
            // Toast removed to prevent UI clutter on small jumps
            return;
          }
        } else if (!isLocal && pathPart) {
          // Navigation logic for cross-page wiki-links
          // We assume /blog/ as the base route for notes unless instructed otherwise
          e.preventDefault();
          const targetUrl = `${window.location.origin}/blog/${encodeURIComponent(pathPart)}${fragment ? `#${fragment}` : ""}`;
          window.location.assign(targetUrl);
          return;
        }
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const math = target.closest(".math-block, .math-display, .math-inline") as HTMLElement | null;
      
      // Don't toggle if we're clicking interactive UI buttons (Copy, Back, Format)
      const isUiButton = target.closest(".format-toggle-btn, .code-close-btn, .code-copy-btn-math");
      
      if (math && !isUiButton) { 
        e.preventDefault();
        e.stopPropagation();
        
        // Clear any text selected by the double click specifically
        window.getSelection()?.removeAllRanges();
        
        toggleMathSource(math); 
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const math = target.closest(".math-block, .math-display, .math-inline");
      if (math && e.detail > 1) {
        // Prevent default selection logic for 2nd+ clicks
        e.preventDefault();
      }
    };

    // --- Initial Hash Jump Handling ---
    const handleInitialHash = () => {
      const hash = window.location.hash;
      if (!hash) { return; }
      
      const fragment = decodeURIComponent(hash.slice(1));
      if (!fragment) { return; }

      // Premium Optimization: Wait for dynamic content (Math, Mermaid) to settle.
      // 400ms is a sweet spot for FCP plus micro-tasks.
      const timer = setTimeout(() => {
        const fakeLink = document.createElement("a");
        fakeLink.dataset.fragment = fragment;
        const fakeEvent = {
          target: fakeLink,
          preventDefault: () => {},
          stopPropagation: () => {},
          isInitialJump: true
        } as any;
        handleInteraction(fakeEvent);
      }, 400);
      return timer;
    };

    // --- Execution ---
    const init = async () => {
      // Initial sequence optimization
      requestAnimationFrame(() => {
        hydrateWikiEmbeds(container);
        transformCalloutIcons(container);
        
        // Mermaid is heavy, background it on initial mount but react quickly on theme change
        if (mounted.current) {
           renderMermaid(container);
        } else {
           ric(() => renderMermaid(container), { timeout: 1000 });
        }
        
        // Register all math blocks for incremental rendering
        container.querySelectorAll(".math-block, .math-inline").forEach(m => {
          mathHub?.register(m as HTMLElement);
        });

        ensureImageToolbarVisibility(container, isFinePointer);
      });
    };

    const jumpTimer = handleInitialHash();
    init();
    mounted.current = true;
      container.addEventListener("click", handleInteraction);
      container.addEventListener("dblclick", handleDblClick);
      container.addEventListener("mousedown", handleMouseDown);

    return () => {
      if (jumpTimer) { clearTimeout(jumpTimer); }
      container.removeEventListener("click", handleInteraction);
      container.removeEventListener("dblclick", handleDblClick);
      container.removeEventListener("mousedown", handleMouseDown);
      container.querySelectorAll(".math-inline, .math-block").forEach(el => {
        mathHub?.unregister(el as HTMLElement);
      });
    };
  }, [sanitizedHtml, resolvedTheme]);

  if (!html) { return null; }

  return (
    <>
      <div 
        ref={containerRef}
        className="starry-night-theme markdown-body w-full max-w-none prose dark:prose-invert"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted server-generated MDX content
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }} 
        suppressHydrationWarning={true}
      />

      {preview ? (
        <div className="fixed inset-0 z-[140] bg-background/88 backdrop-blur-xl md:hidden">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{preview.title}</div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
                  Drag to pan, pinch to zoom
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
                  <div className="relative" style={{ minWidth: "min(92vw, 28rem)", height: "auto" }}>
                    <Image
                      src={preview.imageSrc}
                      alt={preview.imageAlt || "Preview image"}
                      width={800}
                      height={600}
                      className="h-auto w-full rounded-2xl shadow-ambient"
                      style={{ height: "auto" }}
                      unoptimized={preview.imageSrc.startsWith('http')}
                      priority
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="mermaid-mobile-preview min-h-full min-w-max"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized Mermaid diagram content
                  dangerouslySetInnerHTML={{ __html: preview.htmlContent || "" }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
