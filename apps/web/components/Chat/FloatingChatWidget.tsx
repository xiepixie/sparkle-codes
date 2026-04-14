/** biome-ignore-all lint/a11y/useSemanticElements: as buttons*/
"use client";

import { useChat } from "@ai-sdk/react";
import { cn, toast } from "@repo/ui";
import { normalizeSlug } from "@repo/utils";
import {
	AnimatePresence,
	animate,
	motion,
	useDragControls,
	useMotionValue,
} from "framer-motion";
import { FileText, RefreshCw, Sparkles, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChatPanel } from "./ChatPanel";

export function FloatingChatWidget() {
	const [isOpen, setIsOpen] = useState(false);
	const [readingContext, setReadingContext] = useState<any>(null);
	const [mounted, setMounted] = useState(false);
	const widgetRef = useRef<HTMLDivElement>(null);
	const dimRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({ width: 450, height: 720 });
	const [isResizing, setIsResizing] = useState(false);
	const [isPurging, setIsPurging] = useState(false);
	const [toggleSide, setToggleSide] = useState<"left" | "right">("right");
	const isDraggingRef = useRef(false);
	const [isWindowDragging, setIsWindowDragging] = useState(false);
	const dragControls = useDragControls();

	// Independent coordinate tracking to prevent animation snaps & lag
	const badgeX = useMotionValue(0);
	const windowX = useMotionValue(0);
	const windowY = useMotionValue(0);
	const windowWidth = useMotionValue(450);
	const windowHeight = useMotionValue(720);

	const [savedWindowPos, setSavedWindowPos] = useState<{x: number, y: number} | null>(null);

	const saveConfig = useCallback((newCfg: any) => {
		try {
			const existing = JSON.parse(
				localStorage.getItem("sparkle:chat-widget-config") || "{}",
			);
			localStorage.setItem(
				"sparkle:chat-widget-config",
				JSON.stringify({ ...existing, ...newCfg }),
			);
		} catch {
			// Silently fail if storage is unavailable
		}
	}, []);

	useEffect(() => {
		setMounted(true);
		try {
			const cfg = JSON.parse(
				localStorage.getItem("sparkle:chat-widget-config") || "{}",
			);
			if (cfg.dimensions) {
				setDimensions(cfg.dimensions);
				windowWidth.set(cfg.dimensions.width);
				windowHeight.set(cfg.dimensions.height);
			}
			if (cfg.toggleSide) {
				setToggleSide(cfg.toggleSide);
				badgeX.set(
					cfg.toggleSide === "left" ? -(window.innerWidth - 64 - 48) : 0,
				);
			}
			if (cfg.windowX !== undefined && cfg.windowY !== undefined) {
				setSavedWindowPos({ x: cfg.windowX, y: cfg.windowY });
			}
		} catch {
			// Ignore malformed config
		}
	}, [windowWidth, windowHeight, badgeX]);

	// Responsive re-anchoring for the badge
	useEffect(() => {
		const handleResize = () => {
			if (!isOpen) {
				const bTargetX =
					toggleSide === "left" ? -(window.innerWidth - 64 - 48) : 0;
				badgeX.set(bTargetX);
			}
		};

		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [isOpen, toggleSide, badgeX]);

	// On mount/open, initialize the positional anchor based on current screen side preference
	useEffect(() => {
		if (isOpen) {
			windowX.set(savedWindowPos ? savedWindowPos.x : (toggleSide === "left" ? -(window.innerWidth - dimensions.width - 64) : 0));
			windowY.set(savedWindowPos ? savedWindowPos.y : 0);
		}
	}, [isOpen, savedWindowPos, toggleSide, dimensions.width, windowX, windowY]);

	// Block body selection during resize and enable smooth transitions
	useEffect(() => {
		if (isResizing) {
			document.body.style.userSelect = "none";
			document.body.style.cursor = "nwse-resize";
		} else {
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		}
		return () => {
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};
	}, [isResizing]);


	// Persist session state even when collapsed
	const chat = useChat({
		id: "sparkle-floating-chat",
		experimental_throttle: 50,
	});

	// Shortcut: Cmd+Shift+L to toggle chat
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "l" && e.metaKey && e.shiftKey) {
				e.preventDefault();
				setIsOpen((prev) => !prev);
			}
			if (e.key === "Escape" && isOpen) {
				setIsOpen(false);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	useEffect(() => {
		const handleCommandCenterSync = (event: Event) => {
			const customEvent = event as CustomEvent<{ reading?: any }>;
			if (customEvent.detail?.reading !== undefined) {
				setReadingContext(customEvent.detail.reading ?? null);
			}
		};

		window.addEventListener(
			"sparkle:command-center-sync",
			handleCommandCenterSync as EventListener,
		);
		return () =>
			window.removeEventListener(
				"sparkle:command-center-sync",
				handleCommandCenterSync as EventListener,
			);
	}, []);

	// --- 3. Optimized Decision Layer: Context Memoization ---
	// Why: ChatPanel is a heavy React.memo component. If we pass a new object literal
	// on every FloatingChatWidget render, we break the memoization and trigger 
	// a full reconciliation of the message list (300ms+ on large histories).
	const memoizedContext = React.useMemo(() => {
		if (!readingContext) {
			return undefined;
		}
		return { title: readingContext.title, slug: readingContext.slug };
	}, [readingContext?.title, readingContext?.slug]);

	const router = useRouter();
	const handleLinkClick = useCallback(
		(url: string) => {
			// 1. Instant Same-Page Anchor Detection
			if (url.startsWith("#")) {
				window.dispatchEvent(
					new CustomEvent("sparkle:scroll-to-fragment", {
						detail: { fragment: url.slice(1) },
					}),
				);
				return;
			}

		// 2. Protocol/External Check
		if (url.startsWith("http://") || url.startsWith("https://")) {
			window.open(url, "_blank", "noopener,noreferrer");
			return;
		}

		// 3. Normalized Context Matching
		// Strip leading /blog/ or / if present for comparison
		const cleanPath = url
			.split("#")[0]
			.replace(/^\/(blog|docs)\//, "") // Strip /blog/ or /docs/
			.replace(/^\/+/, "");
		
		const fragment = url.split("#")[1] || "";
		const targetSlug = normalizeSlug(cleanPath);
		const currentSlug = normalizeSlug(readingContext?.slug);

		if (!targetSlug || targetSlug === currentSlug) {
			if (fragment) {
				window.dispatchEvent(
					new CustomEvent("sparkle:scroll-to-fragment", {
						detail: { fragment },
					}),
				);
			}
			return;
		}

		// 4. Cross-page navigation (ensure absolute path)
		const destination = url.startsWith("/") ? url : `/blog/${url}`;
		router.push(destination);
	}, [readingContext?.slug, router]);

	if (!mounted) {
		return null;
	}

	return (
		<>
			<AnimatePresence initial={false}>
				{!isOpen && (
					<motion.button
						key="fab"
						drag
						dragConstraints={{ 
							left: -(window.innerWidth - 64 - 48), 
							right: 0, // Stay within right margin
							top: -(window.innerHeight - 64 - 48),
							bottom: 0 
						}}
						dragElastic={0.1}
						dragMomentum={false}
						onDragStart={() => {
							isDraggingRef.current = true;
						}}
						onDragEnd={(_, info) => {
							setTimeout(() => {
								isDraggingRef.current = false;
							}, 100);

							const thresholdX = window.innerWidth / 2;
							const isLeft = info.point.x < thresholdX;
							setToggleSide(isLeft ? "left" : "right");
							
							const targetX = isLeft 
								? -(window.innerWidth - 64 - 48) 
								: 0; 
							
							// Spring physical bounce manually to bypass React render loop
							animate(badgeX, targetX, { type: "spring", stiffness: 400, damping: 30 });
							saveConfig({ toggleSide: isLeft ? "left" : "right" });
						}}
						initial={{ scale: 0, opacity: 0 }}
						animate={{ 
							scale: 1, 
							opacity: 1, 
						}}
						style={{ x: badgeX }}
						transition={{ 
							type: "spring", 
							stiffness: 400, 
							damping: 30
						}}
						exit={{ scale: 0, opacity: 0 }}
						whileHover={{ 
							scale: 1.05, 
						}}
						whileTap={{ scale: 0.9, cursor: "grabbing" }}
						onTap={() => {
							if (!isDraggingRef.current) {
								setIsOpen(true);
							}
						}}
						className={cn(
							"fixed bottom-[32px] right-[32px] z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_40px_rgba(var(--primary-rgb),0.3)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-md transition-shadow group cursor-grab border border-white/10",
						)}
						aria-label="Open Sparkle AI Assistant"
					>
						<div className="absolute inset-0 rounded-full bg-gradient-to-tr from-foreground/5 to-transparent pointer-events-none" />
						<Sparkles
							size={22}
							className="relative z-10 animate-in zoom-in-50 duration-700"
							strokeWidth={1.5}
						/>

						{/* Premium status indicator */}
						<div className="absolute -bottom-1 -right-1 flex gap-0.5">
							{readingContext && (
								<motion.div 
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									className="w-4 h-4 bg-foreground text-background rounded-full border border-background flex items-center justify-center shadow-sm"
								>
									<Zap size={8} fill="currentColor" />
								</motion.div>
							)}
						</div>
					</motion.button>
				)}
			</AnimatePresence>

			<AnimatePresence initial={false}>
				{isOpen && (
					<motion.div
						key="chat-window-wrapper"
						className="fixed bottom-8 right-8 z-50 pointer-events-none"
						initial={{ opacity: 0, y: 20, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.2 } }}
						transition={{ type: "spring", stiffness: 350, damping: 30 }}
					>
						<motion.div
							ref={widgetRef}
							drag
							dragControls={dragControls}
							dragListener={false}
							dragMomentum={false}
							onDragStart={() => setIsWindowDragging(true)}
							onDragEnd={(_, info) => {
								setIsWindowDragging(false);
								const thresholdX = window.innerWidth / 2;
								const isLeft = info.point.x < thresholdX;
								setToggleSide(isLeft ? "left" : "right");
								
								// Snap the badge position behind the scenes
								const bTargetX = isLeft ? -(window.innerWidth - 64 - 48) : 0;
								badgeX.set(bTargetX);

								const finalX = windowX.get();
								const finalY = windowY.get();
								setSavedWindowPos({ x: finalX, y: finalY });
								saveConfig({ 
									toggleSide: isLeft ? "left" : "right",
									windowX: finalX,
									windowY: finalY
								});
							}}
							className={cn(
								"flex flex-col overflow-hidden rounded-[1.5rem] border border-border/20 bg-background/95 shadow-[0_32px_80px_rgba(0,0,0,0.2)] dark:shadow-[0_32px_80px_rgba(0,0,0,0.6)] backdrop-blur-3xl transition-shadow",
								(isResizing || isWindowDragging) && "select-none shadow-[0_0_40px_rgba(var(--primary-rgb),0.2)] ring-1 ring-primary/30",
							)}
							style={{ 
								width: windowWidth, 
								height: windowHeight,
								maxWidth: "calc(100vw - 3rem)",
								maxHeight: "85vh",
								x: windowX,
								y: windowY,
								pointerEvents: "auto",
							}}
						>
						{/* Resize Dimension Indicator */}
						<AnimatePresence>
							{isResizing && (
								<motion.div
									initial={{ opacity: 0, scale: 0.9 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.9 }}
									transition={{ duration: 0.1 }} 
									className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
								>
									<div 
										ref={dimRef}
										className="px-3 py-1.5 rounded-full bg-primary/95 text-primary-foreground text-[10px] font-black tabular-nums shadow-2xl backdrop-blur-md border border-white/20 select-none"
									>
										{Math.round(dimensions.width)} × {Math.round(dimensions.height)}
									</div>
								</motion.div>
							)}
						</AnimatePresence>

						{/* --- Resize Handles --- */}
						
						{/* 1. Top-Left Handle (Standard) */}
						<div
							role="button"
							tabIndex={-1}
							aria-label="Resize from top left"
							className={cn(
								"absolute top-0 left-0 w-8 h-8 cursor-nw-resize z-40 group/resize-tl transition-opacity rounded-tl-3xl",
								isResizing ? "opacity-100" : "opacity-0 hover:opacity-100"
							)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") { e.preventDefault(); }
							}}
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
								setIsResizing(true);
								const startX = e.clientX;
								const startY = e.clientY;
								const startWidth = dimensions.width;
								const startHeight = dimensions.height;

								const onMouseMove = (moveEvent: MouseEvent) => {
									const deltaX = startX - moveEvent.clientX; 
									const deltaY = startY - moveEvent.clientY; 
									
									const newWidth = Math.min(
										window.innerWidth - 32,
										Math.max(280, startWidth + deltaX),
									);
									const newHeight = Math.min(
										window.innerHeight - 32,
										Math.max(300, startHeight + deltaY),
									);

									// Fully deferred to Framer Motion batched loop
									windowWidth.set(newWidth);
									windowHeight.set(newHeight);

									if (dimRef.current) {
										dimRef.current.textContent = `${Math.round(newWidth)} × ${Math.round(newHeight)}`;
									}
								};

								const onMouseUp = () => {
									const currentWidth = windowWidth.get();
									const currentHeight = windowHeight.get();
									const newDim = { width: currentWidth, height: currentHeight };
									setDimensions(newDim);
									saveConfig({ dimensions: newDim });

									setIsResizing(false);
									document.removeEventListener("mousemove", onMouseMove);
									document.removeEventListener("mouseup", onMouseUp);
								};

								document.addEventListener("mousemove", onMouseMove);
								document.addEventListener("mouseup", onMouseUp);
							}}
						>
							<div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-primary/40 rounded-tl-[2px]" />
						</div>

						{/* 2. Top-Right Handle (As requested) */}
						<div
							role="button"
							tabIndex={-1}
							aria-label="Resize height from top right"
							className={cn(
								"absolute top-0 right-0 w-8 h-8 cursor-ne-resize z-40 group/resize-tr transition-opacity rounded-tr-3xl",
								isResizing ? "opacity-100" : "opacity-0 hover:opacity-100"
							)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") { e.preventDefault(); }
							}}
							onMouseDown={(e) => {
								e.preventDefault();
								e.stopPropagation();
								setIsResizing(true);
								const startX = e.clientX;
								const startY = e.clientY;
								const startWidth = dimensions.width;
								const startHeight = dimensions.height;
								const startXOffset = windowX.get(); // Essential for compensating left edge Shift

								const onMouseMove = (moveEvent: MouseEvent) => {
									const deltaX = moveEvent.clientX - startX; 
									const deltaY = startY - moveEvent.clientY; 
									
									const newWidth = Math.min(
										window.innerWidth - 32,
										Math.max(280, startWidth + deltaX),
									);
									const newHeight = Math.min(
										window.innerHeight - 32,
										Math.max(300, startHeight + deltaY),
									);

									// Anchor compensation: Because the CSS base is right-8, changing width moves the left edge.
									// To keep left edge fixed when scaling Right edge, we must shift the entire window right by deltaWidth.
									const deltaWidth = newWidth - startWidth;
									
									// ALL motion values batched into a single rAF cycle -> Zero Layout Tearing
									windowWidth.set(newWidth);
									windowHeight.set(newHeight);
									windowX.set(startXOffset + deltaWidth);

									if (dimRef.current) {
										dimRef.current.textContent = `${Math.round(newWidth)} × ${Math.round(newHeight)}`;
									}
								};

								const onMouseUp = () => {
									const currentWidth = windowWidth.get();
									const currentHeight = windowHeight.get();
									const newDim = { width: currentWidth, height: currentHeight };
									
									setDimensions(newDim);
									const finalX = windowX.get();
									setSavedWindowPos(prev => prev ? { ...prev, x: finalX } : { x: finalX, y: windowY.get() });
									saveConfig({ dimensions: newDim, windowX: finalX });

									setIsResizing(false);
									document.removeEventListener("mousemove", onMouseMove);
									document.removeEventListener("mouseup", onMouseUp);
								};

								document.addEventListener("mousemove", onMouseMove);
								document.addEventListener("mouseup", onMouseUp);
							}}
						>
							<div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-primary/40 rounded-tr-[2px]" />
						</div>

						{/* Premium Integrated Header - ACTS AS DRAG HANDLE */}
						<div
							onPointerDown={(event) => dragControls.start(event)}
							className="flex items-center justify-between px-6 py-4 border-b border-border/10 bg-muted/20 backdrop-blur-md cursor-move active:cursor-grabbing select-none"
						>
								<div className="relative">
									<div className={cn(
										"flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background shadow-lg transition-all duration-500",
										(chat.status === 'submitted' || chat.status === 'streaming') && "animate-pulse shadow-glow-sm scale-110"
									)}>
										<Sparkles size={16} fill="currentColor" />
									</div>
									{(chat.status === 'submitted' || chat.status === 'streaming') && (
										<div className="absolute -inset-1 rounded-xl border border-primary/40 animate-ping opacity-50 pointer-events-none" />
									)}
								</div>
								<div className="flex flex-col">
									<div className="flex items-center gap-2">
										<span className="text-[10px] text-muted-foreground/50 font-bold flex items-center gap-1.5 whitespace-nowrap">
											{readingContext ? (
												<>
													<FileText size={10} />
													Contextualized to reading
												</>
											) : (
												"General Knowledge Bridge"
											)}
										</span>
										{(chat.status === 'submitted' || chat.status === 'streaming') && (
											<div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 animate-in fade-in zoom-in duration-300">
												<div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
												<div className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
												<div className="w-1 h-1 rounded-full bg-primary animate-bounce" />
												<span className="text-[8px] font-black uppercase tracking-tighter text-primary/80">Thinking</span>
											</div>
										)}
									</div>
								</div>
							<div className="flex items-center gap-2">
								{chat.messages.length > 0 && (
									<button
										type="button"
										onClick={() => {
											// INDUSTRIAL UPGRADE: Use React 19 startTransition to ensure
											// the toast logic doesn't block immediate UI feedback (active:scale).
											React.startTransition(() => {
												toast.warning("Reset Memory?", {
													description: "All conversation context will be permanently purged.",
													duration: 8000,
													action: {
														label: "Confirm Wipe",
														onClick: () => {
															setIsPurging(true);
															setTimeout(() => {
																chat.setMessages([]);
																localStorage.removeItem("sparkle_chat_history");
																setIsPurging(false);
																toast.success("Memory Purged", {
																	description: "AI is now in a blank state."
																});
															}, 800);
														}
													}
												});
											});
										}}
										className="flex items-center justify-center h-8 px-3 rounded-lg hover:bg-red-500/10 text-muted-foreground/40 hover:text-red-500/80 transition-all text-[9px] font-black uppercase tracking-widest gap-2 bg-foreground/[0.02] border border-transparent hover:border-red-500/20"
										title="Reset AI Context"
									>
										<RefreshCw size={10} className="text-current" />
										Reset
									</button>
								)}
								<button
									type="button"
									onClick={() => setIsOpen(false)}
									className="flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted/50 text-muted-foreground/30 hover:text-foreground transition-all"
								>
									<X size={16} />
								</button>
							</div>
						</div>

						<ChatPanel
							chat={chat}
							hideInput={false}
							showHeader={false}
							isPurging={isPurging}
							onLinkClick={handleLinkClick}
							context={memoizedContext}
						/>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
