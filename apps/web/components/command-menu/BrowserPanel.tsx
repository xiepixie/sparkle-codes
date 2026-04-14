import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, FileText, Folder, Loader2 } from "lucide-react";
import type { ExplorerNode } from "@repo/database";
import { cn } from "@repo/ui";
import { CommandEmptyState } from "@/components/CommandSurface";
import { panelVariants } from "./types";

interface BrowserPanelProps {
	explorerPath: string[];
	explorerNodes: ExplorerNode[];
	explorerLoading: boolean;
	explorerDirection: number;
	activeIndex: number;
	setActiveIndex: (index: number) => void;
	navigateIntoFolder: (name: string) => void;
	navigateToBlogPost: (slug: string) => void;
	setExplorerPath: (path: string[]) => void;
	setExplorerDirection: (dir: 1 | -1) => void;
	prefetchBlog: (slug: string) => void;
	pendingUrl: string | null;
}

export const BrowserPanel = React.memo(({
	explorerPath,
	explorerNodes,
	explorerLoading,
	explorerDirection,
	activeIndex,
	setActiveIndex,
	navigateIntoFolder,
	navigateToBlogPost,
	setExplorerPath,
	setExplorerDirection,
	prefetchBlog,
	pendingUrl,
}: BrowserPanelProps) => {
	return (
		<div className="flex flex-col h-full">
			<div className="mb-5 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/50">
						Directory Path
					</p>
					<div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px] font-bold tracking-[0.18em] text-muted-foreground/50 no-scrollbar">
				<button
					type="button"
					onClick={() => {
						setExplorerDirection(-1);
						setExplorerPath([]);
						setActiveIndex(0);
					}}
							className="rounded-full px-2 py-1 transition-colors hover:bg-primary/8 hover:text-primary uppercase"
				>
					ROOT
				</button>
				{explorerPath.map((segment, i) => (
					<React.Fragment key={segment}>
						<span className="opacity-20">/</span>
						<button
							type="button"
							onClick={() => {
								setExplorerDirection(i < explorerPath.length - 1 ? -1 : 1);
								setExplorerPath(explorerPath.slice(0, i + 1));
								setActiveIndex(0);
							}}
									className="max-w-[120px] truncate rounded-full px-2 py-1 uppercase transition-colors hover:bg-primary/8 hover:text-primary"
						>
							{segment}
						</button>
					</React.Fragment>
				))}
					</div>
				</div>
				<div className="shrink-0 rounded-xl border border-border/20 bg-background/55 px-3 py-2 text-right">
					<p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/45">
						Visible
					</p>
					<p className="mt-1 text-sm font-semibold tracking-tight text-foreground">
						{explorerLoading ? "Loading..." : `${explorerNodes.length} items`}
					</p>
				</div>
			</div>

			<div className="relative flex-1">
				<AnimatePresence mode="popLayout" custom={explorerDirection}>
					<motion.div
						key={explorerPath.join("/")}
						custom={explorerDirection}
						variants={panelVariants}
						initial="enter"
						animate="center"
						exit="exit"
						style={{
							willChange: "transform, opacity",
							backfaceVisibility: "hidden",
						}}
						className={cn(
							"space-y-2.5",
							"exit:pointer-events-none",
						)}
					>
						{explorerNodes.length > 0 ? (
							explorerNodes.map((node, idx) => {
								const targetUrl = node.slug ? `/blog/${node.slug}` : null;
								const isPending = !!targetUrl && pendingUrl === targetUrl;
								
								return (
									<button
										key={node.id}
										type="button"
										disabled={!!pendingUrl}
										onClick={() => {
											if (node.type === "folder") {
												navigateIntoFolder(node.name);
											} else if (node.slug) {
												navigateToBlogPost(`/blog/${node.slug}`);
											}
										}}
										onMouseEnter={() => {
											setActiveIndex(idx);
											if (node.type === "file" && node.slug) {
												prefetchBlog(node.slug);
											}
										}}
										className={cn(
											"group flex w-full items-center gap-4 rounded-3xl border px-4 py-3.5 text-left transition-all duration-300",
											idx === activeIndex
												? "border-primary/35 bg-primary/[0.045] shadow-[0_12px_30px_rgba(var(--primary-rgb),0.08)]"
												: "border-border/30 bg-background/55 text-foreground/85 hover:border-border/50 hover:bg-background/70",
											"active:scale-[0.98]",
											explorerLoading && "opacity-60",
											pendingUrl && !isPending && "opacity-40 grayscale-[0.5] blur-[0.5px]",
											isPending && "scale-[0.98] border-primary/40 bg-primary/10",
										)}
									>
										<div className={cn(
											"flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-300",
											idx === activeIndex ? "border-primary/20 bg-primary/12" : "border-border/20 bg-background/80"
										)}>
											{isPending ? (
												<Loader2 className="h-4 w-4 animate-spin text-primary" />
											) : node.type === "folder" ? (
												<Folder className={cn(
													"h-4 w-4 transition-transform duration-300", 
													idx === activeIndex ? "scale-110" : "scale-100",
													node.name === "项目" ? "text-blue-500" :
													node.name === "资源" ? "text-green-500" :
													node.name === "收集" ? "text-amber-500" :
													node.name === "归档" ? "text-purple-500" :
													"text-primary/60"
												)} />
											) : (
												<FileText className={cn(
													"h-4 w-4 transition-transform duration-300 group-hover:rotate-3", 
													idx === activeIndex ? "text-primary scale-110" : "text-primary/60 scale-100"
												)} />
											)}
										</div>
										<div className="flex min-w-0 flex-1 flex-col gap-1">
											<span className={cn(
												"truncate text-sm tracking-tight transition-colors duration-300",
												idx === activeIndex ? "font-semibold text-foreground" : "font-medium text-foreground/82",
												isPending && "text-primary animate-pulse font-bold"
											)}>
												{isPending ? "Entering article..." : node.name}
											</span>
											<div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/42">
												<span>{node.type === "folder" ? "Directory" : "Document"}</span>
												<span className="h-1 w-1 rounded-full bg-border/60" />
												<span className="truncate">{node.slug || explorerPath.join("/") || "root"}</span>
											</div>
										</div>
										{node.type === "folder" && !pendingUrl && (
											<ChevronRight className={cn(
												"h-4 w-4 transition-transform",
												idx === activeIndex ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
											)} />
										)}
									</button>
								);
							})
						) : !explorerLoading && (
							<CommandEmptyState 
								icon={<Folder className="h-10 w-10 text-muted-foreground/20" />}
								title="Empty Directory"
								description="This folder contains no published knowledge assets."
							/>
						)}
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
});

BrowserPanel.displayName = "BrowserPanel";
