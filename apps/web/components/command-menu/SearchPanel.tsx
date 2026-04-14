import React from "react";
import { Clock, Loader2, Search } from "lucide-react";
import { cn } from "@repo/ui";
import { AccessibleMarkdownSnippet as SearchMatch } from "../markdown-snippet";
import type { SearchResultItem } from "./types";
import { CommandEmptyState } from "@/components/CommandSurface";

interface SearchPanelProps {
	searchResults: SearchResultItem[];
	searchLoading: boolean;
	activeIndex: number;
	setActiveIndex: (index: number) => void;
	navigateToBlogPost: (url: string) => void;
	recentReading: SearchResultItem[];
	searchQuery: string;
	pendingUrl: string | null;
	handleSearchSuggestion?: (suggestion: string) => void;
}

export const SearchPanel = React.memo(({
	searchResults,
	searchLoading,
	activeIndex,
	setActiveIndex,
	navigateToBlogPost,
	recentReading,
	searchQuery,
	pendingUrl,
	handleSearchSuggestion,
}: SearchPanelProps) => {
	const hasQuery = searchQuery.trim().length > 0;

	return (
		<div className="space-y-8 pb-4 pt-0">
			{searchResults.length > 0 ? (
				<div className="space-y-4">
					<div className="flex items-end justify-between gap-4">
						<div>
							<div className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground/60 dark:text-muted-foreground/50">
								Search Results
							</div>
							<p className="mt-2 text-sm text-muted-foreground/75">
								{searchResults.length} relevant match{searchResults.length > 1 ? "es" : ""} for <span className="font-semibold text-foreground/85">"{searchQuery}"</span>
							</p>
						</div>
					</div>
					<div className="space-y-2.5">
						{searchResults.map((result, idx) => {
							const isPending = pendingUrl === result.url;
							return (
								<button
									key={result.id}
									type="button"
									disabled={!!pendingUrl}
									onClick={() => navigateToBlogPost(result.url)}
									onMouseEnter={() => setActiveIndex(idx)}
									className={cn(
										"group flex w-full items-start gap-4 rounded-3xl border p-4 text-left transition-all duration-300",
										idx === activeIndex
											? "border-primary/35 bg-primary/[0.045] shadow-[0_16px_34px_rgba(var(--primary-rgb),0.08)]"
											: "border-border/30 bg-background/55 hover:border-primary/30 hover:bg-background/75",
										pendingUrl && !isPending && "opacity-40 grayscale-[0.5] blur-[0.5px]",
										isPending && "scale-[0.98] border-primary/40 bg-primary/10",
									)}
								>
									<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/20 bg-background/75">
										{isPending ? (
											<Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
										) : (
											<div className={cn("h-2 w-2 rounded-full transition-colors", idx === activeIndex ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70")} />
										)}
									</div>
									<div className="flex-1 min-w-0 space-y-2">
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0 space-y-1.5">
												<div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/42">
													<span>{result.section || "Document"}</span>
													<span className="h-1 w-1 rounded-full bg-border/60" />
													<span className="truncate">{result.url.replace(/^\/blog\//, "")}</span>
												</div>
											{isPending ? (
												<SearchMatch
													className={cn(
														"block text-[15px] font-semibold leading-tight tracking-tight text-primary",
														isPending && "text-primary"
													)}
													content={"Opening result..."}
													query={searchQuery}
												/>
											) : (
												<SearchMatch
													className={cn(
														"block text-[15px] font-semibold leading-tight tracking-tight transition-colors",
														idx === activeIndex ? "text-foreground" : "text-foreground/90",
													)}
													content={result.highlightedTitle || result.title}
													query={searchQuery}
												/>
											)}
											{(result.title !== result.context) && (
												<SearchMatch
													className={cn(
														"block text-[13px] font-medium tracking-tight",
														idx === activeIndex ? "text-primary/80" : "text-foreground/65"
													)}
													content={result.highlightedContext || result.context || result.url.split("/").pop() || ""}
													query={searchQuery}
												/>
											)}
											</div>

											{result.section && !isPending && (
												<span className="shrink-0 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-primary/75">
													{result.section}
												</span>
											)}
										</div>

										{result.description ? (
											<div className="rounded-2xl bg-muted/[0.16] px-3.5 py-3">
												<SearchMatch
													className="line-clamp-2 block text-[12px] font-normal leading-6 text-muted-foreground/72"
													content={result.highlightedDescription || result.description}
													query={searchQuery}
												/>
											</div>
										) : null}
									</div>
								</button>
							);
						})}
					</div>
				</div>
			) : (
				!searchLoading && recentReading.length > 0 && !hasQuery && (
					<div className="space-y-4">
						<div>
							<div className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground/60 dark:text-muted-foreground/50">
								Recent Reading
							</div>
							<p className="mt-2 text-sm text-muted-foreground/75">
								Pick up where you left off without leaving the command flow.
							</p>
						</div>
						<div className="space-y-2.5">
							{recentReading.map((result, idx) => {
								const isPending = pendingUrl === result.url;
								return (
									<button
										key={result.id}
										type="button"
										disabled={!!pendingUrl}
									onClick={() => navigateToBlogPost(result.url)}
									onMouseEnter={() => setActiveIndex(idx)}
									className={cn(
										"group flex w-full items-center gap-4 rounded-3xl border px-4 py-3.5 text-left transition-all duration-300",
										idx === activeIndex
											? "border-primary/35 bg-primary/[0.045] shadow-[0_16px_34px_rgba(var(--primary-rgb),0.08)]"
											: "border-border/30 bg-background/55 hover:border-primary/30 hover:bg-background/75",
										pendingUrl && !isPending && "opacity-40 grayscale-[0.5] blur-[0.5px]",
										isPending && "scale-[0.98] border-primary/40 bg-primary/10",
									)}
								>
										<div className={cn(
											"flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-all duration-300",
											idx === activeIndex 
												? "border-primary/40 bg-primary/10 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]" 
												: "border-border/20 bg-background/75"
										)}>
											{isPending ? (
												<Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
											) : (
												<Clock className={cn(
													"h-4 w-4 shrink-0 transition-transform group-hover:rotate-6",
													idx === activeIndex ? "text-primary" : "text-primary/60"
												)} />
											)}
										</div>
										<div className="flex min-w-0 flex-col gap-1">
											<h3 className={cn(
												"truncate text-sm font-semibold tracking-tight transition-colors duration-300",
												idx === activeIndex ? "text-foreground" : "text-foreground/82",
												isPending && "text-primary"
											)}>
												{isPending ? "Entering article..." : result.title}
											</h3>
											<p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/42">
												{result.url.replace(/^\/blog\//, "")}
											</p>
										</div>
									</button>
								);
							})}
						</div>
					</div>
				)
			)}

			{!searchLoading && (
				<div className={cn(
					"transition-all duration-500",
					!hasQuery && recentReading.length === 0 ? "opacity-100" : "opacity-0 invisible h-0"
				)}>
					<CommandEmptyState 
						icon={<Search className="h-10 w-10 text-muted-foreground/20" />}
						title="Discover Sparkle"
						description="Start searching for articles, insights, or code patterns."
						actions={
							<div className="flex max-w-md flex-wrap justify-center gap-2">
								{["性能优化", "MDX", "Sentinel", "AI"].map(
									(suggestion) => (
										<button
											key={suggestion}
											type="button"
											onClick={() => handleSearchSuggestion?.(suggestion)}
											className="rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground active:scale-95"
										>
											{suggestion}
										</button>
									),
								)}
							</div>
						}
					/>
				</div>
			)}

			{hasQuery && !searchLoading && searchResults.length === 0 && (
				<CommandEmptyState 
					icon={<Search className="h-10 w-10 text-muted-foreground/20" />}
					title="No matches found"
					description={`We couldn't find anything for "${searchQuery}".`}
				/>
			)}

			{!searchLoading && hasQuery && searchResults.length > 0 && (
				<div className="mt-10 flex flex-col items-center gap-3 border-t border-border/10 pt-6 opacity-70">
					<span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
						Try searching for
					</span>
					<div className="flex max-w-md flex-wrap justify-center gap-2">
						{["测试", "Prisma", "架构", "Next.js 15"].map((suggestion) => (
							<button
								key={suggestion}
								type="button"
								onClick={() => handleSearchSuggestion?.(suggestion)}
								className="rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:scale-95"
							>
								{suggestion}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
});

SearchPanel.displayName = "SearchPanel";
