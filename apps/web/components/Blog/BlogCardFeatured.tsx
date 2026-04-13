"use client";

import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";
import type { BlogPostSummary } from "@/lib/blog";
import { Tag, TiltWrapper } from "@repo/ui";
import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { HighlightedText } from "./HighlightedText";

interface BlogCardFeaturedProps {
	post: BlogPostSummary;
	serialNumber?: string;
	activeTags?: string[];
	onTagSelect?: (tag: string) => void;
}

export function BlogCardFeatured({
	post,
	serialNumber = "01",
	activeTags = [],
	onTagSelect,
}: BlogCardFeaturedProps) {
	const {
		prefetchState,
		hasBeenPrefetched,
		handleMouseEnter,
		handleMouseLeave,
	} = useHoverPrefetch(post.path, 300);

	const formattedDate = new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	}).format(new Date(post.date));

	const selectedTags = new Set(activeTags.map((tag) => tag.toLowerCase()));

	// Content Logic: Safely determine what text snippet to show (Search Highlight Support)
	const hasDescription = Boolean(
		post.highlightedDescription || post.description,
	);
	const normalizedDescription = (
		post.highlightedDescription ||
		post.description ||
		""
	)
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const normalizedBodyPreview = (post.highlightedBodyPreview || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const shouldShowBodyPreview =
		Boolean(post.highlightedBodyPreview) &&
		normalizedBodyPreview.length > 0 &&
		normalizedBodyPreview !== normalizedDescription;


	return (
		<article
			className="w-full"
			data-cursor="explore"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<TiltWrapper
				variant="nebula"
				tiltAngle={2.5}
				className="rounded-[2.5rem]"
			>
				<div className="group relative flex min-h-[520px] w-full flex-col overflow-hidden rounded-[2.5rem] border border-border/40 p-8 sm:p-12 transition-all duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] transform-gpu contain-paint [backface-visibility:hidden] [mask-image:linear-gradient(white,white)] [-webkit-mask-image:linear-gradient(white,white)]">
					{/* Performance Optimized Background Cluster */}
					<div className="absolute inset-0 z-[-10] pointer-events-none rounded-[inherit] overflow-hidden">
						<div className="absolute inset-0 bg-background/60 backdrop-blur-xl" />
						<div className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-[cubic-bezier(0.2,1,0.2,1)] group-hover:opacity-100 shadow-[inset_0_0_100px_rgba(var(--primary),0.1)]" />
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
									// Key Optimization: Once prefetched, the path is PERMANENTLY locked at 1.
									pathLength:
										prefetchState === "ready" || hasBeenPrefetched
											? 1
											: prefetchState === "loading"
												? 0.3
												: 0,
									// Opacity Logic:
									// - Hovering: 100%
									// - Cached but not hovered: 25% (A persistent indicator of readiness)
									// - Not cached: 0%
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
													: 0.3
												: 1.2,
										ease: prefetchState === "ready" ? "circOut" : "linear",
										type: prefetchState === "ready" ? "spring" : "tween",
										stiffness: 400,
										damping: 28,
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
								rx="40"
								style={{
									filter:
										prefetchState === "ready" ||
										(prefetchState === "idle" && hasBeenPrefetched)
											? prefetchState === "ready"
												? "drop-shadow(0 0 12px var(--color-primary))"
												: "drop-shadow(0 0 4px var(--color-primary))"
											: "none",
								}}
								className="transition-all duration-300"
							/>
						</svg>
					</div>

					<Link
						href={`/blog/${post.path}`}
						className="card-jump-overlay z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-[inherit]"
						aria-label={`Read post: ${post.title}`}
					/>

					{/* Banner Image */}
					{post.banner && (
						<div className="absolute inset-0 pointer-events-none -z-10 rounded-[inherit] overflow-hidden">
							<Image
								src={post.banner}
								alt={post.title}
								fill
								priority
								className="object-cover opacity-25 grayscale mix-blend-screen transition-all duration-1000 group-hover:scale-105 group-hover:opacity-40"
							/>
							<div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
						</div>
					)}

					{/* Decorative Blueprint Line (The "Industrial" Axis) */}
					<div className="absolute left-7 sm:left-11 top-[3.25rem] bottom-12 w-[1px] bg-primary/20 transition-all duration-500 group-hover:bg-primary/50 group-hover:shadow-[0_0_15px_rgba(var(--primary),0.3)] z-0" />

					{/* Layout Grid (Content Layer) elevated to z-20 to be above z-10 overlay */}
					<div className="relative z-20 flex flex-1 flex-col h-full pointer-events-none">
						{/* Header Row */}
						<div className="flex justify-between items-start w-full">
							<div className="flex flex-col gap-3 sm:gap-4 pl-0 sm:pl-4">
								<div className="flex items-center">
									<div className="relative h-6 w-fit flex items-center gap-2">
										{/* Ready 'Ping' Animation Overlay (Absolute) */}
										{prefetchState === "ready" && !hasBeenPrefetched && (
											<motion.div
												className="absolute inset-0 z-30 rounded-full bg-primary/40"
												initial={{ scale: 1, opacity: 0.8 }}
												animate={{ scale: 2.2, opacity: 0 }}
												transition={{ duration: 0.8, ease: "easeOut" }}
											/>
										)}

										{/* Crosshair SVG detail with Kinematic Rotation (Flex Flow) */}
										<motion.div
											className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary/80 shrink-0"
											animate={{
												rotate: prefetchState === "loading" ? 180 : 0,
											}}
											transition={{ duration: 0.6, ease: "easeInOut" }}
										>
											<svg viewBox="0 0 12 12" className="h-full w-full">
												<title>Interaction focal point</title>
												<path
													d="M6 0V12M0 6H12"
													stroke="currentColor"
													strokeWidth="0.8"
												/>
												<circle
													cx="6"
													cy="6"
													r="2.5"
													fill="none"
													stroke="currentColor"
													strokeWidth="0.8"
												/>
											</svg>
										</motion.div>

										<span
											className={`inline-flex items-center rounded-full backdrop-blur-md px-3 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.25em] ring-1 transition-all duration-500
											${
												prefetchState === "ready" || hasBeenPrefetched
													? "bg-primary/25 text-primary ring-primary/60 shadow-[0_0_15px_rgba(var(--primary),0.2)]"
													: "bg-primary/10 text-primary/70 ring-primary/20"
											}
											group-hover:ring-primary/50
										`}
										>
											LATEST
										</span>
									</div>
								</div>
								<time className="pl-5 sm:pl-6 text-[10px] sm:text-[11px] font-mono tracking-[0.2em] text-muted-foreground/40 uppercase">
									{formattedDate}
								</time>
							</div>

							{/* Serial Number: Reduced size on mobile to prevent overflow */}
							<div className="absolute top-0 right-0 font-mono text-[5rem] sm:text-[9rem] font-black leading-none text-primary/5 transition-all duration-700 group-hover:text-primary/10 select-none translate-x-4 -translate-y-8 sm:translate-x-8 sm:-translate-y-12">
								{serialNumber}
							</div>
						</div>

						{/* Title Section (Large Spacing) */}
						<div className="mt-auto mb-12 sm:mb-20 pl-0 sm:pl-4">
							<h2 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter text-foreground leading-[0.9] sm:leading-[0.85] transition-all duration-500 group-hover:text-primary group-hover:drop-shadow-[0_0_50px_rgba(var(--primary),0.3)]">
								<HighlightedText html={post.highlightedTitle || post.title} />
							</h2>

							{/* Description Snippet (Subtle, only shown if relevant to maintain airy look) */}
							{(hasDescription || shouldShowBodyPreview) && (
								<div className="mt-6 sm:mt-8 max-w-2xl text-base sm:text-lg md:text-xl font-medium tracking-tight text-muted-foreground/40 leading-relaxed transition-all duration-500 group-hover:text-muted-foreground/70 line-clamp-3 sm:line-clamp-none">
									<HighlightedText
										html={
											hasDescription
												? post.highlightedDescription || post.description || ""
												: post.highlightedBodyPreview || ""
										}
									/>
								</div>
							)}
						</div>

						{/* Footer Actions (Tucked in Bottom Right) */}
						<div className="flex flex-col sm:flex-row items-start sm:items-end justify-between w-full mt-auto pt-6 sm:pt-8 border-t border-border/10 gap-6 sm:gap-0">
							<div className="flex flex-wrap gap-1.5 sm:gap-2 pointer-events-auto">
								{post.tags?.slice(0, 3).map((tag) => (
									<Tag
										key={tag}
										interactive
										onClick={() => onTagSelect?.(tag)}
										variant={
											selectedTags.has(tag.toLowerCase()) ? "active" : "default"
										}
										className="rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 text-[9px] sm:text-[10px]"
									>
										{tag}
									</Tag>
								))}
							</div>

							<div className="flex items-center gap-6 mt-6 sm:mt-0">
								<div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-muted-foreground/60">
									<Clock className="h-4 w-4" />
									<span className="uppercase">
										{post.readingTime || "7 MIN READ"}
									</span>
								</div>

								<div className="relative group/btn pointer-events-auto">
									<div
										className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
										${
											prefetchState === "ready"
												? "bg-primary border-primary shadow-[0_0_30px_rgba(var(--primary),0.6)] scale-110"
												: "bg-background/20 border-primary/30 shadow-none scale-100"
										}
										group-hover/btn:scale-115
									`}
									>
										<ArrowRight
											className={`h-6 w-6 transition-all duration-300 
											${prefetchState === "ready" ? "text-primary-foreground -rotate-45" : "text-primary/70 rotate-0"}
										`}
										/>
									</div>

									{/* Predictive Ring */}
									{prefetchState === "loading" && (
										<motion.div
											className="absolute inset-0 rounded-full border border-primary/40"
											initial={{ scale: 0.8, opacity: 0 }}
											animate={{ scale: 1.4, opacity: 0 }}
											transition={{
												repeat: Number.POSITIVE_INFINITY,
												duration: 1,
												ease: "easeOut",
											}}
										/>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</TiltWrapper>
		</article>
	);
}
