"use client";

import { Tag } from "@repo/ui";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [retryKey, setRetryKey] = useState(0);
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
			setIsSearching(false);
			return;
		}

		if (currentFeedKey === initialFeedKey) {
			setFeed(initialFeed);
			setIsSearching(false);
			return;
		}

		const timeoutId = window.setTimeout(async () => {
			try {
				const result = await fetchFeed(currentFilters);
				if (result) {
					setFeed(result);
				}
			} catch (_error) {
				setSearchError(
					"Search is temporarily unavailable. Try again in a moment.",
				);
			} finally {
				setIsSearching(false);
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
		setSearchError(null);

		const params = new URLSearchParams(searchParams);
		if (val) {
			params.set("search", val);
		} else {
			params.delete("search");
		}
		params.delete("page");

		// Update URL without full reload
		const queryString = params.toString();
		router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
			scroll: false,
		});
	};

	const handleTagToggle = (tag: string) => {
		setSearchError(null);

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
		router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
			scroll: false,
		});
	};

	const clearTagFilters = () => {
		const params = new URLSearchParams(searchParams);
		params.delete("tag");
		params.delete("page");
		const queryString = params.toString();
		router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
			scroll: false,
		});
	};

	const setPage = (page: number) => {
		const params = new URLSearchParams(searchParams);
		if (page <= 1) {
			params.delete("page");
		} else {
			params.set("page", String(page));
		}
		const queryString = params.toString();
		router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
			scroll: false,
		});
	};

	const isFiltering =
		query.trim() !== "" || activeTags.length > 0 || currentPage > 1;
	const isShowFeatured = !isFiltering;
	const featuredPost =
		isShowFeatured && feed.posts.length > 0 ? feed.posts[0] : undefined;
	const secondaryPosts = isShowFeatured ? feed.posts.slice(1, 4) : [];
	const restPosts = isShowFeatured ? feed.posts.slice(4) : feed.posts;

	return (
		<div className="w-full">
			{/* 1. Fast Search Component */}
			<div className="group relative mx-auto mb-10 max-w-xl sm:mb-12">
				<div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
				<div className="relative flex items-center">
					<label htmlFor="blog-search" className="sr-only">
						Search blog posts
					</label>
					<Search className="absolute left-4 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
					{query.trim() && isSearching ? (
						<Loader2 className="absolute right-12 h-4 w-4 animate-spin text-primary/80" />
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
						placeholder="Search posts, tags, and topics"
						className="w-full rounded-2xl border border-border/50 bg-background/40 py-3.5 pl-12 pr-12 text-sm tracking-tight transition-[background-color,border-color,color,box-shadow,transform] placeholder:text-muted-foreground/50 hover:border-primary/30 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 backdrop-blur-md sm:text-[15px]"
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
				id="blog-search-status"
				aria-live="polite"
				className="mb-8 flex items-center justify-center text-center text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/60"
			>
				{query.trim()
					? isSearching
						? "Searching posts..."
						: activeTags.length > 0
							? `${feed.totalCount} posts match search and tags`
							: `${feed.totalCount} matching posts`
					: activeTags.length > 0
						? `${feed.totalCount} posts across ${activeTags.length} selected tags`
						: `${feed.totalCount} published posts`}
			</div>

			{activeTags.length > 0 ? (
				<div className="mb-8 flex flex-wrap justify-center gap-3">
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
			) : null}

			{/* 2. Grid Render */}
			<div className="space-y-14 sm:space-y-20">
				<div className="grid gap-8 md:grid-cols-1">
					{query.trim() && isSearching ? (
						[1, 2].map((item) => (
							<div
								key={item}
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
					) : searchError ? (
						<div className="rounded-3xl border border-dashed border-destructive/40 bg-background/30 p-8 text-center backdrop-blur-sm sm:p-10">
							<p className="text-sm font-medium text-foreground">
								Search could not be completed.
							</p>
							<p className="mt-2 text-sm text-muted-foreground">
								{searchError}
							</p>
							<button
								type="button"
								onClick={() => setRetryKey((value) => value + 1)}
								className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl border border-border/50 bg-background/60 px-5 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
							>
								Retry search
							</button>
						</div>
					) : feed.posts.length > 0 ? (
						<div className="w-full space-y-8">
							{isShowFeatured && featuredPost && (
								<div className="w-full">
									<BlogCardFeatured
										post={featuredPost}
										onTagSelect={handleTagToggle}
										activeTags={activeTags}
									/>
								</div>
							)}
							{isShowFeatured && secondaryPosts.length > 0 && (
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
									{secondaryPosts.map((post, i) => (
										<BlogCardCompact
											key={post.path}
											post={post}
											serialNumber={String(i + 2).padStart(2, "0")}
											onTagSelect={handleTagToggle}
											activeTags={activeTags}
										/>
									))}
								</div>
							)}
							{restPosts.length > 0 && (
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									{restPosts.map((post, i) => (
										<BlogCard
											key={post.path}
											post={post}
											index={i + (isShowFeatured ? 4 : 0)}
											onTagSelect={handleTagToggle}
											activeTags={activeTags}
										/>
									))}
								</div>
							)}
						</div>
					) : (
						<div className="rounded-3xl border border-dashed border-border/50 bg-background/20 py-16 text-center backdrop-blur-sm sm:py-20">
							<p className="text-sm font-medium text-foreground">
								{activeTags.length > 0
									? "No posts matched the current tag filters."
									: "No posts matched that search."}
							</p>
							<p className="mt-2 text-sm text-muted-foreground">
								{activeTags.length > 0
									? "Try fewer tags or clear the filters."
									: "Try a broader keyword, tag, or topic."}
							</p>
						</div>
					)}
				</div>

				{/* 3. Fast Pagination Matrix */}
				{feed.totalPages > 1 && (
					<nav className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
						<button
							type="button"
							onClick={() => setPage(Math.max(1, currentPage - 1))}
							disabled={!feed.hasPreviousPage}
							aria-label="Go to previous page"
							className={`flex min-h-11 w-full items-center justify-center gap-3 rounded-2xl border border-border/50 bg-background/40 px-6 py-3 text-[10px] font-bold uppercase tracking-[.25em] transition-[background-color,border-color,color,transform,box-shadow] active:scale-95 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:w-auto sm:px-8 ${!feed.hasPreviousPage ? "pointer-events-none opacity-20" : "cursor-pointer hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-glow-sm"}`}
						>
							<ChevronLeft className="h-4 w-4" />
							Previous
						</button>

						<div
							className="flex flex-col items-center gap-1"
							aria-live="polite"
						>
							<div className="text-[12px] font-mono text-primary tracking-tighter tabular-nums bg-primary/5 px-6 py-2.5 rounded-2xl border border-primary/20 shadow-glow-sm">
								{currentPage.toString().padStart(2, "0")}{" "}
								<span className="mx-2 opacity-20">/</span>{" "}
								{feed.totalPages.toString().padStart(2, "0")}
							</div>
							<span className="mt-1 text-[10px] text-muted-foreground/60">
								Page {currentPage} of {feed.totalPages}
							</span>
						</div>

						<button
							type="button"
							onClick={() => setPage(currentPage + 1)}
							disabled={!feed.hasNextPage}
							aria-label="Go to next page"
							className={`flex min-h-11 w-full items-center justify-center gap-3 rounded-2xl border border-border/50 bg-background/40 px-6 py-3 text-[10px] font-bold uppercase tracking-[.25em] transition-[background-color,border-color,color,transform,box-shadow] active:scale-95 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:w-auto sm:px-8 ${!feed.hasNextPage ? "pointer-events-none opacity-20" : "cursor-pointer hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-glow-sm"}`}
						>
							Next
							<ChevronRight className="h-4 w-4" />
						</button>
					</nav>
				)}
			</div>
		</div>
	);
}
