"use client";

import { Button, cn } from "@repo/ui";
import { AnimatePresence, motion } from "framer-motion";
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
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
	isPurging?: boolean;
}

export const ChatPanel = React.memo(({
	initialQuery,
	context,
	chat,
	hideInput,
	showHeader = true,
	onLinkClick,
	navigatingUrl,
	isPurging = false,
}: ChatPanelProps) => {
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
		status = "ready",
		error = null,
		handleInputChange,
		// handleSubmit is inherited from SDK but we use handleManualSubmit for custom buffer synchronization
		handleSubmit: _handleSubmit,
		sendMessage,
		setInput,
		setMessages,
	} = activeChat;

	// Derive isLoading from SDK status for backwards compatibility
	// In @ai-sdk/react v5+, `isLoading` was replaced by `status` enum.
	const isLoading = status === "submitted" || status === "streaming";

	const [localValue, setLocalValue] = useState(input || "");
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [showScrollButton, setShowScrollButton] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	// Snapshot of message count at submit time, so we only check NEW messages for content arrival
	const submitMsgCountRef = useRef(0);

	// Clear isSubmitting ONLY when a NEW assistant message (after submit) has real content.
	// This eliminates the visual gap during backend processing (KV check, RAG, model warm-up)
	// where status might briefly be 'ready' before streaming begins.
	useEffect(() => {
		if (!isSubmitting) {
			return;
		}

		// Only inspect messages that arrived AFTER the user pressed send
		const newMessages = messages.slice(submitMsgCountRef.current);
		const newAssistant = newMessages.find((m: any) => m.role === 'assistant');
		const hasContent = newAssistant?.content ||
			newAssistant?.text ||
			(newAssistant?.parts as any[])?.some((p: any) => p.type === 'text' && p.text);

		if (hasContent) {
			setIsSubmitting(false);
			return;
		}

		// Safety fallback: if no content arrives within 15s, reset to avoid permanent stuck state.
		// This is generous to allow for cold starts, RAG pipelines, and slow model inference.
		const timer = setTimeout(() => {
			setIsSubmitting(false);
		}, 15000);
		return () => clearTimeout(timer);
	}, [isSubmitting, messages]);

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
		submitMsgCountRef.current = messages.length;
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
	const allCitations = useMemo(() => {
		const citations: any[] = [];
		if (!messages) { return citations; }
		
		for (const m of messages) {
			if (m.role === "assistant" && m.toolInvocations) {
				for (const inv of m.toolInvocations) {
					if (inv.toolName === "search" && inv.state === "result") {
						const results = (inv.result as any) || [];
						for (const res of results) {
							if (!citations.find((c: any) => c.content === res.content)) {
								citations.push(res);
							}
						}
					}
				}
			}
		}
		return citations;
	}, [messages]);

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

	// Augmented message stream: inject a thinking skeleton when loading
	// MUST be at component top-level (not inside JSX IIFE) to satisfy React Rules of Hooks.
	const augmentedMessages = useMemo(() => {
		const lastMsg = messages[messages.length - 1];
		
		// Only inject a skeleton if we are waiting for the VERY FIRST assistant message.
		// Once an assistant message exists (even if empty), the bubble handles its own 'Thinking' state.
		return (effectiveLoading && (!messages.length || lastMsg.role !== 'assistant'))
			? [...messages, { id: 'thinking-skeleton', role: 'assistant', content: '', _isSkeleton: true }]
			: messages;
	}, [messages, effectiveLoading]);

	// --- 3. Conditional Early Return ---
	// Now safe because all hooks have been called.
	if (!chat) {
		return null;
	}

	return (
		<div className="flex flex-col h-full w-full bg-transparent relative overflow-hidden">
			{/* 1. Header: Integrated Meta Actions & Status */}
			{showHeader && (
				<div className="group/chat-header flex min-h-[64px] items-center justify-between gap-4 border-b border-border/10 px-5 py-4 shrink-0 sm:px-6">
					<div className="flex items-center gap-3.5 min-w-0">
						<div
							className={cn(
								"relative flex h-9 w-9 items-center justify-center rounded-2xl border transition-all duration-500 shrink-0",
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
						<div className="flex min-w-0 flex-col gap-1">
							<span
								className={cn(
									"text-[10px] font-black tracking-[0.18em] uppercase leading-none transition-all",
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
							<div className="flex items-center gap-2 overflow-hidden">
								<span className="truncate text-[11px] font-medium leading-none text-muted-foreground/60 max-w-[220px]">
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
					<div className="hidden shrink-0 items-center gap-2 rounded-xl border border-border/20 bg-background/55 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/50 sm:flex">
						<span>{messages.length}</span>
						<span className="opacity-35">messages</span>
					</div>
				</div>
			)}

				{/* 2. Messages area: Clean content-first layout */}
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="flex-1 h-full overflow-y-auto px-4 py-5 space-y-9 scroll-smooth scrollbar-thin scrollbar-thumb-foreground/5 hover:scrollbar-thumb-foreground/10 scrollbar-track-transparent sm:px-6"
				>
					<AnimatePresence mode="popLayout" initial={false}>
						{messages.length === 0 && !effectiveLoading && (
							<motion.div 
								key="empty-state"
								initial={{ opacity: 0, scale: 0.98 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.95 }}
								className="flex h-full flex-col items-center justify-center py-20 text-center opacity-70"
							>
								<div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/15 bg-primary/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
									<Sparkles
										className="h-7 w-7 text-primary/45"
										strokeWidth={1.5}
									/>
								</div>
								<div className="space-y-2">
									<p className="text-xs font-black uppercase tracking-[0.22em] text-foreground/85">
										Sparkle AI Interface
									</p>
									<p className="max-w-[240px] text-[12px] font-medium leading-6 text-muted-foreground/68">
										Ask about the current article or explore general technical
										concepts.
									</p>
								</div>
							</motion.div>
						)}
						{augmentedMessages.map((m: any, i: number) => {
								const isUser = m.role === "user";
								
								// Robust text extraction: content -> text -> parts
								const textContent = m.content || 
									m.text ||
									(Array.isArray(m.parts) ? m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") : "") ||
									"";

								const itemKey = m.id || `chat-msg-${i}`;
								const isLast = i === augmentedMessages.length - 1;

								return (
									<motion.div
										key={itemKey}
										initial={{ opacity: 0, y: 4, scale: 0.995 }}
										animate={{ 
											opacity: isPurging ? 0 : 1, 
											y: isPurging ? -20 : 0,
											scale: isPurging ? 0.98 : 1,
											filter: isPurging ? "blur(4px)" : "blur(0px)"
										}}
										exit={{ 
											opacity: 0, 
											y: -10, 
											scale: 0.98,
											filter: "blur(8px)"
										}}
										transition={{ 
											duration: 0.2, 
											ease: [0.23, 1, 0.32, 1] 
										}}
										className={cn(
											"group/message relative flex w-full flex-col gap-2.5 px-4 mb-4",
											isUser ? "items-end" : "items-start",
										)}
									>
							{/* Identity Label */}
							<div
								className={cn(
									"mb-0.5 flex items-center gap-2 text-[10px] font-black tracking-[0.2em] uppercase",
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
										"min-w-0 overflow-hidden transition-all duration-500",
										isUser
											? "ml-auto w-fit max-w-[92%] rounded-[22px] border border-border/15 bg-foreground/[0.03] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-primary/20 hover:bg-foreground/[0.05] hover:shadow-glow-sm dark:bg-white/5 dark:hover:bg-white/[0.08]"
											: "w-full max-w-[min(100%,58rem)] rounded-[28px] border border-border/10 bg-background/35 px-4 py-4 backdrop-blur-[2px] sm:px-5 sm:py-5",
									)}
								>
									<div className={cn(!isUser && "max-w-none !ml-0 !mr-auto !text-left text-foreground/90")}>
										{!isUser ? (
											<div className="flex flex-col gap-2">
												<div className="relative min-h-[28px] w-full">
													{/* Thinking State */}
													<div 
														className={cn(
															"flex items-center gap-2 py-1 transition-opacity duration-200",
															(isLast && !textContent && effectiveLoading) ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"
														)}
													>
														<div className="flex gap-1">
															<div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
															<div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
															<div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
														</div>
														<span className="text-[11px] font-bold uppercase tracking-widest text-primary/50">
															Thinking...
														</span>
													</div>

													{/* Actual Content Stream */}
													<div 
														className={cn(
															"transition-opacity duration-200 w-full",
															textContent || (!effectiveLoading || !isLast) ? "opacity-100 relative" : "opacity-0 absolute inset-0 pointer-events-none"
														)}
													>
														{(textContent || (!effectiveLoading || !isLast)) && (
															<CitationRenderer
																text={textContent}
																citations={allCitations}
																onLinkClick={onLinkClick}
															/>
														)}
													</div>
												</div>

												{/* Source Footer: List all cited documents at the bottom */}
												{(() => {
													if (allCitations.length === 0) {
														return null;
													}
													return (
														<div className="mt-6 animate-in slide-in-from-bottom-2 fade-in duration-500 border-t border-border/8 pt-4">
															<div className="mb-3 flex items-center gap-2">
																<div className="flex h-4 w-4 items-center justify-center rounded-sm border border-primary/20 bg-primary/10">
																	<Link2 size={9} className="text-primary" />
																</div>
																<span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
																	Sources & References
																</span>
															</div>
															<div className="flex flex-wrap gap-2.5">
																{allCitations.map((c, idx) => {
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
																			className="group/source inline-flex items-center gap-1.5 rounded-xl border border-border/20 bg-background/65 py-1.5 pl-1.5 pr-2.5 no-underline transition-all hover:border-primary/25 hover:bg-primary/[0.045] dark:bg-white/[0.02]"
																			data-cursor="link"
																		>
																			<div className="flex items-center justify-center w-3 h-3 text-primary/40 transition-colors">
																				<Sparkles size={9} strokeWidth={2.5} />
																			</div>
																			<div className="flex items-center gap-1.5">
																				<span className="text-[9px] font-black uppercase tracking-widest text-primary/20 transition-colors shrink-0">
																					S{idx + 1}
																				</span>
																				<span className="max-w-[140px] truncate text-[11px] font-bold tracking-tight text-foreground/70 transition-colors">
																					{c.title}
																				</span>
																			</div>
																		</Link>
																	)
																})}
															</div>
														</div>
													)
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
											className="group/tool relative mt-5 inline-flex items-center gap-2.5 overflow-hidden rounded-full border border-primary/10 bg-primary/5 px-4 py-2"
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
								)
							})}
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
				<div className="pointer-events-none absolute bottom-[104px] right-5 z-20 flex justify-end animate-in slide-in-from-bottom-4 fade-in duration-500 sm:right-6">
					<button
						type="button"
						onClick={() => scrollToBottom()}
						data-cursor="action"
						className="group pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-primary/20 bg-background/75 text-primary shadow-2xl backdrop-blur-xl transition-all hover:border-primary/40 hover:bg-primary/10 hover:shadow-glow-sm dark:bg-white/5"
					>
						<ArrowDown size={16} className="transition-transform group-hover:translate-y-0.5 animate-bounce" />
					</button>
				</div>
			)}

			{/* 4. Footer: Simplified Input */}
			{!hideInput && (
				<div className="shrink-0 border-t border-border/5 bg-background/20 px-4 py-4 sm:px-6">
					<form 
						onSubmit={(e) => {
							e.preventDefault();
							handleManualSubmit(e);
						}} 
						className="relative flex items-end gap-3 rounded-[28px] border border-border/15 bg-background/65 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl"
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
							className="min-h-[44px] max-h-[200px] flex-1 !pointer-events-auto !cursor-text rounded-[20px] border border-border/10 bg-foreground/[0.03] px-4 py-2.5 text-sm font-medium leading-relaxed text-foreground caret-primary transition-all placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none dark:bg-white/5"
						/>
						<Button
							type="submit"
							data-cursor="action"
							disabled={effectiveLoading || !(localValue || "").trim()}
							className="mb-[1px] flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] border border-primary/20 bg-primary/10 p-0 text-primary transition-colors !pointer-events-auto"
						>
							<Send size={14} />
						</Button>
					</form>
				</div>
			)}
		</div>
	);
});

ChatPanel.displayName = "ChatPanel";
