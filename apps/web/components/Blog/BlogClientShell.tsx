"use client";

import { Tag } from "@repo/ui";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { BlogCard } from "@/components/Blog/BlogCard";
import { BlogCardCompact } from "@/components/Blog/BlogCardCompact";
import { BlogCardFeatured } from "@/components/Blog/BlogCardFeatured";
import type { BlogPostFeedResult } from "@/lib/blog";
import { getPrefetchedFeed, prefetchBlogFeed } from "@/lib/client-prefetch";

interface BlogClientShellProps {
	initialFeed: BlogPostFeedResult;
}

interface FeedFilters {
	query: string;
	tags: string[];
	page: number;
	pageSize: number;
}

function normalizeTags(tags: string[]) {
	return [
		...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
	].sort();
}

function buildFeedKey(filters: FeedFilters) {
	return JSON.stringify({
		query: filters.query.trim().toLowerCase(),
		tags: normalizeTags(filters.tags),
		page: filters.page,
		pageSize: filters.pageSize,
	});
}

async function fetchFeed(filters: FeedFilters) {
	return await prefetchBlogFeed(filters);
}

function cn(...values: Array<string | false | null | undefined>) {
	return values.filter(Boolean).join(" ");
}

export function BlogClientShell({ initialFeed }: BlogClientShellProps) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	// Set initial query from URL if present
	const initialQuery = searchParams.get("search") || "";
	const activeTags = searchParams.getAll("tag");
	const currentPage = Math.max(
		1,
		Number.parseInt(searchParams.get("page") || "1", 10) || 1,
	);
	const pageSize = initialFeed.pageSize;
	const [query, setQuery] = useState(initialQuery);
	const [feed, setFeed] = useState(initialFeed);
	const [isPending, startTransition] = useTransition();
	const [retryKey, setRetryKey] = useState(0);
	const [inputPage, setInputPage] = useState<string | null>(null);
	const deferredQuery = useDeferredValue(query);
	const currentFilters = useMemo(
		() => ({
			query: deferredQuery.trim(),
			tags: activeTags,
			page: currentPage,
			pageSize,
		}),
		[activeTags, currentPage, deferredQuery, pageSize],
	);
	const currentFeedKey = useMemo(
		() => buildFeedKey(currentFilters),
		[currentFilters],
	);
	const initialFeedKey = useMemo(
		() =>
			buildFeedKey({
				query: initialFeed.query,
				tags: initialFeed.tags,
				page: initialFeed.page,
				pageSize: initialFeed.pageSize,
			}),
		[initialFeed],
	);

	// Sync state with URL when searchParams change (for tag clicking)
	useEffect(() => {
		const q = searchParams.get("search") || "";
		setQuery(q);
	}, [searchParams]);

	useEffect(() => {
		const cachedFeed = getPrefetchedFeed(currentFeedKey);
		if (cachedFeed) {
			setFeed(cachedFeed);
			return;
		}

		if (currentFeedKey === initialFeedKey) {
			setFeed(initialFeed);
			return;
		}

		const timeoutId = window.setTimeout(async () => {
			try {
				const result = await fetchFeed(currentFilters);
				if (result) {
					startTransition(() => {
						setFeed(result);
					});
				}
			} catch (_error) {
				console.error("Client-side search failed:", _error);
			}
		}, 120);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [currentFeedKey, currentFilters, initialFeed, initialFeedKey, retryKey]);

	useEffect(() => {
		if (!feed.hasNextPage) {
			return;
		}

		const nextFilters = {
			...currentFilters,
			page: currentPage + 1,
		};
		const nextKey = buildFeedKey(nextFilters);
		if (getPrefetchedFeed(nextKey)) {
			return;
		}

		void fetchFeed(nextFilters).catch(() => {});
	}, [currentFilters, currentPage, feed.hasNextPage]);

	// Update URL and state simultaneously
	const handleSearch = (val: string) => {
		setQuery(val);

		const params = new URLSearchParams(searchParams);
		if (val) {
			params.set("search", val);
		} else {
			params.delete("search");
		}
		params.delete("page");

		const queryString = params.toString();
		startTransition(() => {
			router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
				scroll: false,
			});
		});
	};

	const handleTagToggle = (tag: string) => {
		const params = new URLSearchParams(searchParams);
		const currentTags = new Set(params.getAll("tag"));
		if (currentTags.has(tag)) {
			params.delete("tag");
			for (const nextTag of currentTags) {
				if (nextTag !== tag) {
					params.append("tag", nextTag);
				}
			}
		} else {
			params.append("tag", tag);
		}
		params.delete("page");
		const queryString = params.toString();
		startTransition(() => {
			router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
				scroll: false,
			});
		});
	};

	const clearTagFilters = () => {
		const params = new URLSearchParams(searchParams);
		params.delete("tag");
		params.delete("page");
		const queryString = params.toString();
		startTransition(() => {
			router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
				scroll: false,
			});
		});
	};

	const setPage = (page: number) => {
		if (page === currentPage) {
			return;
		}

		const params = new URLSearchParams(searchParams);
		if (page <= 1) {
			params.delete("page");
		} else {
			params.set("page", String(page));
		}
		const queryString = params.toString();
		startTransition(() => {
			router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
				scroll: false,
			});
		});
	};

	const isArchiveView = currentPage > 1 || query.trim() !== "" || activeTags.length > 0;
	const archiveHasFilters = query.trim() !== "" || activeTags.length > 0;
	const isBrowserLoading = isPending;
	const [searchError, _setSearchError] = useState<string | null>(null);
	// Note: _setSearchError is currently reserved for future server-side error handling

	// Magazine Mode (Page 1): 1 Hero -> 4 Details -> 3 Scans
	const featuredPost = feed.posts.length > 0 ? feed.posts[0] : undefined;
	const mediumPosts = feed.posts.slice(1, 5);
	const smallPosts = feed.posts.slice(5);

	// Global absolute index for serial numbering
	const startIndex = (currentPage - 1) * pageSize;

	return (
		<div
			className={cn(
				"w-full",
				isArchiveView
					? "rounded-[2rem] border border-border/40 bg-background/25 p-4 shadow-glow-sm backdrop-blur-xl sm:p-5 lg:p-6"
					: "flex flex-col",
			)}
		>
			{/* Dynamic Header - disappears in archive view to save vertical space */}
			{!isArchiveView && (
				<header className="mb-10 space-y-4 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000 sm:mb-12">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">
						Field Notes
					</div>
					<h1 className="pb-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
						Writing for Building
					</h1>
					<p className="mx-auto mb-8 max-w-2xl text-base text-muted-foreground sm:text-[17px] md:mb-10 text-balance leading-relaxed">
						Notes on AI workflows, testing, search, and the small system
						decisions that make software calmer to use and easier to trust.
					</p>
				</header>
			)}

			<div
				id="blog-browser"
				className={cn(
					"w-full",
					/* 
					   Why: Flexible grid layout with min/max height constraints in archive view 
					   to ensure the browser shell remains stable while content is searched.
					*/
					isArchiveView &&
						"grid gap-4 lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:min-h-[calc(100vh-12rem)] lg:max-h-[calc(100vh-12rem)]",
				)}
			>
				<div
					className={cn(
						"space-y-4",
						isArchiveView &&
							"rounded-[1.5rem] border border-border/30 bg-background/45 p-3 sm:p-4",
					)}
				>
					<div
						className={cn(
							"group relative mx-auto w-full",
							isArchiveView ? "max-w-none" : "mb-10 max-w-2xl sm:mb-12",
						)}
					>
						<div className="absolute inset-0 rounded-full bg-primary/20 opacity-0 blur-2xl transition-opacity pointer-events-none group-focus-within:opacity-100" />
						<div className="relative flex items-center">
							<label htmlFor="blog-search" className="sr-only">
								Search blog posts
							</label>
							<Search className="absolute left-4 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
							{isBrowserLoading ? (
								<Loader2 className={cn("absolute h-4 w-4 animate-spin text-primary/80", query ? "right-12" : "right-4")} />
							) : null}
							<input
								id="blog-search"
								type="text"
								value={query}
								onChange={(e) => handleSearch(e.target.value)}
								maxLength={120}
								inputMode="search"
								autoComplete="off"
								spellCheck={false}
								aria-describedby="blog-search-status"
								placeholder="Search by topic, tool, or idea"
								className="w-full rounded-2xl border border-border/50 bg-background/40 py-3.5 pl-12 pr-12 text-sm tracking-tight transition-[background-color,border-color,color,box-shadow,transform] placeholder:text-muted-foreground/50 hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 backdrop-blur-md sm:text-[15px]"
							/>
							{query && (
								<button
									type="button"
									onClick={() => handleSearch("")}
									aria-label="Clear search"
									className="absolute right-3 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
								>
									<X className="h-4 w-4" />
								</button>
							)}
						</div>
					</div>

					<div
						className={cn(
							"flex items-center justify-center text-center text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/60",
							isArchiveView && "justify-between gap-3 text-left tracking-[0.2em]",
						)}
					>
						<div
							id="blog-search-status"
							aria-live="polite"
							className={cn("flex-1", isArchiveView && "min-w-0")}
						>
							{isBrowserLoading && feed.posts.length === 0
								? "Searching the archive..."
								: query.trim()
									? activeTags.length > 0
										? `${feed.totalCount} posts match this search and tag filter`
										: `${feed.totalCount} posts match this search`
									: activeTags.length > 0
										? `${feed.totalCount} posts across ${activeTags.length} selected tag filters`
										: `${feed.totalCount} published posts in the archive`}
						</div>
						{isArchiveView ? (
							<div className="hidden shrink-0 rounded-full border border-border/30 bg-background/60 px-3 py-1 text-[9px] text-muted-foreground/70 sm:inline-flex">
								Page {currentPage.toString().padStart(2, "0")}
							</div>
						) : null}
					</div>

					{activeTags.length > 0 ? (
						<div
							className={cn(
								"flex flex-wrap gap-3",
								isArchiveView ? "justify-start" : "mb-8 justify-center",
							)}
						>
							{activeTags.map((tag) => (
								<Tag
									key={tag}
									variant="active"
									interactive
									onClick={() => handleTagToggle(tag)}
									className="px-4 py-2 text-sm lowercase"
								>
									<span className="mr-2">{tag}</span>
									<span className="text-foreground/40 text-[9px] uppercase tracking-tighter">
										Remove
									</span>
								</Tag>
							))}
							<button
								type="button"
								onClick={clearTagFilters}
								className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
							>
								<span className="text-muted-foreground">Clear all tags</span>
							</button>
						</div>
					) : isArchiveView && archiveHasFilters ? (
						<div className="h-px bg-gradient-to-r from-primary/20 via-border/30 to-transparent" />
					) : null}
				</div>

			{/* 2. Content & Pagination Container - Flexible height for stability */}
				<div
					className={cn(
						"flex-1",
						isArchiveView &&
							"min-h-0 overflow-hidden rounded-[1.5rem] border border-border/25 bg-background/20 lg:flex lg:flex-col",
					)}
				>
					<div
						className={cn(
							/* 
							   Why: Added 'content-start' to ensure grid items are aligned 
							   to the top when there are few posts, preventing vertical stretching. 
							*/
							"grid content-start gap-8 md:grid-cols-1",
							isArchiveView &&
								"min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-1 lg:py-1",
						)}
					>
						{isBrowserLoading && feed.posts.length === 0 ? (
							/* 
							   Why: Only show full skeleton if we have literally no content.
							   Otherwise, use the isPending state to show a subtle overlay.
							*/
							isArchiveView ? (
								<div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
									{[1, 2, 3, 4, 5, 6].map((item) => (
										<div
											key={`archive-skel-${item}`}
											className="relative h-64 overflow-hidden rounded-3xl border border-border/30 bg-background/25 p-6 backdrop-blur-3xl"
										>
											<div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/6 to-transparent -translate-x-full animate-shimmer" />
											<div className="space-y-4 animate-pulse">
												<div className="flex gap-2">
													<div className="h-3 w-16 rounded-full bg-muted/20" />
													<div className="h-3 w-12 rounded-full bg-muted/10" />
												</div>
												<div className="h-5 w-3/4 rounded-xl bg-muted/20 mt-4" />
												<div className="h-5 w-full rounded-xl bg-muted/12 mt-2" />
												<div className="flex gap-2 mt-4">
													<div className="h-5 w-12 rounded bg-muted/10" />
													<div className="h-5 w-16 rounded bg-muted/10" />
												</div>
											</div>
										</div>
									))}
								</div>
							) : (
								[1, 2].map((item) => (
									<div
										key={`list-skel-${item}`}
										className="relative overflow-hidden rounded-3xl border border-border/30 bg-background/25 p-6 backdrop-blur-3xl"
									>
										<div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/6 to-transparent -translate-x-full animate-shimmer" />
										<div className="space-y-4 animate-pulse">
											<div className="flex gap-3">
												<div className="h-4 w-28 rounded-full bg-muted/20" />
												<div className="h-4 w-24 rounded-full bg-muted/10" />
											</div>
											<div className="h-10 w-3/4 rounded-2xl bg-muted/20" />
											<div className="h-5 w-full rounded-xl bg-muted/12" />
											<div className="h-5 w-5/6 rounded-xl bg-muted/10" />
											<div className="rounded-2xl border border-border/10 bg-muted/10 p-4">
												<div className="mb-2 h-3 w-24 rounded-full bg-primary/10" />
												<div className="h-4 w-full rounded-lg bg-muted/12" />
												<div className="mt-2 h-4 w-2/3 rounded-lg bg-muted/10" />
											</div>
										</div>
									</div>
								))
							)
						) : searchError ? (
							<div className="rounded-3xl border border-dashed border-destructive/40 bg-background/30 p-8 text-center backdrop-blur-sm sm:p-10">
								<p className="text-sm font-medium text-foreground">
									Search did not finish properly.
								</p>
								<p className="mt-2 text-sm text-muted-foreground">
									{searchError}
								</p>
								<button
									type="button"
									onClick={() => setRetryKey((value) => value + 1)}
									className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-border/50 bg-background/60 px-5 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
								>
									Try again
								</button>
							</div>
						) : feed.posts.length > 0 ? (
							<div className={cn(
								"relative",
								isBrowserLoading && "opacity-50 grayscale-[0.5] pointer-events-none transition-opacity duration-300"
							)}>
								{isArchiveView ? (
									<div className="grid content-start gap-4 animate-in fade-in duration-500 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
										{feed.posts.map((post, i) => (
											<BlogCardCompact
												key={post.path}
												post={post}
												serialNumber={String(startIndex + i + 1).padStart(2, "0")}
												onTagSelect={handleTagToggle}
												activeTags={activeTags}
											/>
										))}
									</div>
								) : (
									<div className="w-full space-y-8 animate-in fade-in duration-700">
										{featuredPost && (
											<div className="w-full">
												<BlogCardFeatured
													post={featuredPost}
													onTagSelect={handleTagToggle}
													activeTags={activeTags}
												/>
											</div>
										)}
										{mediumPosts.length > 0 && (
											<div className="grid grid-cols-1 md:grid-cols-2 gap-6 [&>*:last-child:nth-child(odd)]:md:col-span-2">
												{mediumPosts.map((post, i) => (
													<BlogCard
														key={post.path}
														post={post}
														index={startIndex + 1 + i}
														onTagSelect={handleTagToggle}
														activeTags={activeTags}
													/>
												))}
											</div>
										)}
										{smallPosts.length > 0 && (
											<div className={`grid gap-5 ${
												smallPosts.length === 1 
													? 'grid-cols-1' 
													: smallPosts.length === 2 
														? 'grid-cols-1 sm:grid-cols-2' 
														: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
											}`}>
												{smallPosts.map((post, i) => (
													<BlogCardCompact
														key={post.path}
														post={post}
														serialNumber={String(startIndex + 5 + i + 1).padStart(2, "0")}
														onTagSelect={handleTagToggle}
														activeTags={activeTags}
													/>
												))}
											</div>
										)}
									</div>
								)}
							</div>
						) : (
							<div className="rounded-3xl border border-dashed border-border/50 bg-background/20 py-16 text-center backdrop-blur-sm sm:py-20">
								<p className="text-sm font-medium text-foreground">
									{activeTags.length > 0
										? "No posts fit the current tag filters."
										: "No posts fit that search yet."}
								</p>
								<p className="mt-2 text-sm text-muted-foreground">
									{activeTags.length > 0
										? "Try removing a tag or widening the filter."
										: "Try a broader keyword, tool name, or topic."}
								</p>
							</div>
						)}
					</div>
				</div>

				{feed.totalPages > 1 && (
					<div
						className={cn(
							isArchiveView
								? "rounded-[1.5rem] border border-border/30 bg-background/55 p-2 shadow-[0_-12px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl"
								: "pt-4 pb-8 sm:pt-6",
						)}
					>
						<nav className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6 w-full max-w-sm sm:max-w-2xl mx-auto">
							<div className="flex justify-end">
								<button
									type="button"
									onClick={() => setPage(Math.max(1, currentPage - 1))}
									disabled={!feed.hasPreviousPage}
									aria-label="Go to previous page"
									className={`flex min-h-[44px] items-center justify-center gap-2 sm:gap-3 rounded-2xl border border-border/50 bg-background/40 px-4 py-3 sm:px-6 text-[10px] sm:text-[11px] font-bold uppercase tracking-[.2em] transition-all duration-300 active:scale-95 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${!feed.hasPreviousPage ? "pointer-events-none opacity-20" : "cursor-pointer hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-glow-sm"}`}
								>
									<ChevronLeft className="h-4 w-4" />
									<span className="hidden sm:inline">
										{isBrowserLoading ? "Loading" : "Previous"}
									</span>
								</button>
							</div>

							<div
								className="flex items-center justify-center"
								aria-live="polite"
							>
								<div className="text-[13px] font-mono text-primary font-medium tracking-tighter tabular-nums bg-primary/[0.03] py-2.5 lg:py-3 px-3 rounded-2xl border border-primary/20 shadow-glow-sm min-w-[110px] flex items-center justify-center backdrop-blur-sm transition-colors focus-within:border-primary/40 focus-within:bg-primary/[0.05]">
									<input
										type="text"
										inputMode="numeric"
										pattern="[0-9]*"
										value={inputPage !== null ? inputPage : currentPage.toString().padStart(2, "0")}
										onChange={(e) => {
											const val = e.target.value.replace(/\D/g, "");
											setInputPage(val);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												if (inputPage) {
													const target = Number.parseInt(inputPage, 10);
													if (!Number.isNaN(target) && target > 0 && target <= feed.totalPages) {
														setPage(target);
													}
												}
												setInputPage(null);
												(e.target as HTMLInputElement).blur();
											} else if (e.key === "Escape") {
												setInputPage(null);
												(e.target as HTMLInputElement).blur();
											}
										}}
										onBlur={() => setInputPage(null)}
										onFocus={(e) => e.target.select()}
										className="w-7 bg-transparent text-center focus:outline-none placeholder:text-primary/30"
										placeholder="--"
										aria-label="Jump to page"
									/>
									<span className="mx-1 opacity-40">/</span>
									<span className="w-7 text-center">{feed.totalPages.toString().padStart(2, "0")}</span>
								</div>
							</div>

							<div className="flex justify-start">
								<button
									type="button"
									onClick={() => setPage(currentPage + 1)}
									disabled={!feed.hasNextPage}
									aria-label="Go to next page"
									className={`flex min-h-[44px] items-center justify-center gap-2 sm:gap-3 rounded-2xl border border-border/50 bg-background/40 px-4 py-3 sm:px-6 text-[10px] sm:text-[11px] font-bold uppercase tracking-[.2em] transition-all duration-300 active:scale-95 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${!feed.hasNextPage ? "pointer-events-none opacity-20" : "cursor-pointer hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-glow-sm"}`}
								>
									<span className="hidden sm:inline">
										{isBrowserLoading ? "Loading" : "Next"}
									</span>
									<ChevronRight className="h-4 w-4" />
								</button>
							</div>
						</nav>
					</div>
				)}
			</div>
		</div>
	);
}
