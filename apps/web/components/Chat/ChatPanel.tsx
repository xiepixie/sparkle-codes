"use client";

import { useChat } from "@ai-sdk/react";
import { Button, cn } from "@repo/ui";
import { motion } from "framer-motion";
import {
	ArrowDown,
	Bot,
	FileText,
	Send,
	Sparkles,
	User,
	Search,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
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
	// RULES OF HOOKS: All hooks must be called unconditionally at the top.
	const fallbackChat = useChat({ id: "chat-panel-internal" });
	const activeChat = chat || fallbackChat;

	const {
		input,
		handleInputChange,
		handleSubmit,
		isLoading,
		error,
		sendMessage,
		setInput,
		setMessages,
		messages,
	} = activeChat as any;

	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [localValue, setLocalValue] = useState(input || "");
	const lastSubmitRef = useRef<number>(0);

	// Sync local value when external input changes (e.g. from RAG or Reset)
	// Why: We only sync when NOT focused to avoid overwriting the user's active keystrokes
	// before the parent state (useChat) reflects the latest change.
	useEffect(() => {
		if (document.activeElement !== inputRef.current) {
			setLocalValue(input || "");
		}
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
		if (!finalInput || isLoading || (now - lastSubmitRef.current < 1000)) {
			return;
		}

		lastSubmitRef.current = now;

		const {
			append,
		} = activeChat as any;

		// 2. Sync the value back to the underlying SDK input state
		if (typeof setInput === "function") {
			setInput(finalInput);
		}

		// 3. Clear local UI buffer immediately for snappy feel
		setLocalValue("");
		if (inputRef.current) {
			inputRef.current.style.height = "40px";
		}

		// 4. Use standard handleSubmit if available
		if (typeof handleSubmit === "function") {
			handleSubmit(e as any);
		} 
		else if (typeof append === "function") {
			append({ role: "user", content: finalInput });
		}
		else if (typeof sendMessage === "function") {
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

	// Snappy UX: Force focus when the panel is mounted (Expanded)
	useEffect(() => {
		if (!hideInput) {
			const timer = setTimeout(() => {
				inputRef.current?.focus();
			}, 300); // Allow window animation to finish
			return () => clearTimeout(timer);
		}
	}, [hideInput]);

	const scrollRef = useRef<HTMLDivElement>(null);
	const initialized = useRef(false);
	const [isAtBottom, setIsAtBottom] = React.useState(true);
	const [showScrollButton, setShowScrollButton] = React.useState(false);

	useEffect(() => {
		if (
			initialQuery &&
			!initialized.current &&
			typeof sendMessage === "function"
		) {
			initialized.current = true;
			sendMessage({ text: initialQuery });
		}
	}, [initialQuery, sendMessage]);

	const handleScroll = () => {
		if (!scrollRef.current) {
			return;
		}
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
		const isBottom = scrollHeight - scrollTop - clientHeight < 50;
		setIsAtBottom(isBottom);
		setShowScrollButton(!isBottom);
	};

	const scrollToBottom = () => {
		if (scrollRef.current) {
			scrollRef.current.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	};

	useEffect(() => {
		if (isAtBottom && scrollRef.current) {
			scrollRef.current.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [messages, isAtBottom]);

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

	// Persistence: Save to local storage on message update - with a slight delay to avoid excessive writes
	useEffect(() => {
		if (!messages || messages.length === 0) {
			return;
		}
		
		const timer = setTimeout(() => {
			localStorage.setItem("sparkle_chat_history", JSON.stringify(messages));
		}, 500);
		
		return () => clearTimeout(timer);
	}, [messages]);

	// 2. Load from local storage on mount - ENSURE IT ONLY RUNS ONCE
	const historyLoaded = useRef(false);
	useEffect(() => {
		if (historyLoaded.current) {
			return;
		}
		
		const saved = localStorage.getItem("sparkle_chat_history");
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				// Only load if we are currently empty or if history is significantly larger
				if (messages.length <= 1) {
					setMessages(parsed);
					if (typeof activeChat.setMessages === "function") {
						activeChat.setMessages(parsed);
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
	}, [setMessages, messages.length, activeChat]);

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
									: isLoading
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
										: isLoading
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
									: isLoading
										? "Thinking..."
										: context
											? "Knowledge Assistant"
											: "Sparkle AI Interface"}
							</span>
							<div className="flex items-center gap-1.5 overflow-hidden">
								<span className="text-[9px] font-bold text-muted-foreground/30 tracking-wider leading-none truncate max-w-[180px]">
									{navigatingUrl
										? `Entering: ${navigatingUrl.split("/").pop()?.split("#")[0] || "Target"}`
										: isLoading
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
				{messages.length === 0 && !isLoading && (
					<div className="h-full flex flex-col items-center justify-center text-center opacity-60 animate-in fade-in zoom-in-95 duration-1000">
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
					</div>
				)}

				{messages?.map((m: any, i: number) => {
					const isUser = m.role === "user";
					// Robust text extraction: content -> text -> parts
					const textContent = m.content || 
						m.text ||
						(m.parts as any[])?.filter(p => p.type === "text").map(p => p.text).join("") ||
						"";

					// Ensure we always render something for an assistant message to show it's "listening"
					// We only skip if it's truly a zombie message (no role)
					if (!m.role) {
						return null;
					}

					return (
						<div
							key={m.id}
							className={cn(
								"group/message relative flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-700 pr-2",
								isUser ? "items-end" : "items-start",
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
											className={cn(
												isLoading &&
													i === messages.length - 1 &&
													"animate-pulse",
											)}
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
									<div className={cn(!isUser && "prose dark:prose-invert max-w-none text-foreground/90")}>
										{!isUser ? (
											<div className="flex flex-col gap-2">
												<CitationRenderer
													text={textContent}
													citations={getCitationsForMessage()}
													onLinkClick={onLinkClick}
												/>
												{/* Enhanced Loading State: Show if content is truly empty for assistant */}
												{!textContent && !m.toolCalls && (
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
										>
											<div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full group-hover/tool:animate-shimmer" />
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
						</div>
					);
				})}

				{/* Loading Skeleton Message */}
				{isLoading && messages[messages.length - 1]?.role !== "assistant" && (
					<div className="flex gap-4 animate-in fade-in slide-in-from-bottom-3">
						<div className="w-8 h-8 rounded-full flex items-center justify-center border mt-0.5 bg-primary/10 border-primary/20 text-primary">
							<Sparkles size={14} className="animate-pulse" />
						</div>
						<div className="flex items-center gap-2 h-8">
							<div className="w-1 h-1 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
							<div className="w-1 h-1 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
							<div className="w-1 h-1 rounded-full bg-primary/40 animate-bounce" />
						</div>
					</div>
				)}

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
						onClick={scrollToBottom}
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
							disabled={isLoading || !(localValue || "").trim()}
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
