"use client";

import {
	ArrowDown,
	Bot,
	FileText,
	Link2,
	Search,
	Send,
	Sparkles,
	User,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { Button, cn } from "@repo/ui";
import { CitationRenderer } from "./CitationRenderer";

type ChatState = any;

interface ChatPanelProps {
	initialQuery?: string;
	context?: {
		title: string;
		slug?: string;
	};
	chat?: ChatState;
	hideInput?: boolean;
	showHeader?: boolean;
	onLinkClick?: (url: string) => void;
	navigatingUrl?: string | null;
}

export function ChatPanel({
	initialQuery,
	context,
	chat,
	hideInput,
	showHeader = true,
	onLinkClick,
	navigatingUrl,
}: ChatPanelProps) {
	// --- 1. Top-Level Hooks (Unconditional) ---
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const lastSubmitRef = useRef<number>(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const initialized = useRef(false);
	const historyLoaded = useRef(false);
	const isAutoScrolling = useRef(false);

	// Safe destructuring with fallbacks for use before the early return
	const activeChat = (chat || {}) as any;
	const {
		input = "",
		messages = [],
		isLoading = false,
		error = null,
		handleInputChange,
		// handleSubmit is inherited from SDK but we use handleManualSubmit for custom buffer synchronization
		handleSubmit: _handleSubmit,
		sendMessage,
		setInput,
		setMessages,
	} = activeChat;

	const [localValue, setLocalValue] = useState(input || "");
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Sync isSubmitting with isLoading from the SDK
	useEffect(() => {
		if (isLoading) {
			setIsSubmitting(false);
		}
		
		// Safety fallback: if we are submitting but SDK doesn't pick up loading within 3s,
		// reset state to avoid getting the UI "stuck".
		if (isSubmitting && !isLoading) {
			const timer = setTimeout(() => {
				setIsSubmitting(false);
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [isLoading, isSubmitting]);

	const effectiveLoading = isLoading || isSubmitting;

	// Sync local value when external input changes (e.g. from RAG or Reset)
	useEffect(() => {
		setLocalValue(input || "");
	}, [input]);

	// Explicitly handle input changes to ensure state sync and immediate feedback
	const onInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const val = e.target.value;
		setLocalValue(val); // UI updates instantly

		// Auto-resize textarea
		if (inputRef.current) {
			inputRef.current.style.height = "auto";
			inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
		}

		if (typeof handleInputChange === "function") {
			handleInputChange(e as any);
		} else if (typeof setInput === "function") {
			setInput(val);
		}
	};

	// Robust submit wrapper to handle different SDK versions
	const handleManualSubmit = (e?: React.FormEvent) => {
		if (e) {
			e.preventDefault();
		}
		
		const now = Date.now();
		const finalInput = (localValue || "").trim();
		
		// 1. Strict guard: No empty, no multiple concurrent, 1s cooldown
		if (!finalInput || effectiveLoading || (now - lastSubmitRef.current < 1000)) {
			return;
		}

		lastSubmitRef.current = now;

		const {
			append,
			setInput: setSdkInput,
		} = activeChat as any;

		// 2. Clear local UI buffer immediately for snappy feel
		setLocalValue("");
		if (inputRef.current) {
			inputRef.current.style.height = "40px";
			inputRef.current.focus();
		}

		// 3. Sync SDK state and trigger completion
		setIsSubmitting(true);
		
		if (typeof append === "function") {
			// Direct append is more reliable than handleSubmit when using a local buffer
			append({ role: "user", content: finalInput });
			
			// Stay in sync
			if (typeof setSdkInput === "function") {
				setSdkInput("");
			}
		} else if (typeof sendMessage === "function") {
			sendMessage({ text: finalInput });
		}
	};


	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Command/Ctrl + Enter to send
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleManualSubmit(e as any);
		}
		// Standard Enter is now Newline (Default behavior for Textarea)
	};

	// --- 2. Functional Hooks & Logic ---
	// Focus management
	useEffect(() => {
		if (chat && !hideInput) {
			const timer = setTimeout(() => {
				inputRef.current?.focus();
			}, 300);
			return () => clearTimeout(timer);
		}
	}, [chat, hideInput]);

	// Initial query trigger
	useEffect(() => {
		if (
			chat &&
			initialQuery &&
			!initialized.current &&
			typeof sendMessage === "function"
		) {
			initialized.current = true;
			sendMessage({ text: initialQuery });
		}
	}, [chat, initialQuery, sendMessage]);

	// Autoscroll logic when messages update
	useEffect(() => {
		if (chat && isAtBottom && scrollRef.current && !isAutoScrolling.current) {
			requestAnimationFrame(() => {
				if (scrollRef.current && isAtBottom) {
					isAutoScrolling.current = true;
					scrollRef.current.scrollTo({
						top: scrollRef.current.scrollHeight + 200,
						behavior: "auto",
					});
					isAutoScrolling.current = false;
				}
			});
		}
	}, [chat, messages, isAtBottom]);

	const handleScroll = () => {
		if (!scrollRef.current) {
			return;
		}
		
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		// Use a slightly larger threshold (100px) for better UX
		const atBottom = scrollHeight - scrollTop - clientHeight < 100;
		
		// If we are not auto-scrolling and the user scrolls up, disable auto-bottom-lock
		if (!isAutoScrolling.current && !atBottom) {
			setIsAtBottom(false);
		} else if (atBottom) {
			setIsAtBottom(true);
		}
		
		setShowScrollButton(!atBottom);
	};

	const scrollToBottom = (instant = false) => {
		if (scrollRef.current) {
			setIsAtBottom(true); // Re-engage sticky-bottom lock
			isAutoScrolling.current = true;
			
			const targetTop = scrollRef.current.scrollHeight + 1000;
			
			scrollRef.current.scrollTo({
				top: targetTop,
				behavior: instant ? "auto" : "smooth",
			});
			
			// Second pass after a small delay to handle layout shifts (e.g. streaming content)
			setTimeout(() => {
				if (scrollRef.current && isAtBottom) {
					scrollRef.current.scrollTo({
						top: scrollRef.current.scrollHeight + 1000,
						behavior: "auto",
					});
				}
				isAutoScrolling.current = false;
			}, 300);
		}
	};



	// Extract citations from tool call results in the message history
	const getCitationsForMessage = () => {
		const citations: any[] = [];
		messages?.forEach((m: any) => {
			if (m.role === "assistant" && m.toolInvocations) {
				m.toolInvocations.forEach((inv: any) => {
					if (inv.toolName === "search" && inv.state === "result") {
						const results = (inv.result as any) || [];
						results.forEach((res: any) => {
							// Avoid duplicate citations by matching IDs
							if (!citations.find((c: any) => c.content === res.content)) {
								citations.push(res);
							}
						});
					}
				});
			}
		});
		return citations;
	};

	// Persistence: Save to local storage on message update
	useEffect(() => {
		if (!chat || !messages || messages.length === 0) {
			return;
		}
		
		const timer = setTimeout(() => {
			const persistenceTask = () => {
				try {
					localStorage.setItem("sparkle_chat_history", JSON.stringify(messages));
				} catch (e) {
					console.warn("Failed to persist chat history", e);
				}
			};

			if (typeof window.requestIdleCallback === "function") {
				window.requestIdleCallback(persistenceTask, { timeout: 2000 });
			} else {
				persistenceTask();
			}
		}, 1000);
		
		return () => clearTimeout(timer);
	}, [chat, messages]);

	// Load from local storage on mount
	useEffect(() => {
		if (!chat || historyLoaded.current) {
			return;
		}
		
		const saved = localStorage.getItem("sparkle_chat_history");
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				if (messages.length <= 1) {
					if (typeof setMessages === "function") {
						setMessages(parsed);
					}
					console.log("📂 [ChatPanel] Restored history:", parsed.length, "messages");
				}
				historyLoaded.current = true;
			} catch (e) {
				console.error("Failed to restore history", e);
			}
		} else {
			historyLoaded.current = true;
		}
	}, [chat, setMessages, messages.length]);

	// --- 3. Conditional Early Return ---
	// Now safe because all hooks have been called.
	if (!chat) {
		return null;
	}

	return (
		<div className="flex flex-col h-full w-full bg-transparent relative overflow-hidden">
			{/* 1. Header: Integrated Meta Actions & Status */}
			{showHeader && (
				<div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border/10 shrink-0 min-h-[56px] group/chat-header">
					<div className="flex items-center gap-3">
						<div
							className={cn(
								"relative flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-500",
								navigatingUrl
									? "bg-emerald-500/10 border-emerald-500/30 rotate-12"
									: effectiveLoading
										? "bg-amber-500/5 border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.1)]"
										: "bg-primary/5 border-primary/10 shadow-glow-sm",
							)}
						>
							{navigatingUrl ? (
								<ArrowDown
									size={13}
									className="text-emerald-500 animate-bounce"
								/>
							) : context ? (
								<FileText size={13} className="text-primary" />
							) : (
								<Bot
									size={13}
									className={cn(
										"transition-colors",
										isLoading ? "text-amber-500" : "text-primary",
									)}
								/>
							)}
							{/* Status Indicator Dot */}
							<div
								className={cn(
									"absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-background transition-all duration-500",
									navigatingUrl
										? "bg-emerald-500"
										: effectiveLoading
											? "bg-amber-500 animate-pulse"
											: messages.length > 0
												? "bg-emerald-500"
												: "bg-primary",
								)}
							/>
						</div>
						<div className="flex flex-col gap-0.5">
							<span
								className={cn(
									"text-[10px] font-black tracking-[0.15em] uppercase leading-none transition-all",
									navigatingUrl ? "text-emerald-500" : "text-foreground/85",
								)}
							>
								{navigatingUrl
									? "Navigating..."
									: effectiveLoading
										? "Thinking..."
										: context
											? "Knowledge Assistant"
											: "Sparkle AI Interface"}
							</span>
							<div className="flex items-center gap-1.5 overflow-hidden">
								<span className="text-[9px] font-bold text-muted-foreground/30 tracking-wider leading-none truncate max-w-[180px]">
									{navigatingUrl
										? `Entering: ${navigatingUrl.split("/").pop()?.split("#")[0] || "Target"}`
										: effectiveLoading
											? "Analyzing context & generating..."
											: context
												? `Focusing: ${context.title}`
												: messages.length > 0
													? "RAG Pipeline Active"
													: "Direct Response Mode"}
								</span>
							</div>
						</div>
					</div>

				</div>
			)}

				{/* 2. Messages area: Clean content-first layout */}
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="flex-1 overflow-y-auto px-4 py-4 space-y-8 scroll-smooth scrollbar-none"
				>
					<AnimatePresence mode="popLayout" initial={false}>
						{messages.length === 0 && !effectiveLoading && (
							<motion.div 
								key="empty-state"
								initial={{ opacity: 0, scale: 0.98 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								className="h-full flex flex-col items-center justify-center text-center opacity-60 py-20"
							>
								<Sparkles
									className="w-8 h-8 text-primary/40 mb-4"
									strokeWidth={1.5}
								/>
								<div className="space-y-1">
									<p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground/80">
										Sparkle AI Interface
									</p>
									<p className="text-[11px] text-muted-foreground/60 max-w-[200px] leading-relaxed font-medium">
										Ask about the current article or explore general technical
										concepts.
									</p>
								</div>
							</motion.div>
						)}
						{(() => {
							// Unify messages and skeleton into a single stream for zero-flicker transition
							const augmentedMessages = (effectiveLoading && (!messages.length || messages[messages.length - 1].role !== 'assistant'))
								? [...messages, { id: 'thinking-skeleton', role: 'assistant', content: '', _isSkeleton: true }]
								: messages;

							return augmentedMessages.map((m: any, i: number) => {
								const isUser = m.role === "user";
								
								// Robust text extraction: content -> text -> parts
								const textContent = m.content || 
									m.text ||
									(m.parts as any[])?.filter(p => p.type === "text").map(p => p.text).join("") ||
									"";

								if (!m.role) 
									{
										return null;
									}

								// Stable Item Key: Use a persistent key for the active stream to prevent AnimatePresence flickers
								// during the transition from skeleton to actual message arrival.
								const isLastAssistant = !isUser && i === augmentedMessages.length - 1;
								const itemKey = (m._isSkeleton || (isLastAssistant && effectiveLoading)) 
									? 'active-assistant-stream' 
									: m.id;

								return (
									<motion.div
										key={itemKey}
										layout="position"
										initial={{ opacity: 0, y: 10 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, scale: 0.95 }}
										transition={{ duration: 0.4, ease: "easeOut" }}
										className={cn(
											"group/message relative flex flex-col gap-3 pr-2 w-full",
											isUser ? "items-end" : "items-start text-left",
										)}
									>
							{/* Identity Label */}
							<div
								className={cn(
									"flex items-center gap-2 text-[10px] font-black tracking-[0.2em] uppercase mb-0.5",
									isUser
										? "flex-row-reverse text-muted-foreground/30"
										: "text-primary/60",
								)}
							>
								<div
									className={cn(
										"w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-500",
										isUser
											? "bg-muted/50 border-border/10 group-hover/message:border-primary/20"
											: "bg-primary/5 border-primary/20 shadow-glow-sm",
									)}
								>
									{isUser ? (
										<User size={10} />
									) : (
										<Sparkles
											size={10}
										/>
									)}
								</div>
								<span>{isUser ? "You" : "Sparkle AI"}</span>
							</div>

							{/* Content Bubble */}
							<div
								className={cn(
									"transition-all duration-500 overflow-hidden min-w-0",
									isUser
										? "w-fit max-w-[92%] rounded-2xl bg-foreground/[0.03] dark:bg-white/5 border border-border/10 px-4 py-2.5 hover:bg-foreground/[0.05] dark:hover:bg-white/[0.08] hover:border-primary/20 hover:shadow-glow-sm ml-auto"
										: "w-full bg-transparent p-0",
								)}
							>
									<div className={cn(!isUser && "max-w-none !text-left !ml-0 !mr-auto text-foreground/90")}>
										{!isUser ? (
											<div className="flex flex-col gap-2">
												<CitationRenderer
													text={textContent}
													citations={getCitationsForMessage()}
													onLinkClick={onLinkClick}
												/>
												{/* Enhanced Loading State: Show if content is truly empty for assistant */}
												{!textContent && effectiveLoading && (
													<div className="flex items-center gap-2 py-1">
														<div className="flex gap-1">
															<div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
															<div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
															<div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
														</div>
														<span className="text-[11px] font-bold text-primary/50 uppercase tracking-widest">
															Thinking...
														</span>
													</div>
												)}

												{/* Source Footer: List all cited documents at the bottom */}
												{(() => {
													const citations = getCitationsForMessage();
													if (citations.length === 0) {
														return null;
													}
													return (
														<div className="mt-6 pt-4 border-t border-border/5 animate-in fade-in slide-in-from-bottom-2 duration-500">
															<div className="flex items-center gap-2 mb-3">
																<div className="flex h-4 w-4 items-center justify-center rounded-sm bg-primary/10 border border-primary/20">
																	<Link2 size={9} className="text-primary" />
																</div>
																<span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
																	Sources & References
																</span>
															</div>
															<div className="flex flex-wrap gap-2">
																{citations.map((c, idx) => {
																	const href = `/blog/${c.slug}${c.headingId ? `#${c.headingId}` : ""}`;
																	return (
																		<Link
																			key={`${m.id}-cite-${idx}`}
																			href={href}
																			onClick={(e: React.MouseEvent) => {
																				if (onLinkClick) {
																					e.preventDefault();
																					onLinkClick(href);
																				}
																			}}
																			className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-sm bg-primary/[0.03] dark:bg-white/[0.02] border-l-2 border-primary/30 transition-all no-underline group/source"
																			data-cursor="link"
																		>
																			<div className="flex items-center justify-center w-3 h-3 text-primary/40 transition-colors">
																				<Sparkles size={9} strokeWidth={2.5} />
																			</div>
																			<div className="flex items-center gap-1.5">
																				<span className="text-[9px] font-black uppercase tracking-widest text-primary/20 transition-colors shrink-0">
																					S{idx + 1}
																				</span>
																				<span className="text-[11px] font-bold text-foreground/70 transition-colors truncate max-w-[140px] tracking-tight">
																					{c.title}
																				</span>
																			</div>
																		</Link>
																	);
																})}
															</div>
														</div>
													);
												})()}
											</div>
										) : (
											<span className="text-sm leading-relaxed whitespace-pre-wrap">
												{textContent}
											</span>
										)}
									</div>

								{/* Tool Invocations for Assistant */}
								{!isUser &&
									m.toolInvocations?.map((inv: any) => (
										<motion.div
											key={inv.toolCallId}
											initial={{ opacity: 0, scale: 0.95 }}
											animate={{ opacity: 1, scale: 1 }}
											className="mt-6 inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 group/tool overflow-hidden relative"
											data-cursor="action"
										>
											<div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full" />
											<Search
												size={11}
												className={cn(
													"text-primary transition-all",
													inv.state === "call" ? "animate-spin" : "opacity-50",
												)}
											/>
											<span className="text-[9px] font-black uppercase tracking-[0.15em] text-primary/80">
												{inv.state === "call"
													? "Analyzing Repository"
													: `Knowledge Ingested (+${(inv as any).result?.length || 0})`}
											</span>
										</motion.div>
									))}
							</div>
									</motion.div>
								);
							});
						})()}
					</AnimatePresence>



				{/* Errors */}
				{error && (
					<div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 text-[11px] font-medium animate-in zoom-in-95 mt-4">
						<div className="flex items-center justify-between opacity-80">
							<span className="uppercase tracking-[0.2em] font-black">
								Sync Failure
							</span>
							<button
								type="button"
								onClick={() => window.location.reload()}
								className="hover:text-red-300 transition-colors"
							>
								Retry
							</button>
						</div>
						<p className="mt-2 opacity-60 leading-tight">
							{error.message || "Failed to reach AI bridge."}
						</p>
					</div>
				)}
			</div>

			{/* 3. Floating Button: Scroll to bottom (FAB Pattern) */}
			{showScrollButton && (
				<div className="absolute bottom-[88px] right-6 flex justify-end pointer-events-none z-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
					<button
						type="button"
						onClick={() => scrollToBottom()}
						data-cursor="action"
						className="pointer-events-auto w-10 h-10 rounded-full bg-background/60 dark:bg-white/5 border border-primary/20 backdrop-blur-xl text-primary hover:bg-primary/10 hover:border-primary/40 hover:shadow-glow-sm transition-all flex items-center justify-center group shadow-2xl"
					>
						<ArrowDown size={16} className="transition-transform group-hover:translate-y-0.5 animate-bounce" />
					</button>
				</div>
			)}

			{/* 4. Footer: Simplified Input */}
			{!hideInput && (
				<div className="px-6 py-4 border-t border-border/5 bg-background/20 shrink-0">
					<form 
						onSubmit={(e) => {
							e.preventDefault();
							handleManualSubmit(e);
						}} 
						className="flex items-end gap-2 relative"
					>
						<textarea
							ref={inputRef}
							id="chat-prompt-input"
							name="prompt"
							rows={1}
							value={localValue}
							onChange={onInputChange}
							onKeyDown={onKeyDown}
							placeholder="Ask Sparkle AI... (Cmd+Enter to send)"
							autoComplete="off"
							data-cursor="text"
							style={{
								pointerEvents: "auto",
								cursor: "text",
								resize: "none",
								height: "40px",
								overflow: "hidden", // Prevent phantom scrollbars
							}}
							className="flex-1 !pointer-events-auto !cursor-text bg-foreground/[0.03] dark:bg-white/5 border border-border/10 rounded-2xl px-4 py-2 text-sm leading-relaxed text-foreground focus:outline-none focus:border-primary/40 transition-all placeholder:text-muted-foreground/30 font-medium caret-primary min-h-[40px] max-h-[200px]"
						/>
						<Button
							type="submit"
							data-cursor="action"
							disabled={effectiveLoading || !(localValue || "").trim()}
							className="rounded-2xl h-11 w-11 p-0 bg-primary/10 text-primary transition-colors flex items-center justify-center shrink-0 border border-primary/20 mb-[1px] !pointer-events-auto"
						>
							<Send size={14} />
						</Button>
					</form>
				</div>
			)}
		</div>
	);
}
