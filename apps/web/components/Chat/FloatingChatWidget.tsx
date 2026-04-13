"use client";

import { useChat } from "@ai-sdk/react";
import { cn } from "@repo/ui";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, FileText, RefreshCw, Sparkles, X, Zap } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatPanel } from "./ChatPanel";

export function FloatingChatWidget() {
	const [isOpen, setIsOpen] = useState(false);
	const [readingContext, setReadingContext] = useState<any>(null);
	const [mounted, setMounted] = useState(false);
	const widgetRef = useRef<HTMLDivElement>(null);
	const [dimensions, setDimensions] = useState({ width: 450, height: 640 });
	const [isResizing, setIsResizing] = useState(false);

	// Block body selection during resize
	useEffect(() => {
		if (isResizing) {
			document.body.style.userSelect = "none";
			document.body.style.cursor = "nw-resize";
		} else {
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		}
		return () => {
			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		};
	}, [isResizing]);

	useEffect(() => {
		setMounted(true);
	}, []);

	// Persist session state even when collapsed
	const chat = useChat({
		id: "sparkle-floating-chat",
	});

	const { isLoading } = chat as any;

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

	if (!mounted) {
		return null;
	}

	return (
		<>
			<AnimatePresence>
				{!isOpen && (
					<motion.button
						key="fab"
						initial={{ scale: 0, opacity: 0, y: 20 }}
						animate={{ scale: 1, opacity: 1, y: 0 }}
						exit={{ scale: 0, opacity: 0, y: 20 }}
						whileHover={{ scale: 1.1, y: -2 }}
						whileTap={{ scale: 0.9 }}
						onClick={() => setIsOpen(true)}
						className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary-rgb),0.4)] transition-all hover:scale-110 active:scale-95 group"
						aria-label="Open Sparkle AI Assistant"
					>
						<Sparkles
							size={22}
							className="relative z-10 animate-in zoom-in-50 duration-500"
						/>

						{/* Context Active Indicator */}
						{readingContext && (
							<div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-background flex items-center justify-center animate-pulse">
								<Zap size={8} className="fill-white text-white" />
							</div>
						)}
					</motion.button>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						key="chat-window"
						ref={widgetRef}
						initial={{ opacity: 0, y: 20, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 20, scale: 0.95 }}
						transition={{ type: "spring", stiffness: 300, damping: 30 }}
						className={cn(
							"fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-[1.5rem] border border-border/20 bg-background/95 shadow-2xl backdrop-blur-xl transition-shadow",
							isResizing && "select-none shadow-[0_0_40px_rgba(var(--primary-rgb),0.1)] ring-1 ring-primary/20",
						)}
						style={{ 
							width: `${dimensions.width}px`, 
							height: `${dimensions.height}px`,
							maxWidth: "calc(100vw - 3rem)",
							maxHeight: "85vh" 
						}}
					>
						{/* Resize Handle (Top-Left) */}
						{/* biome-ignore lint/a11y/noStaticElementInteractions: specialized drag zone */}
						<div
							className="absolute top-0 left-0 w-12 h-12 cursor-nw-resize z-30 group/resize outline-none select-none"
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									toast.info("Use mouse to drag and resize.");
								}
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
									const deltaX = startX - moveEvent.clientX; // Left drag increases width
									const deltaY = startY - moveEvent.clientY; // Top drag increases height
									setDimensions({
										width: Math.min(1000, Math.max(380, startWidth + deltaX)),
										height: Math.min(900, Math.max(400, startHeight + deltaY)),
									});
								};

								const onMouseUp = () => {
									setIsResizing(false);
									document.removeEventListener("mousemove", onMouseMove);
									document.removeEventListener("mouseup", onMouseUp);
								};

								document.addEventListener("mousemove", onMouseMove);
								document.addEventListener("mouseup", onMouseUp);
							}}
						/>

						{/* Premium Integrated Header */}
						<div className="flex items-center justify-between px-6 py-4 border-b border-border/10 bg-muted/20 backdrop-blur-md">
							<div className="flex items-center gap-3">
								<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-glow-sm">
									<Bot
										size={16}
										className={cn("text-primary", isLoading && "animate-pulse")}
									/>
								</div>
								<div className="flex flex-col">
									<span className="text-xs font-black uppercase tracking-widest text-foreground/80">
										Expert AI
									</span>
									<span className="text-[10px] text-muted-foreground/50 font-bold flex items-center gap-1.5">
										{readingContext ? (
											<>
												<FileText size={10} />
												Contextualized to reading
											</>
										) : (
											"General Knowledge Bridge"
										)}
									</span>
								</div>
							</div>
							<div className="flex items-center gap-2">
								{chat.messages.length > 0 && (
									<button
										type="button"
										onClick={() => {
											toast.custom((t) => (
												<div 
													className="flex w-[min(calc(100vw-3rem),340px)] flex-col gap-3 rounded-2xl border border-red-500/20 bg-background/95 p-4 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden group/toast animate-in slide-in-from-bottom-2 fade-in duration-500"
													data-cursor="none"
												>
													{/* Premium Top Edge Highlight */}
													<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
													
													{/* Pulsing Ember Background */}
													<div className="absolute -right-10 -top-10 w-32 h-32 bg-red-500/5 blur-[40px] rounded-full pointer-events-none" />
													
													<div className="flex items-start justify-between gap-4 relative z-10">
														<div className="flex items-center gap-3.5">
															<div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 shadow-inner">
																<RefreshCw size={20} className="animate-spin-slow" />
																<div className="absolute inset-0 rounded-xl bg-red-500/5 animate-pulse" />
															</div>
															<div className="flex flex-col">
																<span className="text-[13px] font-black text-foreground tracking-tight uppercase italic mb-0.5">
																	Reset Memory?
																</span>
																<span className="text-[11px] font-medium text-muted-foreground/70 leading-tight">
																	All conversation context will be permanently purged.
																</span>
															</div>
														</div>
														<button 
															type="button"
															data-action="true"
															onClick={() => toast.dismiss(t)}
															className="text-muted-foreground/30 hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
														>
															<X size={14} />
														</button>
													</div>

													<div className="flex items-center justify-end gap-2.5 mt-2 relative z-10 w-full">
														<button
															type="button"
															data-action="true"
															onClick={() => toast.dismiss(t)}
															className="px-3.5 py-1.5 text-[11px] font-bold text-muted-foreground/60 hover:text-foreground rounded-lg transition-all active:scale-95 uppercase tracking-widest"
														>
															Abort
														</button>
														<button
															type="button"
															data-action="true"
															data-button="true"
															onClick={() => {
																toast.dismiss(t);
																chat.setMessages([]);
																localStorage.removeItem("sparkle_chat_history");
																toast.success("Memory Purged", {
																	description: "AI is now in a blank state.",
																	icon: <Zap size={14} className="text-emerald-500 fill-current" />
																});
															}}
															className="flex items-center gap-2 px-5 py-2 text-[11px] font-black italic uppercase tracking-wider text-white bg-red-500 hover:bg-red-400 rounded-lg shadow-[0_10px_20px_-5px_rgba(239,68,68,0.4)] hover:shadow-[0_15px_25px_-5px_rgba(239,68,68,0.6)] transition-all active:scale-95"
														>
															Confirm Wipe
														</button>
													</div>

													{/* Auto-dismiss Life-line */}
													<div className="absolute bottom-0 left-0 h-[2px] bg-red-500/20 w-full overflow-hidden">
														<motion.div 
															initial={{ x: "-100%" }}
															animate={{ x: "0%" }}
															transition={{ duration: 10, ease: "linear" }}
															className="h-full bg-red-500" 
														/>
													</div>
												</div>
											), { duration: 10000 });
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
							context={
								readingContext
									? { title: readingContext.title, slug: readingContext.slug }
									: undefined
							}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
