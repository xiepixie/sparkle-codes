"use client";

import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import type { BlogPostSummary } from "@/lib/blog";
import { Tag } from "@repo/ui";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { HighlightedText } from "./HighlightedText";

interface BlogCardProps {
	post: BlogPostSummary;
	index: number;
	activeTags?: string[];
	onTagSelect?: (tag: string) => void;
}

function stripHtml(value?: string | null) {
	return (value || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function BlogCard({
	post,
	index,
	activeTags = [],
	onTagSelect,
}: BlogCardProps) {
	const {
		prefetchState,
		hasBeenPrefetched,
		handleMouseEnter,
		handleMouseLeave,
	} = useHoverPrefetch(post.path, 300);

	const selectedTags = new Set(
		activeTags.map((tag: string) => tag.toLowerCase()),
	);
	const hasDescription = Boolean(
		post.highlightedDescription || post.description,
	);
	const normalizedDescription = stripHtml(
		post.highlightedDescription || post.description,
	);
	const normalizedBodyPreview = stripHtml(post.highlightedBodyPreview);
	const shouldShowBodyPreview =
		Boolean(post.highlightedBodyPreview) &&
		normalizedBodyPreview.length > 0 &&
		normalizedBodyPreview !== normalizedDescription;

	// Format date consistently
	const formattedDate = new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(new Date(post.date));

	const serialNumber = String(index + 1).padStart(2, "0");

	return (
		<article
			className="h-full"
			style={{ animationDelay: `${index * 70}ms` }}
			data-cursor="explore"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/40 transition-all duration-300 ease-[cubic-bezier(0.2,1,0.2,1)] hover:-translate-y-px isolation-isolate">
				{/* Performance Optimized Background Cluster */}
				<div className="absolute inset-0 z-[-10] pointer-events-none rounded-[inherit] overflow-hidden contain-paint">
					<div className="absolute inset-0 bg-background/40 backdrop-blur-xl" />
					<div className="absolute inset-0 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.2,1,0.2,1)] group-hover:opacity-100 shadow-glow-sm" />
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
											: 1.2,
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
											? "drop-shadow(0 0 8px var(--color-primary))"
											: "drop-shadow(0 0 3px var(--color-primary))"
										: "none",
							}}
						/>
					</svg>
				</div>

				{/* 
				    INDUSTRIAL BULLTEPROOF OVERLAY:
				    Uses the high-specificity .card-jump-overlay utility to bypass 
				    any 'position: relative' or 'display: inline' leakage from 
				    typography.css or generic a-tag resets.
				*/}
				<Link
					href={`/blog/${post.path}`}
					className="card-jump-overlay z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset rounded-[inherit]"
					aria-label={`Read post: ${post.displayTitle || post.title}`}
				/>

				{/* Serial Number background / decoration */}
				<div className="absolute right-6 top-6 font-mono text-5xl font-black text-muted-foreground/5 transition-colors duration-200 hover:duration-400 ease-[cubic-bezier(0.2,1,0.2,1)] group-hover:text-primary/10 pointer-events-none z-0">
					{serialNumber}
				</div>

				{post.banner && (
					<div className="relative h-40 sm:h-48 md:h-56 w-full shrink-0 overflow-hidden border-b border-border/20 bg-background/50">
						<Image
							src={post.banner}
							alt=""
							fill
							priority={index < 2}
							className="object-cover transition-transform duration-200 hover:duration-400 ease-[cubic-bezier(0.2,1,0.2,1)] group-hover:scale-105 opacity-90 mix-blend-screen"
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
					</div>
				)}

				<div className="relative z-20 flex flex-1 flex-col p-5 sm:p-6 md:p-8 pointer-events-none">
					{/* Header Info: Date and Reading Time */}
					<div className="mb-3 sm:mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[9px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">
						<div className="flex items-center gap-1.5 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-primary/70">
							<Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
							<time dateTime={post.date}>{formattedDate}</time>
						</div>

						<span className="w-0.5 h-0.5 rounded-full bg-border/60" />

						<div className="flex items-center gap-1.5 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-primary/70">
							<Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
							<span>{post.readingTime || "5 MIN READ"}</span>
						</div>
					</div>

					{/* Tags (Eyebrow Position) - Need to be interactive so z-20 and pointer-events-auto */}
					{post.tags && post.tags.length > 0 && (
						<div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 relative z-30 pointer-events-auto">
							{post.tags.slice(0, 2).map((tag: string) => (
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
									aria-pressed={selectedTags.has(tag.toLowerCase())}
									className="text-[9px] sm:text-[10px] px-2 py-0.5 sm:px-3 sm:py-1"
								>
									{tag}
								</Tag>
							))}
						</div>
					)}

					{/* Title & Description */}
					<div className="mb-4 min-w-0 space-y-2 sm:space-y-4">
						<h2 className="text-lg sm:text-x font-bold leading-tight tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary [overflow-wrap:anywhere] sm:text-2xl pr-8 sm:pr-12">
							<HighlightedText
								html={post.highlightedTitle || post.displayTitle || post.title}
							/>
						</h2>

						{hasDescription ? (
							<div className="line-clamp-2 md:line-clamp-3 min-w-0 text-xs sm:text-sm font-sans leading-relaxed text-muted-foreground/85 transition-colors group-hover:text-foreground/90 [overflow-wrap:anywhere]">
								<HighlightedText
									html={post.highlightedDescription || post.description || ""}
								/>
							</div>
						) : null}

						{shouldShowBodyPreview && !hasDescription ? (
							<div className="rounded-xl sm:rounded-2xl border border-border/10 bg-muted/10 px-3 py-2 sm:px-4 sm:py-3 text-[10px] sm:text-xs leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
								<HighlightedText html={post.highlightedBodyPreview || ""} />
							</div>
						) : null}
					</div>
				</div>

				{/* Unified Industrial CTA (Bottom Right) */}
				<div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 pointer-events-none">
					<div
						className={`flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full border transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]
						${
							prefetchState === "ready"
								? "bg-primary border-primary shadow-[0_0_20px_rgba(var(--primary),0.5)] scale-110"
								: "bg-background/20 border-primary/20 shadow-none scale-100"
						}
						${prefetchState !== "idle" || hasBeenPrefetched ? "opacity-100" : "opacity-0 translate-x-1"}
					`}
					>
						<ArrowRight
							className={`h-3 w-3 sm:h-4 sm:w-4 transition-all duration-500 
							${prefetchState === "ready" ? "text-primary-foreground -rotate-45" : "text-primary/70 rotate-0"}
						`}
						/>
					</div>

					{/* Predictive Loading Ring */}
					{prefetchState === "loading" && (
						<div className="absolute inset-0 rounded-full border border-primary/30 animate-ping opacity-40" />
					)}
				</div>
			</div>
		</article>
	);
}
