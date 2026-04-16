import React from "react";
import { Clock, Compass, Loader2 } from "lucide-react";
import { cn } from "@repo/ui";
import { CommandEmptyState } from "@/components/CommandSurface";
import type { CommandCenterReadingContext } from "@/lib/command-center";
import type { SearchResultItem } from "./types";

interface JumpPanelProps {
	readingContext: CommandCenterReadingContext | null;
	filteredRecentReading: SearchResultItem[];
	activeIndex: number;
	setActiveIndex: (index: number) => void;
	handleReadingJump: (section: any) => void;
	navigateToBlogPost: (slug: string) => void;
	pendingUrl: string | null;
}

export const JumpPanel = React.memo(({
	readingContext,
	filteredRecentReading = [],
	activeIndex,
	setActiveIndex,
	handleReadingJump,
	navigateToBlogPost,
	pendingUrl,
}: JumpPanelProps) => {
	if (!readingContext) {
		return (
			<CommandEmptyState
				icon={<Compass className="h-10 w-10 text-muted-foreground/20" />}
				title="Reading jump is unavailable here"
				description="Open this mode from an article page to jump across sections or switch between recent posts."
			/>
		);
	}

	const sections = readingContext.sections || [];

	return (
		<div className="space-y-8 pb-4 pt-0">
			{/* Sections in current post */}
			{sections.length > 0 && (
				<div className="space-y-4">
					<div className="flex items-end justify-between gap-4">
						<div>
							<div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/50">
								Table of Contents
							</div>
							<p className="mt-2 text-sm text-muted-foreground/75">
								Jump directly to a section in the current article.
							</p>
						</div>
						<div className="rounded-xl border border-border/20 bg-background/55 px-3 py-2 text-right">
							<p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/45">
								Sections
							</p>
							<p className="mt-1 text-sm font-semibold tracking-tight text-foreground">
								{sections.length}
							</p>
						</div>
					</div>
					<div className="flex flex-col gap-1.5 rounded-[28px] border border-border/25 bg-background/45 p-3">
						{sections.map((section, idx) => {
							const isPending = !!pendingUrl && pendingUrl.includes(section.id);
							const level = Math.max(1, section.level || 1);
							
							return (
								<button
									key={section.id}
									type="button"
									data-index={idx}
									disabled={!!pendingUrl}
									onClick={() => handleReadingJump(section)}
									onMouseEnter={() => setActiveIndex(idx)}
									className={cn(
										"group relative flex w-full items-center rounded-2xl py-2.5 pr-3 text-left transition-all duration-300 select-none outline-none",
										idx === activeIndex
											? "bg-primary/[0.045]"
											: "opacity-78 hover:bg-muted/[0.18] hover:opacity-100",
										pendingUrl && !isPending && "opacity-30 grayscale-[0.5] blur-[0.5px]"
									)}
									style={{
										paddingLeft: `${12 + (level - 1) * 18}px`,
									}}
								>
									<div
										className={cn(
											"mr-3 h-6 w-1 shrink-0 rounded-full transition-colors",
											idx === activeIndex ? "bg-primary/70" : "bg-border/45",
										)}
									/>
									<span className={cn(
										"line-clamp-1 transition-colors",
										level === 1 ? "text-[15px] font-semibold tracking-tight" : "text-[14px] font-medium",
										idx === activeIndex && "text-primary font-bold"
									)}>
										{section.title}
									</span>
									{isPending && (
										<Loader2 className="ml-3 h-4 w-4 animate-spin text-primary shrink-0" />
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{/* Recent Global Reading */}
			{filteredRecentReading.length > 0 && (
				<div className="space-y-4 border-t border-border/10 pt-5">
					<div>
						<div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/50">
							Recent Reading
						</div>
						<p className="mt-2 text-sm text-muted-foreground/75">
							Switch context to another recently visited post.
						</p>
					</div>
					<div className="flex flex-col gap-2">
						{filteredRecentReading.map((item, idx) => {
							const globalIdx = sections.length + idx;
							const isPending = pendingUrl === item.url;
							
							return (
								<button
									key={item.id}
									type="button"
									data-index={globalIdx}
									disabled={!!pendingUrl}
									onClick={() => navigateToBlogPost(item.url)}
									onMouseEnter={() => setActiveIndex(globalIdx)}
									className={cn(
										"group relative flex w-full items-center gap-4 rounded-3xl border border-border/30 bg-background/55 px-4 py-3.5 text-left transition-all duration-300 select-none outline-none hover:border-primary/30 hover:bg-background/75",
										globalIdx === activeIndex
											? "border-primary/35 bg-primary/[0.045] shadow-[0_16px_34px_rgba(var(--primary-rgb),0.08)]"
											: "opacity-78 hover:opacity-100",
										pendingUrl && !isPending && "opacity-30 grayscale-[0.5] blur-[0.5px]"
									)}
								>
									<div className={cn(
										"flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-all duration-300",
										globalIdx === activeIndex 
											? "border-primary/40 bg-primary/10 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]" 
											: "border-border/20 bg-background/75"
									)}>
										{isPending ? (
											<Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
										) : (
											<Clock className={cn(
												"h-4 w-4 shrink-0 transition-transform group-hover:rotate-12",
												globalIdx === activeIndex ? "text-primary" : "text-primary/60"
											)} />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<span className={cn(
											"line-clamp-1 text-[15px] font-medium tracking-tight transition-colors",
											globalIdx === activeIndex && "text-primary font-semibold"
										)}>
											{isPending ? "Entering post..." : item.title}
										</span>
										<p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/42">
											{item.url.replace(/^\/blog\//, "")}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
});

JumpPanel.displayName = "JumpPanel";
