"use client";

import { getAppUrl } from "@repo/utils";
import { useState, useEffect, useMemo, useRef, useTransition } from "react";
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from "framer-motion";
import { Search, Hash, FileText, Menu, Folder, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, Logo, Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger, ThemeToggle } from "@repo/ui";
import katex from "katex";
import "katex/dist/katex.min.css";
import { updateReadingHistory, normalizeSlug, updateLastReadSection, getReadingRecommendations, readReadingHistory } from "@/lib/reading-history";
import { openCommandCenter } from "@/lib/command-center";

interface ReadingSegment {
	id: string;
	title: string;
	renderedTitle: string;
	level: number;
	top: number;
	rawTitle: string;
}

function areSegmentsEqual(a: ReadingSegment[], b: ReadingSegment[]) {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i++) {
		const left = a[i];
		const right = b[i];
		if (
			left.id !== right.id ||
			left.title !== right.title ||
			left.renderedTitle !== right.renderedTitle ||
			left.level !== right.level ||
			left.top !== right.top ||
			left.rawTitle !== right.rawTitle
		) {
			return false;
		}
	}

	return true;
}

const JUMP_HIGHLIGHT_STYLE = `
@keyframes jump-flash {
	0% { background-color: transparent; }
	10% { background-color: rgba(var(--primary-rgb), 0.15); }
	100% { background-color: transparent; }
}
.jump-highlight {
	animation: jump-flash 2s cubic-bezier(0.16, 1, 0.3, 1);
	border-radius: 8px;
}
`;

interface ReadingHeaderProps {
	filename?: string;
	title?: string;
	slug?: string;
	suggestedPosts?: { slug: string; title: string }[];
}

function TrustedInlineHtml({ className, html }: { className?: string; html: string }) {
	// biome-ignore lint/security/noDangerouslySetInnerHtml: ReadingHeader renders trusted, preprocessed heading/title HTML.
	return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

const readingMenuItems = [
	{ label: "Home", href: "/" },
	{ label: "Blog", href: "/blog" },
	{ label: "Docs", href: getAppUrl('docs') },
];

export function ReadingHeader({ 
	filename, 
	title,
	slug,
	suggestedPosts = []
}: ReadingHeaderProps) {
	const displayTitle = title || filename || "Untitled";
	const isLongDisplayTitle = displayTitle.length > 18;

	const [segments, setSegments] = useState<ReadingSegment[]>([]);
	const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
	const [recentPosts, setRecentPosts] = useState<{ slug: string; title: string }[]>([]);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const segmentsRef = useRef<ReadingSegment[]>([]);
	const lastScrollY = useRef(0);
	const isGuarding = useRef(false);

	const [isNavigating, startNavTransition] = useTransition();
	const [pendingUrl, setPendingUrl] = useState<string | null>(null);
	const router = useRouter();
	const pathname = usePathname();

	// "油画" UX for the header itself: 
	// Sync navigation state to show feedback on interactive triggers.
	// We clear the loading state immediately when the target page is reached.
	useEffect(() => {
		if (!pendingUrl) {
			return;
		}

		const current = normalizeSlug(pathname);
		const target = normalizeSlug(pendingUrl);

		// Cleanup: URL matches destination OR transition finished
		if (current === target || target.endsWith(current) || !isNavigating) {
			setPendingUrl(null);
		}
	}, [pathname, pendingUrl, isNavigating]);

	useEffect(() => {
		segmentsRef.current = segments;
	}, [segments]);

	// Persistence for "Recently Viewed" & Scroll Restoration
	const isRestoring = useRef(false);
	useEffect(() => {
		if (typeof window === "undefined" || !slug) {
			return;
		}

		// 1. Persist the current visit
		updateReadingHistory({ slug, title: displayTitle });
		
		// 2. Derive recommendations for the UI (Visited + Suggested)
		const recommendations = getReadingRecommendations(slug, suggestedPosts);
		setRecentPosts(recommendations);

		// 3. Scroll Restoration (Resume Reading)
		// Only trigger once per slug mount
		if (isRestoring.current) {
			return;
		}

		const history = readReadingHistory();
		const entry = history.find((e) => normalizeSlug(e.slug) === normalizeSlug(slug));

		if (entry?.sectionSlug) {
			const targetId = entry.sectionSlug;
			
			const restoreScroll = () => {
				const element = document.getElementById(targetId);
				if (element) {
					isRestoring.current = true;
					isGuarding.current = true;
					
					const headerOffset = 100;
					const top = element.getBoundingClientRect().top + window.scrollY - headerOffset;
					
					window.scrollTo({ top, behavior: "smooth" });
					
					// Apply highlight effect using CSS animation defined in JUMP_HIGHLIGHT_STYLE
					element.classList.add("jump-highlight");
					setTimeout(() => {
						element.classList.remove("jump-highlight");
						isGuarding.current = false;
					}, 2000);
					
					return true;
				}
				return false;
			};

			// Attempt immediate restoration or wait for content hydration via MutationObserver
			if (!restoreScroll()) {
				const observer = new MutationObserver((_, obs) => {
					if (restoreScroll()) {
						obs.disconnect();
					}
				});
				
				const target = document.querySelector(".markdown-body");
				if (target) {
					observer.observe(target, { childList: true, subtree: true });
					// Timeout to prevent infinite observation if heading no longer exists
					setTimeout(() => observer.disconnect(), 3000);
				}
			}
		}
	}, [slug, displayTitle, suggestedPosts]);

	// Multi-boundary responsive progress tracking
	const { scrollY } = useScroll();
	const [bounds, setBounds] = useState({ top: 0, bottom: 0 });
	
	// Dynamic range mapping for precise article progress
	const progress = useTransform(
		scrollY,
		[bounds.top + 100, Math.max(bounds.top + 200, bounds.bottom - 900)], 
		[0, 1],
		{ clamp: true }
	);

	// Smoother visual scale for the actual UI line, but fast response
	const progressSpring = useSpring(progress, { stiffness: 2000, damping: 100 });

	const cleanPath = useMemo(() => {
		if (!slug) {
			return "EXPLORER";
		}
		// PARA & Area Cleanup Logic: Retain meaningful context like "项目" but strip structural metadata
		const segments = slug.split(/[-/]/);
		const filtered = segments.filter((s) => {
			if (!s) {
				return false;
			}
			const redundant = [
				"工作领域", "学习领域", "PROJECT", "PARA", 
				"0-收集箱", "收集", "INBOX", "NOTES", "BLOG", "ARCHIVE", "归档"
			];
			return !redundant.some(r => s.toUpperCase().includes(r.toUpperCase()));
		});
		
		// If everything is stripped, default to a high-level identifier
		if (filtered.length <= 1) {
			return filtered[0] || "ATLAS / CORE";
		}
		
		// Show the category path before the filename
		return filtered.slice(0, -1).join(" / ");
	}, [slug]);

	const discoverSegments = useMemo(() => {
		return () => {
			if (typeof document === "undefined") {
				return [];
			}
			const markdownBody = document.querySelector(".markdown-body");
			if (!markdownBody) {
				return [];
			}

			const headings = Array.from(markdownBody.querySelectorAll("h1, h2, h3, h4")) as HTMLElement[];
			return headings.map((h, i) => {
				// We expect the Rust parser to have provided IDs already.
				// If missing (unlikely in prod), we generate a consistent slug.
				if (!h.id) {
					const text = h.innerText.trim();
					// Robust slugification matching Rust parser (alphanumeric + single hyphens)
					const slug = text.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/-+$/, '')
						.replace(/^-+/, '');
					
					h.id = `h-${slug || i}`;
				}

				const clone = h.cloneNode(true) as HTMLElement;
				clone.querySelectorAll(".katex-mathml, .katex-html annotation").forEach((el) => {
					el.remove();
				});
				const cleanTitle = clone.innerText.trim();
				const rawTitle = h.innerHTML;

				return {
					id: h.id,
					title: cleanTitle,
					renderedTitle: renderKatex(rawTitle), // Process ONCE during discovery
					rawTitle: rawTitle,
					level: Number.parseInt(h.tagName.substring(1), 10),
					top: h.getBoundingClientRect().top + window.scrollY,
				};
			});
		};
	}, []);

	useEffect(() => {
		const target = document.querySelector(".markdown-body") as HTMLElement;
		if (!target) {
			return;
		}

		const updateBounds = () => {
			// Skip calculations during theme transitions to prevent progress bar jitter
			if ((window as any).__SPARKLE_THEME_TRANSITION__) {
				return;
			}
			const rect = target.getBoundingClientRect();
			const scrollY = window.scrollY;
			const headerOffset = 96;
			const nextBounds = {
				top: rect.top + scrollY - headerOffset,
				bottom: rect.top + scrollY + rect.height
			};

			setBounds((prev) => {
				if (prev.top === nextBounds.top && prev.bottom === nextBounds.bottom) {
					return prev;
				}
				return nextBounds;
			});
		};

		const updateSegments = () => {
			const nextSegments = discoverSegments();
			setSegments((prev) => (areSegmentsEqual(prev, nextSegments) ? prev : nextSegments));
		};
		
		const ro = new ResizeObserver(updateBounds);
		ro.observe(target);

		const observer = new MutationObserver(() => {
			updateSegments();
			updateBounds();
		});
		observer.observe(target, { childList: true, subtree: true, characterData: true });

		let frameId: number | null = null;
		const handleScroll = () => {
			if (isGuarding.current || (window as any).__SPARKLE_THEME_TRANSITION__) {
				return;
			}
			if (frameId) {
				cancelAnimationFrame(frameId);
			}
			frameId = requestAnimationFrame(() => {
				const y = window.scrollY;
				// Maintain last known position for restoration
				if (y > 0) {
					lastScrollY.current = y;
				}
				
				const scrollPos = y + 160;
				const currentSegments = segmentsRef.current;
				
				// O(n) reverse search without cloning the array
				for (let i = currentSegments.length - 1; i >= 0; i--) {
					if (currentSegments[i].top <= scrollPos) {
						const segment = currentSegments[i];
						setActiveSegmentId((prev) => {
							if (prev !== segment.id) {
								// Update section history when segment truly changes
								if (slug) {
									updateLastReadSection(slug, segment.id, segment.title);
								}
								return segment.id;
							}
							return prev;
						});
						break;
					}
				}
			});
		};

		updateSegments();
		updateBounds();
		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", updateBounds);

		return () => {
			ro.disconnect();
			observer.disconnect();
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", updateBounds);
		};
	}, [slug, discoverSegments]); // Force re-binding observers when the active post changes

	// Reset state and clear stale data on route change
	useEffect(() => {
		setSegments([]);
		setActiveSegmentId(null);
		isRestoring.current = false;
	}, [slug]);

	const renderKatex = (text: string) => {
		if (typeof window === "undefined" || !text) {
			return text;
		}
		
		// Prevent double-rendering if KaTeX is already present
		if (text.includes("katex-html")) {
			return text;
		}

		// 1. Restore escaped hashtags from Rust placeholder BEFORE regex split
		const restoredText = text.replace(/__SPARKLE_ESCAPED_HASH__/g, '#');

		const hasMathClasses = restoredText.includes('math-inline') || restoredText.includes('math-block') || restoredText.includes('sparkle-math');
		
		if (hasMathClasses) {
			const temp = document.createElement("div");
			temp.innerHTML = restoredText;
			temp.querySelectorAll(".math-inline, .math-block, .sparkle-math").forEach((el) => {
				const tex = el.getAttribute("data-tex");
				if (tex) {
					try {
						// ALWAYS use inline mode for header/lists to prevent large vertical gaps
						el.innerHTML = katex.renderToString(tex, {
							throwOnError: false,
							displayMode: false, 
						});
						// Strip unnecessary margins often added by KaTeX displays
						(el as HTMLElement).style.margin = "0";
						(el as HTMLElement).style.padding = "0";
					} catch (_error) {}
				}
			});
			return temp.innerHTML;
		}

		// Fallback for raw $ formula $
		return restoredText.split(/(\$\$?[\s\S]+?\$\$?)/g).map((part) => {
			if (part.startsWith("$")) {
				const isBlock = part.startsWith("$$");
				const formula = isBlock ? part.slice(2, -2) : part.slice(1, -1);
				try {
					return katex.renderToString(formula, {
						displayMode: false, // Force inline for header readability
						throwOnError: false
					});
				} catch (_error) {
					return part;
				}
			}
			return part;
		}).join("");
	};

	const activeSegment = segments.find((s) => s.id === activeSegmentId);
	const centerLabel = activeSegment?.renderedTitle || renderKatex(displayTitle);

	const handleMenuOpenChange = (nextOpen: boolean) => {
		if (typeof document !== "undefined") {
			const activeElement = document.activeElement as HTMLElement | null;
			activeElement?.blur();
		}
		setIsMenuOpen(nextOpen);
	};

	const openReadingJump = (jumpTo?: "sections" | "history") => {
		openCommandCenter({
			mode: "jump",
			jumpTo,
			reading: {
				title: displayTitle,
				slug,
				sections: segments.map((segment) => ({
					id: segment.id,
					title: segment.title,
					renderedTitle: segment.renderedTitle,
					level: segment.level,
				})),
				recentPosts,
			},
		});
	};

	const openReadingSearch = () => {
		openCommandCenter({
			mode: "search",
			reading: {
				title: displayTitle,
				slug,
				sections: segments.map((segment) => ({
					id: segment.id,
					title: segment.title,
					renderedTitle: segment.renderedTitle,
					level: segment.level,
				})),
				recentPosts,
			},
		});
	};

	return (
		<>
			<style>{JUMP_HIGHLIGHT_STYLE}</style>
			
			<div className="pointer-events-none fixed inset-x-0 top-3 z-[60] px-3 sm:px-4 md:top-5 md:px-6">
                <motion.div
                    initial={{ y: -40, opacity: 0, scale: 0.98 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    className="pointer-events-auto mx-auto flex w-full max-w-6xl"
                >
                    <div 
                        className={cn(
                            "group relative flex h-12 w-full select-none items-center gap-1 rounded-[1.75rem] px-1.5 transition-all duration-500 md:h-14 md:gap-2 md:px-2",
                            "bg-background/88 border border-border/60 backdrop-blur-3xl shadow-ambient ring-1 ring-border/50",
                            "hover:border-primary/40 hover:shadow-[0_8px_64px_rgba(var(--primary-rgb),0.2)]"
                        )}
                    >
						<div className="flex h-full min-w-0 shrink-0 items-center gap-2 pl-1 sm:gap-3 md:pl-2">
							<Link
								href="/"
								className={cn(
									"group/logo flex shrink-0 items-center gap-2 rounded-full px-2 py-1.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
									isLongDisplayTitle && "xl:hidden",
								)}
							>
								<Logo
									withLabel={false}
									className="transition-all duration-300 group-hover/logo:scale-110 group-hover/logo:rotate-[12deg] group-hover/logo:brightness-125"
								/>
								<span className="hidden bg-gradient-to-r from-foreground to-foreground/65 bg-clip-text text-base font-bold tracking-tight text-transparent transition-all duration-500 group-hover/logo:from-primary group-hover/logo:to-foreground sm:inline-block">
									Sparkle
								</span>
							</Link>

							{/* Navigator Group: Context & Recent History */}
							<div
								className={cn(
									"relative hidden h-full min-w-0 items-center gap-2 pl-3 lg:flex lg:min-w-[10rem] lg:max-w-[18rem] xl:max-w-[22rem]",
									!isLongDisplayTitle && "border-l border-border/20",
									isLongDisplayTitle && "xl:max-w-[26rem] xl:pl-0",
								)}
							>
								{/* Path: Pure Metadata (Non-interactive) */}
								<div className="flex shrink-0 cursor-default items-center gap-1.5 px-1 py-0.5 opacity-40">
									<Folder size={11} className="shrink-0 text-primary" />
									<span className="max-w-[80px] truncate text-[10px] font-bold tracking-wider text-muted-foreground uppercase xl:max-w-[110px]">
										{cleanPath}
									</span>
								</div>

								<div className="h-3 w-px shrink-0 bg-border/20" />
								
								<div className="relative min-w-0 flex-1">
									<button 
										type="button"
										onClick={(e) => { 
											e.preventDefault();
											e.stopPropagation(); 
											openReadingJump("history");
										}}
										aria-label="Open reading history"
										className={cn(
											"group/filename relative flex w-full items-center gap-1.5 rounded-lg px-2 py-1 transition-all min-w-0 interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
											"hover:bg-primary/[0.08]"
										)}
									>
										<FileText size={10} className="shrink-0 text-primary/60 transition-transform group-hover/filename:rotate-3" />
										<TrustedInlineHtml
											className="min-w-0 truncate text-[11px] font-black tracking-tight text-foreground transition-colors duration-300 group-hover/filename:text-primary"
											html={renderKatex(displayTitle)}
										/>
									</button>
								</div>
							</div>
                        </div>

						{/* Segment Group: Progress & Sections */}
                        <button 
                            type="button"
                            onClick={() => openReadingJump("sections")}
                            aria-label={activeSegment ? `Jump to section ${activeSegment.title}` : "Open reading navigation"}
                            className="group/nav relative flex h-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[1.1rem] px-3 transition-colors hover:bg-accent/40 active:scale-[0.98] interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:px-4"
                        >
                            <AnimatePresence mode="wait">
                                {activeSegment ? (
                                    <motion.div
                                        key={activeSegment.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                        className="flex min-w-0 max-w-full items-center gap-2"
                                    >
                                        <div className="mt-0.5 hidden items-center gap-0.5 opacity-40 sm:flex">
                                            {Array.from({ length: activeSegment.level }).map((_, i) => (
                                                <Hash key={i} size={8} className="text-primary stroke-[3.5px]" />
                                            ))}
                                        </div>
                                        <TrustedInlineHtml
                                            className="max-w-full truncate text-[11px] font-bold tracking-tight text-foreground/80 sm:text-[12px] group-hover/nav:text-primary transition-colors"
                                            html={activeSegment.renderedTitle}
                                        />
                                    </motion.div>
                                ) : (
                                    <TrustedInlineHtml
                                        key={displayTitle}
                                        className="max-w-full truncate text-[10px] font-bold tracking-tight text-foreground/55 sm:text-[12px] group-hover/nav:text-foreground transition-colors"
                                        html={centerLabel}
                                    />
                                )}
                            </AnimatePresence>
                        </button>
 
                        <div className="flex shrink-0 items-center gap-1 border-l border-border/20 pl-1 sm:gap-1.5 sm:pl-2">
                            <button 
                                type="button"
                                onClick={openReadingSearch}
                                aria-label="Open reading search"
                                className="group/search flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-90 interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:h-11 md:w-11"
                            >
                                <Search size={15} className="transition-transform group-hover/search:scale-110" />
                            </button>

							<ThemeToggle className="h-10 w-10 md:h-11 md:w-11" />

							<Sheet open={isMenuOpen} onOpenChange={handleMenuOpenChange}>
								<SheetTrigger asChild>
									<button
										type="button"
										aria-label="Open reading menu"
										className={cn(
											"flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background/50 backdrop-blur-xl transition-all hover:bg-accent/60 interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:h-11 md:w-11",
											isMenuOpen && "opacity-0 pointer-events-none"
										)}
									>
										<Menu className="h-5 w-5 text-muted-foreground transition-colors" />
									</button>
								</SheetTrigger>
								<SheetContent side="right" hideClose className="flex w-full flex-col border-l border-border/50 bg-background/92 p-6 backdrop-blur-3xl sm:w-[340px] sm:p-10">
									<SheetTitle className="mb-4 text-xs font-bold uppercase tracking-widest opacity-30">Reading Menu</SheetTitle>
									<SheetDescription className="sr-only">Reading navigation menu.</SheetDescription>

									<div className="mb-8 rounded-2xl border border-border/50 bg-background/50 p-4">
										<div className="mb-2 text-[9px] font-black uppercase tracking-[0.28em] text-primary/70">Current Article</div>
										<TrustedInlineHtml
											className="text-sm font-semibold leading-relaxed text-foreground/85"
											html={renderKatex(displayTitle)}
										/>
									</div>

									<div className="flex flex-col gap-2 sm:gap-3">
										{readingMenuItems.map((item) => {
											const isExternal = item.href.startsWith("http");
											const Comp = isExternal ? "a" : (Link as any);
											const isActive = pathname === item.href;

											return (
												<Comp
													key={item.href}
													href={item.href}
													{...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
													onClick={() => {
														if (!isExternal) {
															setPendingUrl(item.href);
															startNavTransition(() => {
																handleMenuOpenChange(false);
																router.push(item.href);
															});
														} else {
															// For external links, close the menu asynchronously 
															// to ensure the browser prioritizes opening the new tab/url.
															setTimeout(() => {
																handleMenuOpenChange(false);
															}, 10);
														}
													}}
													className={cn(
														"group relative flex items-center justify-between rounded-2xl px-4 py-3 text-lg font-semibold transition-all sm:text-xl",
														isActive 
															? "bg-primary/10 text-primary" 
															: "text-muted-foreground hover:bg-primary/5 hover:text-primary",
														pendingUrl === item.href && "opacity-70 grayscale-[0.5]"
													)}
												>
													<span>{item.label}</span>
													{pendingUrl === item.href ? (
														<Loader2 size={18} className="animate-spin" />
													) : (
														isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary ring-4 ring-primary/20" />
													)}
												</Comp>
											);
										})}
									</div>

									<div className="mt-auto flex items-center justify-between border-t border-border/50 pt-8 sm:pt-10">
										<span className="text-xs text-muted-foreground/50">Theme Mode</span>
										<ThemeToggle />
									</div>
								</SheetContent>
							</Sheet>
                        </div>
 
                        <div className="absolute -bottom-[1px] left-14 right-14 h-[1.5px] overflow-hidden rounded-full">
                            <motion.div 
                                style={{ scaleX: progressSpring, originX: 0 }}
                                className="w-full h-full bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.4)]"
                            />
                        </div>
                    </div>
                </motion.div>
			</div>

		</>
	);
}
