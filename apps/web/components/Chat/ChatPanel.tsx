"use client";

import { useChat } from "@ai-sdk/react";
import { motion } from "framer-motion";
import { ArrowDown, Bot, Clock, FileText, Search, Send, Sparkles, User } from "lucide-react";
import React, { useEffect, useRef } from "react";
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
}

export function ChatPanel({ initialQuery, context, chat: externalChat, hideInput }: ChatPanelProps) {
  const internalChat = useChat();
  const chat = externalChat || internalChat;
  
  const { 
    messages, 
    input, 
    handleInputChange, 
    handleSubmit, 
    isLoading, 
    error, 
    sendMessage,
    setInput,
    setMessages
  } = chat as any;

  // Safe handler that ensures we can ALWAYS type
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (typeof handleInputChange === 'function') {
      handleInputChange(e);
    } else if (typeof setInput === 'function') {
      setInput(e.target.value);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  useEffect(() => {
    if (initialQuery && !initialized.current && typeof sendMessage === 'function') {
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
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  // Extract citations from tool call results in the message history
  const getCitationsForMessage = () => {
    const citations: any[] = [];
    messages?.forEach((m: any) => {
      if (m.role === 'assistant' && m.toolInvocations) {
        m.toolInvocations.forEach((inv: any) => {
          if (inv.toolName === 'search' && inv.state === 'result') {
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

  return (
    <div className="flex flex-col h-full w-full bg-transparent relative overflow-hidden">
      {/* 1. Header: Integrated Meta Actions & Status */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border/10 shrink-0 min-h-[56px] group/chat-header">
        <div className="flex items-center gap-3">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/5 border border-primary/10 shadow-glow-sm">
            {context ? (
              <FileText size={13} className="text-primary animate-pulse" />
            ) : (
              <Bot size={13} className="text-primary" />
            )}
            <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary border-2 border-background" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-black tracking-[0.15em] uppercase text-foreground/85 leading-none">
              {context ? "Knowledge Assistant" : "Direct Response"}
            </span>
            <span className="text-[9px] font-bold text-muted-foreground/30 tracking-wider leading-none">
              {context ? `Focusing: ${context.title.substring(0, 32)}${context.title.length > 32 ? "..." : ""}` : "DeepSeek V3 / RAG Active"}
            </span>
          </div>
        </div>

        {messages.length > 0 && typeof setMessages === 'function' && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Reset this conversation thread? All local context will be cleared.")) {
                setMessages([]);
                localStorage.removeItem('sparkle_chat_history');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/10 hover:border-red-500/20 hover:bg-red-500/5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/20 hover:text-red-500 transition-all opacity-0 group-hover/chat-header:opacity-100"
          >
            <Clock size={10} />
            Reset Thread
          </button>
        )}
      </div>

      {/* 2. Messages area: Clean content-first layout */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-10 scroll-smooth scrollbar-none"
      >
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60 animate-in fade-in zoom-in-95 duration-1000">
            <Sparkles className="w-8 h-8 text-primary/40 mb-4" strokeWidth={1.5} />
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-foreground/80">Sparkle AI Interface</p>
              <p className="text-[11px] text-muted-foreground/60 max-w-[200px] leading-relaxed font-medium">
                Ask about the current article or explore general technical concepts.
              </p>
            </div>
          </div>
        )}

        {messages?.map((m: any, i: number) => {
          const isUser = m.role === "user";
          const textContent = m.parts
            ? m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
            : (m.content || '');

          return (
            <div 
              key={m.id} 
              className={cn(
                "group/message relative flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-700",
                isUser ? "items-end" : "items-start"
              )}
            >
               {/* Identity Label */}
              <div className={cn(
                "flex items-center gap-2 text-[10px] font-black tracking-[0.2em] uppercase mb-0.5",
                isUser ? "flex-row-reverse text-muted-foreground/30" : "text-primary/60"
              )}>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border transition-all duration-500",
                  isUser 
                    ? "bg-muted/50 border-border/10 group-hover/message:border-primary/20" 
                    : "bg-primary/5 border-primary/20 shadow-glow-sm"
                )}>
                  {isUser ? <User size={10} /> : <Sparkles size={10} className={cn(isLoading && i === messages.length - 1 && "animate-pulse")} />}
                </div>
                <span>{isUser ? "You" : "Sparkle AI"}</span>
              </div>

              {/* Content Bubble */}
              <div className={cn(
                "max-w-[92%] md:max-w-[85%] rounded-2xl transition-all duration-500",
                isUser 
                  ? "bg-foreground/[0.03] dark:bg-white/5 border border-border/10 px-5 py-3.5 hover:bg-foreground/[0.05] dark:hover:bg-white/[0.08] hover:border-primary/20 hover:shadow-glow-sm" 
                  : "w-full bg-transparent p-0"
              )}>
                <div className={cn(!isUser && "prose-clean")}>
                  {!isUser ? (
                    <CitationRenderer 
                      text={textContent} 
                      citations={getCitationsForMessage()} 
                    />
                  ) : (
                    <span className="text-sm leading-relaxed text-foreground/90 font-medium whitespace-pre-wrap">{textContent}</span>
                  )}
                </div>

                {/* Tool Invocations for Assistant */}
                {!isUser && m.toolInvocations?.map((inv: any) => (
                  <motion.div 
                    key={inv.toolCallId}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-6 inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 group/tool overflow-hidden relative"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full group-hover/tool:animate-shimmer" />
                    <Search size={11} className={cn("text-primary transition-all", inv.state === 'call' ? "animate-spin" : "opacity-50")} />
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-primary/80">
                      {inv.state === 'call' ? "Analyzing Repository" : `Knowledge Ingested (+${(inv as any).result?.length || 0})`}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Loading Skeleton Message */}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
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
                <span className="uppercase tracking-[0.2em] font-black">Sync Failure</span>
                <button type="button" onClick={() => window.location.reload()} className="hover:text-red-300 transition-colors">Retry</button>
            </div>
            <p className="mt-2 opacity-60 leading-tight">{error.message || "Failed to reach AI bridge."}</p>
          </div>
        )}
      </div>
      
      {/* 3. Floating Button: Scroll to bottom (FAB Pattern) */}
      {showScrollButton && (
        <div className="absolute bottom-[88px] right-6 flex justify-end pointer-events-none z-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <button 
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto px-4 py-2 rounded-full bg-background/60 dark:bg-white/5 border border-primary/20 backdrop-blur-xl text-primary text-[10px] font-black uppercase tracking-[0.15em] hover:bg-primary/10 hover:border-primary/40 hover:shadow-glow-sm transition-all flex items-center gap-2 group shadow-2xl"
          >
            <span>New Content</span>
            <ArrowDown className="w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5" />
          </button>
        </div>
      )}

      {/* 4. Footer: Simplified Input */}
      {!hideInput && (
        <div className="px-6 py-4 border-t border-border/5 bg-background/20 shrink-0">
          <form onSubmit={handleSubmit} className="flex gap-2 relative">
            <input
              value={input || ""}
              onChange={onInputChange}
              placeholder="Ask Sparkle AI..."
              className="flex-1 bg-foreground/[0.03] dark:bg-white/5 border border-border/10 rounded-2xl px-5 py-2.5 text-sm focus:outline-none focus:border-primary/40 transition-all placeholder:text-muted-foreground/30 font-medium"
            />
            <Button 
              type="submit" 
              disabled={isLoading || !(input || "").trim()}
              className="rounded-2xl h-10 w-10 p-0 bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all active:scale-90 flex items-center justify-center shrink-0 border border-primary/20"
            >
              <Send size={14} />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
