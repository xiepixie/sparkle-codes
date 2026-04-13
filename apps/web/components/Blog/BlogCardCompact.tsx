"use client";

import { Tag } from "@repo/ui";
import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import type { BlogPostSummary } from "@/lib/blog";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import { HighlightedText } from "./HighlightedText";

interface BlogCardCompactProps {
	post: BlogPostSummary;
	serialNumber?: string;
	activeTags?: string[];
	onTagSelect?: (tag: string) => void;
}

export function BlogCardCompact({
	post,
	serialNumber = "02",
	activeTags = [],
	onTagSelect,
}: BlogCardCompactProps) {
	const {
		prefetchState,
		hasBeenPrefetched,
		handleMouseEnter,
		handleMouseLeave,
	} = useHoverPrefetch(post.path, 300);

	const formattedDate = new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(new Date(post.date));

	const selectedTags = new Set(activeTags.map((tag) => tag.toLowerCase()));

	return (
		<article
			className="h-full"
			style={{ animationDelay: `${(Number.parseInt(serialNumber) - 1) * 70}ms` }}
			data-cursor="explore"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/40 transition-all duration-300 ease-[cubic-bezier(0.2,1,0.2,1)] hover:-translate-y-px [transform-style:preserve-3d] [backface-visibility:hidden] transform-gpu isolation-isolate">
				{/* Performance Optimized Background Cluster */}
				<div className="absolute inset-0 z-[-10] pointer-events-none rounded-[inherit] overflow-hidden contain-paint">
					<div className="absolute inset-0 bg-background/40 backdrop-blur-xl" />
					<div className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] group-hover:opacity-100 shadow-glow-sm" />
				</div>

				{/* Orbiting Neon Trace (Unified Digital Interface Layer) */}
				<div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-[inherit]">
					<svg
						className="absolute inset-0 h-full w-full"
						style={{ overflow: "visible" }}
						aria-hidden="true"
					>
						<motion.rect
							initial={{ pathLength: 0, opacity: 0 }}
							animate={{
								pathLength:
									prefetchState === "ready" || hasBeenPrefetched
										? 1
										: prefetchState === "loading"
											? 0.3
											: 0,
								opacity:
									prefetchState !== "idle" ? 1 : hasBeenPrefetched ? 0.25 : 0,
								stroke:
									prefetchState === "ready" || hasBeenPrefetched
										? "var(--color-primary)"
										: "var(--color-primary-muted, var(--color-primary))",
							}}
							transition={{
								pathLength: {
									duration:
										prefetchState === "ready"
											? hasBeenPrefetched
												? 0.15
												: 0.25
											: 1.0,
									ease: prefetchState === "ready" ? "easeOut" : "linear",
								},
								opacity: { duration: 0.3 },
								stroke: { duration: 0.3 },
							}}
							x="1"
							y="1"
							width="calc(100% - 2px)"
							height="calc(100% - 2px)"
							fill="none"
							stroke="var(--color-primary)"
							strokeWidth="1.5"
							strokeLinecap="round"
							rx="16"
							className="transition-all duration-300"
							style={{
								filter:
									prefetchState === "ready" ||
									(prefetchState === "idle" && hasBeenPrefetched)
										? prefetchState === "ready"
											? "drop-shadow(0 0 6px var(--color-primary))"
											: "drop-shadow(0 0 3px var(--color-primary))"
										: "none",
							}}
						/>
					</svg>
				</div>

				<Link
					href={`/blog/${post.path}`}
					className="card-jump-overlay z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-[inherit]"
					aria-label={`Read post: ${post.displayTitle || post.title}`}
				/>

				{/* Top Decorative Line / Background Banner */}
				{post.banner ? (
					<div className="absolute inset-0 pointer-events-none -z-10 bg-background">
						<Image
							src={post.banner}
							alt={post.title}
							fill
							className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen transition-[transform,opacity] duration-200 hover:duration-400 ease-[cubic-bezier(0.2,1,0.2,1)] group-hover:scale-105 group-hover:opacity-30"
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
					</div>
				) : (
					<div className="pointer-events-none absolute left-0 top-0 h-[1px] w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
				)}

				{/* Main Content Area - elevated to z-20 for reachability */}
				<div className="flex-1 flex flex-col p-5 sm:p-6 pointer-events-none relative z-20 transition-transform duration-500 group-hover:translate-x-1">
					<div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
						<span className="font-mono text-[9px] sm:text-[10px] tracking-widest text-primary/40 group-hover:text-primary transition-colors duration-500">
							{serialNumber}
						</span>
						<div className="h-[1px] flex-1 bg-gradient-to-r from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
					</div>

					<h2 className="text-sm sm:text-base font-bold leading-snug sm:leading-relaxed tracking-tight text-foreground line-clamp-2 transition-colors duration-500 group-hover:text-primary">
						<HighlightedText
							html={post.highlightedTitle || post.displayTitle || post.title}
						/>
					</h2>
					{/* Tags - must be above z-10 and have pointer-events-auto */}
					{post.tags && post.tags.length > 0 && (
						<div className="mt-3 sm:mt-4 flex flex-wrap gap-1.5 pointer-events-auto relative z-30">
							{post.tags.slice(0, 1).map((tag: string) => (
								<Tag
									key={tag}
									interactive
									variant={
										selectedTags.has(tag.toLowerCase()) ? "active" : "default"
									}
									onClick={(e) => {
										e.preventDefault();
										onTagSelect?.(tag);
									}}
									className="text-[9px] px-2 py-0.5"
								>
									{tag}
								</Tag>
							))}
						</div>
					)}
				</div>

				{/* Footer Meta area elevated to z-20 */}
				<div className="relative z-20 flex items-center justify-between px-5 sm:px-6 pb-5 sm:pb-6 pt-1 sm:pt-2 pointer-events-none">
					<div className="flex items-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] font-mono tracking-[0.15em] sm:tracking-[0.2em] text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors duration-500">
						<time dateTime={post.date}>{formattedDate}</time>
						<span className="h-2.5 w-[1px] bg-border/40" />
						<div className="flex items-center gap-1">
							<Clock className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
							<span>{post.readingTime || "5 MIN"}</span>
						</div>
					</div>
				</div>

				{/* Unified Industrial CTA (Bottom Right) */}
				<div className="absolute bottom-5 right-5 sm:bottom-6 sm:right-6 z-30 pointer-events-none">
					<div
						className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]
						${
							prefetchState === "ready"
								? "bg-primary border-primary shadow-[0_0_15px_rgba(var(--primary),0.5)] scale-110"
								: "bg-background/20 border-primary/20 shadow-none scale-100"
						}
						${prefetchState !== "idle" || hasBeenPrefetched ? "opacity-100" : "opacity-0 translate-x-1"}
					`}
					>
						<ArrowRight
							className={`h-2.5 w-2.5 sm:h-3 sm:w-3 transition-all duration-500 
							${prefetchState === "ready" ? "text-primary-foreground -rotate-45" : "text-primary/70 rotate-0"}
						`}
						/>
					</div>

					{/* Predictive Loading Ring */}
					{prefetchState === "loading" && (
						<div className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-30" />
					)}
				</div>
			</div>
		</article>
	);
}
