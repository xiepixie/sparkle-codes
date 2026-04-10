"use client";

import { Check, Copy, Terminal } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { highlightLatex } from "@/lib/markdown-utils";

// Refined Import: Global Markdown Design System
import "../../../../../packages/markdown-parser/src/markdown.css";

/**
 * CLIENT RUNTIME WRAPPER (Event Delegation)
 * Simulates Next.js Client activation for Rust-rendered HTML
 */
function MarkdownRuntime({ children }: { children: React.ReactNode }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		// 1. IDE-Grade Row Selection
		const handleClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const pre = target.closest("pre");

			if (!pre) {
				return;
			}
			const fence = pre.closest(".code-fence");
			if (!fence) {
				return;
			}

			const pres = Array.from(fence.querySelectorAll("pre"));
			const index = pres.indexOf(pre);
			if (index === -1) {
				return;
			}

			if (e.shiftKey) {
				e.preventDefault();
				window.getSelection()?.removeAllRanges();
			}

			if (e.shiftKey && lastClickedIndex !== null) {
				const start = Math.min(index, lastClickedIndex);
				const end = Math.max(index, lastClickedIndex);
				pres.forEach((p, i) => {
					if (i >= start && i <= end) {
						p.classList.add("is-selected");
					}
				});
			} else {
				pre.classList.toggle("is-selected");
				setLastClickedIndex(index);
			}
		};

		// 2. Math Formula to Source Toggle
		const handleDoubleClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			const mathBlock = target.closest(".math-block");
			if (mathBlock instanceof HTMLElement && mathBlock.dataset.tex) {
				mathBlock.classList.toggle("source-mode");
				if (mathBlock.classList.contains("source-mode")) {
					mathBlock.setAttribute("data-rendered", mathBlock.innerHTML);
					const rawTex = mathBlock.getAttribute("data-tex") || "";
					
					// Use the logic from our production blog.ts for consistency
                    const decodedTex = rawTex
                        .replace(/&amp;/g, "&")
                        .replace(/&lt;/g, "<")
                        .replace(/&gt;/g, ">");
                    
                    const lines = decodedTex.split("\n").map(l => l.trim()).filter(l => l.length > 0);
                    const formattedLines = lines.map((line, i) => {
                        return `<pre data-prefix="${i + 1}"><span class="line-code">${highlightLatex(line)}</span></pre>`;
                    }).join("");

					mathBlock.innerHTML = `
            <div class="latex-source code-fence-container">
              <div class="code-fence mockup-code text-left !bg-transparent">
                ${formattedLines}
              </div>
            </div>
          `;
				} else {
					mathBlock.innerHTML = mathBlock.getAttribute("data-rendered") || "";
				}
			}
		};

		container.addEventListener("click", handleClick);
		container.addEventListener("dblclick", handleDoubleClick);
		return () => {
			container.removeEventListener("click", handleClick);
			container.removeEventListener("dblclick", handleDoubleClick);
		};
	}, [lastClickedIndex]);

	return (
		<div ref={containerRef} className="w-full">
			{children}
		</div>
	);
}

/**
 * INTELLIGENT COPY BUTTON
 */
function CodeCopyButton() {
	const [state, setState] = useState<"idle" | "copied">("idle");
	const [selectedCount, setSelectedCount] = useState(0);
	const buttonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const handleSelectionChange = () => {
			if (!buttonRef.current) {
				return;
			}
			const container = buttonRef.current.closest(".code-fence-container");
			const count = container?.querySelectorAll("pre.is-selected").length || 0;
			setSelectedCount(count);
		};
		document.addEventListener("click", handleSelectionChange);
		return () => document.removeEventListener("click", handleSelectionChange);
	}, []);

	const handleCopy = () => {
		if (!buttonRef.current) {
			return;
		}
		const container = buttonRef.current.closest(".code-fence-container");
		if (!container) {
			return;
		}

		const selectedLines = Array.from(
			container.querySelectorAll("pre.is-selected"),
		);
		const linesToRead =
			selectedLines.length > 0
				? selectedLines
				: Array.from(container.querySelectorAll("pre code"));

		const textToCopy = linesToRead
			.map((el) => (el as HTMLElement).innerText)
			.join("\n");

		navigator.clipboard.writeText(textToCopy);
		setState("copied");
		setTimeout(() => setState("idle"), 2000);
	};

	return (
		<button
			ref={buttonRef}
			type="button"
			onClick={handleCopy}
			className="copy-button relative z-20"
		>
			{state === "copied" ? (
				<Check className="w-3.5 h-3.5 text-green-500" />
			) : (
				<Copy className="w-3.5 h-3.5" />
			)}
			<span className="text-[10px] uppercase font-bold tracking-wider">
				{state === "copied"
					? "Copied"
					: selectedCount > 0
						? `Copy ${selectedCount} Lines`
						: "Copy"}
			</span>
		</button>
	);
}

/**
 * SENTINEL MARKDOWN LAB - FULL SHOWCASE MODULE
 */
export default function MarkdownExperimentPage() {
	const [density, setDensity] = useState<"comfortable" | "compact">(
		"comfortable",
	);

	return (
		<div className="min-h-screen bg-background text-foreground p-8 md:p-20 font-sans relative overflow-hidden transition-colors duration-500">
			{/* Background Ambience */}
			<div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[140px] pointer-events-none" />
			<div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

			{/* Control Panel */}
			<div className="max-w-4xl mx-auto mb-16 p-5 rounded-2xl border border-border bg-card/50 backdrop-blur-3xl flex flex-wrap items-center justify-between gap-6 shadow-glow relative z-10 transition-colors duration-500">
				<div className="flex items-center gap-4">
					<div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
						<Terminal className="w-5 h-5 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-black tracking-tight text-foreground">
							Sentinel V3.3 Showcase
						</h1>
						<p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
							Full Module Validation
						</p>
					</div>
				</div>

				<div className="flex bg-black/10 dark:bg-black/40 p-1.5 rounded-xl border border-border shadow-inner transition-colors duration-500">
					<button
						type="button"
						onClick={() => setDensity("comfortable")}
						className={`px-6 py-2 rounded-lg text-[10px] font-black transition-all duration-300 ${density === "comfortable" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
					>
						COMFORTABLE
					</button>
					<button
						type="button"
						onClick={() => setDensity("compact")}
						className={`px-6 py-2 rounded-lg text-[10px] font-black transition-all duration-300 ${density === "compact" ? "bg-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"}`}
					>
						COMPACT
					</button>
				</div>
			</div>

			{/* Comprehensive Markdown Content Container */}
			<MarkdownRuntime>
				<div
					className="starry-night-theme markdown-body mx-auto transition-all duration-500"
					data-density={density}
				>
					<section>
						<h1>Industrial Markdown Architecture</h1>
						<p>
							This document serves as a comprehensive visual validation of the
							Sentinel <code>markdown.css</code> engine. It demonstrates how
							deep integration with Next.js App Router and dynamic{" "}
							<strong>Light/Dark DOM Variables</strong>
							creates an unparalleled reading experience.
						</p>

						<blockquote>
							"In a sea of generic documentation, the physics of our digital
							objects define the weight of our engineering."
							<br />— Sentinel Core Protocol
						</blockquote>

						<h2>1. Academic Theory Modules</h2>
						<p>
							Callouts are fundamentally redesigned. Instead of basic boxes,
							they utilize layered glass morphic gradients and automatic CSS
							counters (`counter-increment`) to maintain structural rigor in
							scientific writing.
						</p>

						<div className="md-callout" data-callout-type="theory">
							<div className="md-callout__header">
								<span className="md-callout__icon" />
								<div className="md-callout__title">Quantum Morphism</div>
							</div>
							<div className="md-callout__content">
								{
									"Let $V$ be a vector space of infinite dimension. The layout mapping $\\psi: V \\to V^*$ remains completely stable under V3 density transformations if the global ambient lighting coefficient $\\kappa$ is strictly maintained."
								}
							</div>
						</div>

						<div className="md-callout" data-callout-type="warning">
							<div className="md-callout__header">
								<span className="md-callout__icon" />
								<div className="md-callout__title">
									Critical Attention Required
								</div>
							</div>
							<div className="md-callout__content">
								Removing the absolute padding values within the CSS custom
								properties will result in catastrophic layout collapse across
								nested MDX components.
							</div>
						</div>
					</section>

					<section>
						<h2>2. Interactive Code Engineering</h2>
						<p>
							By leveraging the <code>MarkdownRuntime</code> React wrapper,
							static Rust HTML is instantly activated. The block below supports{" "}
							<strong>Line Selection</strong>, <strong>Git Diffs</strong>, and{" "}
							<strong>Contextual Blur</strong>.
						</p>

						<div className="code-fence-container group">
							<div className="code-fence-header">
								<div className="flex items-center gap-3">
									<div className="flex gap-1.5">
										<div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
										<div className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
										<div className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
									</div>
									<span className="font-mono opacity-60 text-[11px]">
										pkg/core/engine.rs
									</span>
								</div>
								<CodeCopyButton />
							</div>

							<div className="code-fence mockup-code !bg-transparent py-6">
								<pre data-prefix="1" className="line-blur">
									<code>
										<span className="token keyword">use</span> sentinel::core::
										<span className="token punctuation">&#123;</span>Bloom, Glow
										<span className="token punctuation">&#125;</span>
									</code>
								</pre>
								<pre data-prefix="2">
									<code />
								</pre>
								<pre data-prefix="3" className="line-remove">
									<code>
										<span className="token keyword">let</span> renderer ={" "}
										<span className="token function">
											MarkdownRenderer::new
										</span>
										(<span className="token string">"v2_engine"</span>);
									</code>
								</pre>
								<pre data-prefix="4" className="line-add">
									<code>
										<span className="token keyword">let</span> root_engine ={" "}
										<span className="token function">
											StarryNightEngine::initialize
										</span>
										();
									</code>
								</pre>
								<pre data-prefix="5" className="line-highlight">
									<code>
										root_engine.
										<span className="token function">
											inject_runtime_metrics
										</span>
										(0.95);
									</code>
								</pre>
								<pre data-prefix="6">
									<code />
								</pre>
								<pre data-prefix="7" className="line-blur">
									<code>
										<span className="token keyword">return</span>{" "}
										<span className="token keyword">Ok</span>(root_engine);
									</code>
								</pre>
							</div>
						</div>
					</section>

					<section>
						<h2>3. Structural Data Layouts</h2>
						<p>
							Standard markdown tables have been revolutionized into{" "}
							<strong>Glass Zebra</strong> elements. They adapt flawlessly to{" "}
							<code>COMPACT</code> mode, ensuring maximum data legibility on
							small screens.
						</p>

						<div className="md-table-wrap">
							<table>
								<thead>
									<tr>
										<th>Sub-system Component</th>
										<th>Runtime Optimization</th>
										<th>FPS Delta</th>
										<th>Stability Status</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td>Rust WASM Parser</td>
										<td>Memory-safe multi-threading allocation</td>
										<td>+ 240%</td>
										<td>
											<strong>Stable</strong>
										</td>
									</tr>
									<tr>
										<td>KaTeX Processor</td>
										<td>Pre-computed glyph caching layer</td>
										<td>+ 180%</td>
										<td>
											<strong>Stable</strong>
										</td>
									</tr>
									<tr>
										<td>CSS Variable Injection</td>
										<td>Atomic OKLCH dynamic tokens</td>
										<td>+ 310%</td>
										<td>
											<strong>Experimental</strong>
										</td>
									</tr>
								</tbody>
							</table>
						</div>

						<div className="md-callout" data-callout-type="example">
							<div className="md-callout__header">
								<span className="md-callout__icon" />
								<div className="md-callout__title">
									Implementation Checklist
								</div>
							</div>
							<div className="md-callout__content">
								To achieve the table metrics shown above, ensure the following
								steps are met:
								<ul>
									<li>
										Verify <code>theme.css</code> OKLCH variables are present in
										the DOM.
									</li>
									<li>
										Confirm the <code>&lt;MarkdownRuntime&gt;</code> is mounted
										at layout root.
									</li>
									<li>
										Do NOT use arbitrary Tailwind utility classes within
										Markdown text strings.
									</li>
								</ul>
							</div>
						</div>
					</section>

					<section>
						<h2>4. Physical Formula Interactions</h2>
						<p>
							Mathematical formulas undergo a complete paradigm shift. Try{" "}
							<strong>double-clicking</strong> the equation below to instantly
							demystify the rendered calculus back into its raw, copyable LaTeX
							source block.
						</p>

						<div
							className="math-block cursor-pointer"
							data-tex="\mathcal{L} = \bar{\psi}(i\gamma^\mu D_\mu - m)\psi - \frac{1}{4}F_{\mu\nu}F^{\mu\nu}"
						>
							{
								"\\mathcal{L} = \\bar{\\psi}(i\\gamma^\\mu D_\\mu - m)\\psi - \\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu}"
							}
						</div>
					</section>
				</div>
			</MarkdownRuntime>

			<footer className="mt-40 pb-20 text-center relative z-10 border-t border-border pt-10">
				<div className="group cursor-pointer inline-flex items-center gap-3 px-6 py-2 rounded-full border border-border bg-card/20 hover:bg-card/40 transition-all shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
					<span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
					<span className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.3em]">
						System Aesthetics Validated
					</span>
				</div>
			</footer>
		</div>
	);
}
