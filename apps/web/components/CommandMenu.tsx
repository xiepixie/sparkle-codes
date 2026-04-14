"use client";

import React, {
	useDeferredValue,
	useEffect,
	useRef,
	useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
	CommandSurface,
	CommandSurfaceBody,
	CommandSurfaceFooter,
	CommandSurfaceHeader,
} from "@/components/CommandSurface";
import {
	COMMAND_CENTER_EVENT,
	COMMAND_CENTER_SYNC_EVENT,
	type CommandCenterReadingContext,
	type OpenCommandCenterPayload,
	scrollToReadingSection,
} from "@/lib/command-center";
import { readFilteredHistory } from "@/lib/reading-history";
import type { ExplorerNode } from "@repo/database";
import { cn } from "@repo/ui";
import { normalizeSlug } from "@repo/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Hash, Loader2, Search } from "lucide-react";

// New Modular Sub-components
import { BrowserPanel } from "./command-menu/BrowserPanel";
import { JumpPanel } from "./command-menu/JumpPanel";
import { SearchPanel } from "./command-menu/SearchPanel";
import type { CommandMode, SearchResultItem } from "./command-menu/types";

// Helper for search results
function normalizeSearchResults(data: unknown): SearchResultItem[] {
	if (!Array.isArray(data)) {
		return [];
	}
	return data.reduce<SearchResultItem[]>((acc, item, index) => {
		if (!item || typeof item !== "object") {
			return acc;
		}
		const candidate = item as Record<string, unknown>;
		const title = typeof candidate.title === "string" ? candidate.title : (typeof candidate.name === "string" ? candidate.name : null);
		const url = typeof candidate.url === "string" ? candidate.url : (typeof candidate.href === "string" ? candidate.href : null);
		if (!title || !url) {
			return acc;
		}

		acc.push({
			id: typeof candidate.id === "string" ? candidate.id : `${url}-${index}`,
			title,
			description: String(candidate.description || candidate.content || candidate.excerpt || ""),
			bodyPreview: candidate.bodyPreview as string | undefined,
			url,
			section: candidate.section as string | undefined,
			context: candidate.context as string | undefined,
			highlightedTitle: candidate.highlightedTitle as string | undefined,
			highlightedDescription: candidate.highlightedDescription as string | undefined,
			highlightedBodyPreview: candidate.highlightedBodyPreview as string | undefined,
			highlightedContext: candidate.highlightedContext as string | undefined,
		});
		return acc;
	}, []);
}

export function CommandMenu() {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<CommandMode>("browse");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
	const [searchLoading, setSearchLoading] = useState(false);
	const [readingContext, setReadingContext] = useState<CommandCenterReadingContext | null>(null);
	const [recentReading, setRecentReading] = useState<SearchResultItem[]>([]);
	const [pendingUrl, setPendingUrl] = useState<string | null>(null);
	
	// Explorer State
	const [explorerPath, setExplorerPath] = useState<string[]>(["工作领域"]);
	const [explorerNodes, setExplorerNodes] = useState<ExplorerNode[]>([]);
	const [explorerLoading, setExplorerLoading] = useState(false);
	const [explorerDirection, setExplorerDirection] = useState<1 | -1>(1);

	// Interaction State
	const [activeIndex, setActiveIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const router = useRouter();
	const pathname = usePathname();

	const deferredSearchQuery = useDeferredValue(searchQuery);

	// Reset scroll and index when mode or results change
	useEffect(() => {
		setActiveIndex(0);
		if (containerRef.current) {
			containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
		}
	}, [mode, explorerPath, searchResults]);

	// Initialize context and history
	useEffect(() => {
		const handleOpen = (e: Event) => {
			const customEvent = e as CustomEvent<OpenCommandCenterPayload>;
			if (customEvent.detail?.mode) {
				setMode(customEvent.detail.mode);
			}
			setOpen(true);
		};

		const handleSync = (e: Event) => {
			const customEvent = e as CustomEvent<{ reading: CommandCenterReadingContext }>;
			if (customEvent.detail?.reading) {
				setReadingContext(customEvent.detail.reading);
			}
		};

		window.addEventListener(COMMAND_CENTER_EVENT, handleOpen);
		window.addEventListener(COMMAND_CENTER_SYNC_EVENT, handleSync);
		
		return () => {
			window.removeEventListener(COMMAND_CENTER_EVENT, handleOpen);
			window.removeEventListener(COMMAND_CENTER_SYNC_EVENT, handleSync);
		};
	}, []);

	// Load history whenever open changes to true
	useEffect(() => {
		if (open) {
			try {
				const history = readFilteredHistory();
				if (Array.isArray(history)) {
					setRecentReading(history.map(h => ({
						id: h.slug,
						title: h.title,
						description: "",
						url: `/blog/${h.slug}`
					})));
				}
			} catch (err) {
				console.error("Failed to load reading history:", err);
			}
		}
	}, [open]);

	// Global Keyboard Shortcuts
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, []);

	// Focus input on open
	useEffect(() => {
		if (open) {
			setPendingUrl(null);
			setTimeout(() => inputRef.current?.focus(), 50);
		} else {
			setSearchQuery("");
			setMode("browse");
		}
	}, [open]);

	const explorerCache = useRef<Record<string, ExplorerNode[]>>({});

	// Fetch Explorer Nodes
	useEffect(() => {
		if (!open || mode !== "browse") {
			return;
		}

		const currentPath = explorerPath.join("/");
		if (explorerCache.current[currentPath]) {
			setExplorerNodes(explorerCache.current[currentPath]);
			return;
		}

		const controller = new AbortController();
		const fetchExplorer = async () => {
			setExplorerLoading(true);
			try {
				const prefix = currentPath.endsWith("/") ? currentPath : `${currentPath}/`;
				const depth = explorerPath.length;

				const res = await fetch(`/api/blog-folders?prefix=${encodeURIComponent(prefix)}&depth=${depth}`, { 
					signal: controller.signal 
				});
				const data = await res.json();
				const nodes = Array.isArray(data) ? data : [];
				explorerCache.current[currentPath] = nodes;
				setExplorerNodes(nodes);
			} catch (err) {
				if (!(err instanceof DOMException && err.name === "AbortError")) {
					console.error("Explorer fetch failed:", err);
				}
			} finally {
				setExplorerLoading(false);
			}
		};

		fetchExplorer();
		return () => controller.abort();
	}, [open, mode, explorerPath]);

	// Search logic
	useEffect(() => {
		if (!open || mode !== "search" || !deferredSearchQuery) {
			if (!deferredSearchQuery) {
				setSearchResults([]);
			}
			return;
		}

		const controller = new AbortController();
		const timeoutId = window.setTimeout(async () => {
			setSearchLoading(true);
			try {
				const res = await fetch(`/api/search?query=${encodeURIComponent(deferredSearchQuery)}`, {
					signal: controller.signal,
				});
				const data = await res.json();
				const results = normalizeSearchResults(data);
				
				const currentPathKey = normalizeSlug(pathname);
				const appContextKey = readingContext?.slug ? normalizeSlug(readingContext.slug) : null;

				setSearchResults(results.filter((item) => {
					const itemKey = normalizeSlug(item.url);
					return itemKey !== currentPathKey && itemKey !== appContextKey;
				}));
			} catch (err) {
				if (!(err instanceof DOMException && err.name === "AbortError")) {
					setSearchResults([]);
				}
			} finally {
				setSearchLoading(false);
			}
		}, 300);

		return () => {
			window.clearTimeout(timeoutId);
			controller.abort();
		};
	}, [open, mode, deferredSearchQuery, pathname, readingContext]);

	// Navigation Handlers
	const navigateIntoFolder = (name: string) => {
		if (explorerPath.length >= 8) {
			return; 
		}
		setExplorerDirection(1);
		setExplorerPath([...explorerPath, name]);
		setActiveIndex(0);
	};

	const navigateToBlogPost = (url: string) => {
		setPendingUrl(url);
		router.push(url);
		setTimeout(() => setOpen(false), 600);
	};

	const handleReadingJump = (section: any) => {
		if (!section?.id) {
			return;
		}
		setOpen(false);
		scrollToReadingSection(section.id);
	};

	const handleSearchSuggestion = (suggestion: string) => {
		setSearchQuery(suggestion);
		setMode("search");
	};

	const prefetchBlog = (slug: string) => {
		router.prefetch(`/blog/${slug}`);
	};

	// Keyboard Protocol
	useEffect(() => {
		if (!open || pendingUrl){
			return;
		}

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.isComposing) { return; }
			const explorerCount = (explorerNodes || []).length;
			const searchCount = (searchResults || []).length;
			const jumpSectionCount = (readingContext?.sections || []).length;
			const recentCount = (recentReading || []).length;

			const maxIdx = 
				mode === "browse" ? explorerCount - 1 :
				mode === "search" ? (searchCount > 0 ? searchCount - 1 : recentCount - 1) :
				jumpSectionCount + recentCount - 1;

			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					setActiveIndex((prev) => {
						return Math.min(prev + 1, maxIdx);
					});
					break;
				}
				case "ArrowUp": {
					e.preventDefault();
					setActiveIndex((prev) => {
						return Math.max(prev - 1, 0);
					});
					break;
				}
				case "Tab": {
					e.preventDefault();
					const modes: CommandMode[] = ["browse", "search"];
					if (readingContext) {
						modes.push("jump");
					}
					setMode((prev) => {
						const idx = modes.indexOf(prev);
						const nextIdx = e.shiftKey ? (idx - 1 + modes.length) % modes.length : (idx + 1) % modes.length;
						return modes[nextIdx];
					});
					break;
				}
				case "ArrowRight": {
					if (mode === "browse") {
						e.preventDefault();
						const node = explorerNodes[activeIndex];
						if (node?.type === "folder") {
							navigateIntoFolder(node.name);
						}
					}
					break;
				}
				case "ArrowLeft": {
					if (mode === "browse") {
						e.preventDefault();
						if (explorerPath.length > 1) {
							setExplorerDirection(-1);
							setExplorerPath((prev) => {
								return prev.slice(0, -1);
							});
							setActiveIndex(0);
						}
					}
					break;
				}
				case "Enter": {
					e.preventDefault();
					handleSelect();
					break;
				}
				case "Escape": {
					setOpen(false);
					break;
				}
				case "Backspace": {
					if (!searchQuery) {
						if (mode === "browse") {
							if (explorerPath.length > 1) {
								e.preventDefault();
								setExplorerDirection(-1);
								setExplorerPath((prev) => {
									return prev.slice(0, -1);
								});
								setActiveIndex(0);
							}
						}
					}
					break;
				}
			}
		};

		const handleSelect = () => {
			if (mode === "browse") {
				const node = explorerNodes[activeIndex];
				if (!node) {
					return;
				}
				if (node.type === "folder") {
					navigateIntoFolder(node.name);
				} else if (node.slug) {
					navigateToBlogPost(`/blog/${node.slug}`);
				}
			} else if (mode === "search") {
				const results = searchResults.length > 0 ? searchResults : recentReading;
				const result = results[activeIndex];
				if (result) {
					navigateToBlogPost(result.url);
				}
			} else if (mode === "jump") {
				const sections = readingContext?.sections || [];
				const sectionCount = sections.length;
				if (activeIndex < sectionCount) {
					handleReadingJump(sections[activeIndex]);
				} else {
					const historyItem = recentReading[activeIndex - sectionCount];
					if (historyItem) {
						navigateToBlogPost(historyItem.url);
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, mode, activeIndex, explorerNodes, searchResults, readingContext, recentReading, explorerPath, searchQuery, pendingUrl]);

	const displayPath = explorerPath.slice(1);

	return (
		<CommandSurface open={open} onOpenChange={setOpen} title="Structural Explorer" className="max-w-[calc(100vw-24px)]">
			<CommandSurfaceHeader className="relative border-b border-border/10 bg-muted/[0.08] px-5 py-4 backdrop-blur-xl sm:px-7">
				<div className="flex w-full items-start gap-4">
					<div className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 transition-all duration-500">
						<div className="absolute inset-1 rounded-[14px] bg-primary/[0.045]" />
						{searchLoading || explorerLoading ? (
							<Loader2 className="z-10 h-5 w-5 animate-spin text-primary" />
						) : mode === "search" ? (
							<Search className="z-10 h-5 w-5 text-primary" />
						) : mode === "jump" ? (
							<Compass className="z-10 h-5 w-5 text-primary" />
						) : (
							<div className="relative z-10 flex items-center justify-center">
								<div className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.6)] animate-pulse" />
								<div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-primary/40 animate-ping" />
							</div>
						)}
					</div>

					<div className="min-w-0 flex-1">
						<div className="mb-3 flex items-center justify-between gap-3">
							<div className="min-w-0">
								<p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground/55">
									{mode === "browse" ? "Knowledge Explorer" : mode === "search" ? "Knowledge Search" : "Reading Jump"}
								</p>
								<p className="mt-1 truncate text-sm text-muted-foreground/75">
									{mode === "browse"
										? `Browsing ${displayPath.length ? displayPath.join(" / ") : "root directories"}`
										: mode === "search"
											? "Find notes, sections, and remembered reading paths."
											: readingContext?.title || "Jump within the current reading flow."}
								</p>
							</div>
							<div className="hidden shrink-0 items-center gap-2 rounded-xl border border-border/20 bg-background/50 px-2.5 py-1.5 text-[10px] font-bold tracking-[0.18em] text-muted-foreground/55 sm:flex">
								<span>ESC</span>
								<span className="opacity-40">CLOSE</span>
							</div>
						</div>

						<div className="flex items-center gap-3 rounded-2xl border border-border/30 bg-background/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors focus-within:border-primary/30 focus-within:bg-background/82">
							<Search className="h-4 w-4 shrink-0 text-muted-foreground/45" />
							<input
								ref={inputRef}
								value={searchQuery}
								onChange={(e) => {
									setSearchQuery(e.target.value);
									if (mode !== "search" && e.target.value) {
										setMode("search");
									}
								}}
								placeholder={
									mode === "browse" ? "Search directory, note, or folder..." :
									mode === "search" ? "Search across the knowledge base..." :
									"Type to find a section or recent page..."
								}
								className="w-full bg-transparent pr-2 text-[17px] font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35 sm:text-[18px]"
							/>
							{searchQuery ? (
								<span className="hidden rounded-lg border border-border/20 bg-muted/20 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/55 sm:inline-flex">
									Live
								</span>
							) : null}
						</div>
					</div>
				</div>
			</CommandSurfaceHeader>

			<CommandSurfaceBody className="h-[62vh] overflow-hidden py-0">
				<div ref={containerRef} className="h-full overflow-y-auto no-scrollbar">
					<div className="mx-auto w-full max-w-4xl px-5 pb-6 pt-5 sm:px-7">
						<AnimatePresence mode="wait">
							<motion.div
								key={mode}
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.15, ease: "easeOut" }}
								className="will-change-transform"
							>
								{mode === "browse" && (
									<BrowserPanel 
										explorerPath={displayPath}
										explorerNodes={explorerNodes}
										explorerLoading={explorerLoading}
										explorerDirection={explorerDirection}
										activeIndex={activeIndex}
										setActiveIndex={setActiveIndex}
										navigateIntoFolder={navigateIntoFolder}
										navigateToBlogPost={navigateToBlogPost}
										setExplorerPath={(p) => setExplorerPath(["工作领域", ...p])}
										setExplorerDirection={setExplorerDirection}
										prefetchBlog={prefetchBlog}
										pendingUrl={pendingUrl}
									/>
								)}
								
								{mode === "search" && (
									<SearchPanel 
										searchResults={searchResults}
										searchLoading={searchLoading}
										activeIndex={activeIndex}
										setActiveIndex={setActiveIndex}
										navigateToBlogPost={navigateToBlogPost}
										recentReading={recentReading}
										searchQuery={searchQuery}
										pendingUrl={pendingUrl}
										handleSearchSuggestion={handleSearchSuggestion}
									/>
								)}

								{mode === "jump" && (
									<JumpPanel 
										readingContext={readingContext}
										filteredRecentReading={recentReading.filter(h => h.url !== `/blog/${readingContext?.slug}`)}
										activeIndex={activeIndex}
										setActiveIndex={setActiveIndex}
										handleReadingJump={handleReadingJump}
										navigateToBlogPost={navigateToBlogPost}
										pendingUrl={pendingUrl}
									/>
								)}
							</motion.div>
						</AnimatePresence>
					</div>
				</div>
			</CommandSurfaceBody>

			<CommandSurfaceFooter className="flex items-center justify-between gap-4 border-t border-border/10 bg-muted/[0.08] px-4 py-3 sm:px-6">
				<div className="hidden flex-1 items-center gap-4 text-[10px] font-bold tracking-[0.16em] text-muted-foreground/45 md:flex">
					<div className="flex items-center gap-1.5">
						<kbd className="rounded-md border border-border/20 bg-background/60 px-1.5 py-1 font-sans">⌘</kbd>
						<kbd className="rounded-md border border-border/20 bg-background/60 px-1.5 py-1 font-sans">K</kbd>
						<span>TOGGLE</span>
					</div>
					<div className="flex items-center gap-1.5">
						<kbd className="rounded-md border border-border/20 bg-background/60 px-1.5 py-1 font-sans">↑</kbd>
						<kbd className="rounded-md border border-border/20 bg-background/60 px-1.5 py-1 font-sans">↓</kbd>
						<span>MOVE</span>
					</div>
					<div className="flex items-center gap-1.5">
						<kbd className="rounded-md border border-border/20 bg-background/60 px-1.5 py-1 font-sans">↵</kbd>
						<span>OPEN</span>
					</div>
				</div>

				<div className="relative flex shrink-0 gap-1 rounded-2xl border border-border/20 bg-background/55 p-1">
					<motion.div
						layoutId="nav-pill"
						className="absolute inset-y-1 z-0 rounded-[12px] border border-primary/20 bg-primary/12 shadow-[0_0_18px_rgba(var(--primary-rgb),0.10)]"
						initial={false}
						transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
						style={{
							left: mode === "browse" ? "4px" : mode === "search" ? "94px" : "184px",
							width: "86px",
						}}
					/>

					{[
						{ id: "browse", label: "BROWSE", icon: Hash },
						{ id: "search", label: "SEARCH", icon: Search },
						{ id: "jump", label: "JUMP", icon: Compass, disabled: !readingContext },
					].map((tab) => {
						const Icon = tab.icon;
						const isActive = mode === tab.id;
						return (
							<button
								type="button"
								key={tab.id}
								disabled={tab.disabled}
								onClick={() => {
									setMode(tab.id as CommandMode);
									setActiveIndex(0);
								}}
								className={cn(
									"relative z-10 flex w-[86px] items-center justify-center gap-1.5 rounded-[12px] py-2 transition-colors duration-300",
									isActive ? "text-primary" : "text-muted-foreground/45 hover:text-foreground/70",
									tab.disabled && "opacity-20 cursor-not-allowed"
								)}
							>
								<Icon className={cn("shrink-0 transition-transform duration-300", isActive ? "scale-110" : "scale-100")} size={12} />
								<span className="text-[10px] font-black tracking-[0.16em] uppercase">{tab.label}</span>
							</button>
						);
					})}
				</div>

				<div className="flex flex-1 justify-end">
					<div className="hidden items-center gap-4 text-[10px] font-bold tracking-[0.16em] text-muted-foreground/45 md:flex">
						<div className="flex items-center gap-1.5">
							<span>CYCLE</span>
							<kbd className="rounded-md border border-border/20 bg-background/60 px-1.5 py-1 font-sans text-[9px]">TAB</kbd>
						</div>
						<div className="flex items-center gap-1.5">
							<kbd className="rounded-md border border-border/20 bg-background/60 px-1.5 py-1 font-sans text-[11px]">←</kbd>
							<span>BACK</span>
						</div>
					</div>
				</div>
			</CommandSurfaceFooter>
		</CommandSurface>
	);
}
