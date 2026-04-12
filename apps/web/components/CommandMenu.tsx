"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Clock,
  Compass,
  FileText,
  Hash,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "@repo/ui";
import { normalizeSlug } from "@repo/utils";
import {
  CommandEmptyState,
  CommandSurface,
  CommandSurfaceBody,
  CommandSurfaceFooter,
  CommandSurfaceHeader,
} from "@/components/CommandSurface";
import {
  COMMAND_CENTER_EVENT,
  scrollToReadingSection,
  type CommandCenterMode,
  type CommandCenterReadingContext,
  type CommandJumpSubMode,
} from "@/lib/command-center";
import { readFilteredHistory } from "@/lib/reading-history";
import { ChatPanel } from "./Chat/ChatPanel";
import { AccessibleMarkdownSnippet as SearchMatch } from "./markdown-snippet";

type CommandMode = CommandCenterMode;

interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  bodyPreview?: string;
  url: string;
  section?: string;
  context?: string;
  highlightedTitle?: string;
  highlightedDescription?: string;
  highlightedBodyPreview?: string;
  highlightedContext?: string;
}

// SearchMatch is now imported as AccessibleMarkdownSnippet

function normalizeSearchResults(data: unknown): SearchResultItem[] {
  if (!Array.isArray(data)) {
    return [];
  }

  // Pre-filter and map in one pass for performance
  return data.reduce<SearchResultItem[]>((acc, item, index) => {
    if (!item || typeof item !== "object") { return acc; }

    const candidate = item as Record<string, unknown>;
    const title = typeof candidate.title === "string" ? candidate.title : typeof candidate.name === "string" ? candidate.name : null;
    const url = typeof candidate.url === "string" ? candidate.url : typeof candidate.href === "string" ? candidate.href : null;
    
    if (!title || !url) { return acc; }

    acc.push({
      id: typeof candidate.id === "string" ? candidate.id : `${url}-${index}`,
      title,
      description: String(candidate.description || candidate.content || candidate.excerpt || ""),
      bodyPreview: candidate.bodyPreview as string | undefined,
      url,
      section: candidate.section as string | undefined,
      context: candidate.context as string | undefined,
      highlightedTitle: candidate.highlightedTitle as string | undefined,
      highlightedDescription: candidate.highlightedDescription as string | undefined,
      highlightedBodyPreview: candidate.highlightedBodyPreview as string | undefined,
      highlightedContext: candidate.highlightedContext as string | undefined,
    });
    return acc;
  }, []);
}

// Module-level singleton to prevent re-instantiation on re-renders.
// useChat would reset state if transport identity changes.
const chatTransport = new TextStreamChatTransport({ api: '/api/chat' });

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CommandMode>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [readingContext, setReadingContext] = useState<CommandCenterReadingContext | null>(null);
  const [jumpSubMode, setJumpSubMode] = useState<CommandJumpSubMode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isNavigating, startNavTransition] = useTransition();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const chat = useChat({ 
    id: "command-menu-chat",
    transport: chatTransport,
  });
  const { 
    handleInputChange: handleChatInputChange, 
    setInput: setChatInput,
    messages,
    setMessages
  } = chat as any;

  // Persist History - Load
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sparkle_chat_history');
      if (saved && typeof setMessages === 'function') {
        const parsed = JSON.parse(saved);
        // Only load if empty to prevent overwriting active session immediately
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Wrap in a tiny timeout to ensure the hook is fully mounted 
          setTimeout(() => setMessages(parsed), 10);
        }
      }
    } catch (e) {
      console.error("Failed to load chat history", e);
    }
  }, [setMessages]);

  // Persist History - Save
  useEffect(() => {
    if (messages && messages.length > 0) {
      localStorage.setItem('sparkle_chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  // Snappy UX: Optimized input handler with mode detection
  const onCommandInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    
    // Total Synchronicity: searchQuery is the master state for visual input.
    // We sync it down to other subsystems (Chat SDK, Navigation, Search)
    setSearchQuery(val);
    
    if (typeof setChatInput === 'function') {
      setChatInput(val);
    } else if (typeof handleChatInputChange === 'function') {
      handleChatInputChange(e);
    }
  };

  // Sync mode changes to ensure the input field is never empty if there's an existing query
  useEffect(() => {
    if (open) {
      // Ensure Chat SDK knows about the current query when we switch to ASK mode
      if (mode === "ask" && searchQuery && typeof setChatInput === 'function') {
        setChatInput(searchQuery);
      }
    }
  }, [mode, open, searchQuery, setChatInput]);

  // "油画" UX: Synchronization for Navigation arrival.
  // We close the menu as soon as the pathname changes to match our destination
  // OR as soon as React's concurrent transition commits (isNavigating -> false).
  useEffect(() => {
    if (!pendingUrl) {
      return;
    }

    const current = normalizeSlug(pathname);
    const target = normalizeSlug(pendingUrl);
    
    // Arrival check: URL matches destination
    // Comparison is now robust against encoding and normalization differences
    const hasArrived = current === target;
    
    // Snappy Cleanup: Close immediately if we arrived OR the transition finished
    if (hasArrived || (!isNavigating && pendingUrl)) {
      setOpen(false);
      setPendingUrl(null);
    }
  }, [pathname, pendingUrl, isNavigating]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const availableModes: CommandMode[] = readingContext ? ["search", "jump", "ask"] : ["search", "ask"];

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      
      if (open && e.key === "Tab") {
        e.preventDefault();
        setMode((current) => {
          const currentIndex = availableModes.indexOf(current);
          return availableModes[(currentIndex + 1) % availableModes.length];
        });
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, readingContext]);

  useEffect(() => {
    const handleCommandCenterOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{
        mode?: CommandMode;
        reading?: CommandCenterReadingContext | null;
        jumpTo?: CommandJumpSubMode;
      }>;

      if (customEvent.detail?.reading !== undefined) {
        setReadingContext(customEvent.detail.reading ?? null);
      }

      if (customEvent.detail?.jumpTo) {
        setJumpSubMode(customEvent.detail.jumpTo);
      } else {
        setJumpSubMode(null);
      }

      if (customEvent.detail?.mode) {
        setMode(customEvent.detail.mode);
      } else if (customEvent.detail?.reading) {
        setMode("jump");
      }

      setOpen(true);
    };

    window.addEventListener(COMMAND_CENTER_EVENT, handleCommandCenterOpen as EventListener);

    // MUTE THE COLD START
    // Send a discrete warmup request on mount. 
    // The component mounts when the layout renders (app boundary), 
    // so this wakes the API up immediately in the background 
    // eliminating Next.js API cold boots completely.
    if (typeof window !== "undefined") {
      fetch("/api/search?query=warmup", { priority: "low" }).catch(() => {});
    }

    return () => window.removeEventListener(COMMAND_CENTER_EVENT, handleCommandCenterOpen as EventListener);
  }, []);

  // A11Y & Performance: Defer focus to allow animation to settle
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode !== "jump" || !readingContext) {
      // No cleanup needed here as searchQuery is shared.
    }
  }, [mode, open, readingContext]);

  useEffect(() => {
    if (mode !== "search") {
      return;
    }

    const query = (deferredSearchQuery || "").trim();
    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });

        const data = await response.json();
        const results = normalizeSearchResults(data);

        // Exclusion Guard: Prevent current page from showing up in search results.
        // This ensures the user doesn't end up exploring what they are already reading.
        const currentPathKey = normalizeSlug(pathname);
        const appContextKey = readingContext?.slug ? normalizeSlug(readingContext.slug) : null;

        setSearchResults(results.filter(item => {
          const itemKey = normalizeSlug(item.url);
          return itemKey !== currentPathKey && itemKey !== appContextKey;
        }));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSearchResults([]);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [deferredSearchQuery, mode, pathname, readingContext]);

  const handleSearchSuggestion = (text: string) => {
    setSearchQuery(text);
    setMode("search");
    inputRef.current?.focus();
  };

  const filteredReadingSections = useMemo(() => {
    const sections = readingContext?.sections ?? [];
    const query = (searchQuery || "").trim().toLowerCase();

    if (!query) {
      return sections;
    }
    return sections.filter((section) => section.title.toLowerCase().includes(query));
  }, [searchQuery, readingContext]);

  const filteredRecentReading = useMemo(() => {
    // 1. Source: Always fetch fresh from local storage for consistency, 
    // ensuring exclusion works even if the parent context is slightly behind.
    const source = readFilteredHistory(pathname);
    
    // Explicitly determine current page slug from various possible sources
    // to ensure exclusion works even if one context is slightly delayed.
    const currentPathKey = normalizeSlug(pathname);
    const appContextKey = normalizeSlug(readingContext?.slug);
    
    const query = (searchQuery || "").trim().toLowerCase();
    
    // Final defensive deduplication buffer
    const seenSlugs = new Set<string>();
    
    return source.filter((entry) => {
      const entryKey = normalizeSlug(entry.slug);
      
      // Strict exclusion: current article should NEVER appear in history list
      // We check against BOTH pathname and the provided reading context to be absolutely safe
      // even if one of them is slightly behind or processed differently.
      if (entryKey === currentPathKey || (appContextKey && entryKey === appContextKey)) {
        return false;
      }
      
      // Deduplicate results
      if (!entryKey || seenSlugs.has(entryKey)) {
        return false;
      }
      seenSlugs.add(entryKey);
      
      // Filter by search query if user is typing (Jump mode query)
      if (!query) {
        return true;
      }
      return entry.title.toLowerCase().normalize("NFC").includes(query);
    }).slice(0, mode === "search" ? 8 : 5);
  }, [searchQuery, readingContext, pathname, mode]);

  const navigateToBlogPost = (url: string) => {
    if (pendingUrl) { return; } 
    
    const target = normalizeSlug(url);
    const current = normalizeSlug(pathname);

    // Snappy UX: If target is current page, just hide menu immediately
    if (target === current) {
      setOpen(false);
      return;
    }

    setPendingUrl(url);
    startNavTransition(() => {
      router.push(url);
    });
  };

  return (
    <CommandSurface
      open={open}
      onOpenChange={setOpen}
      title="Blog Command Center"
      description="Search blog posts or jump within the current article."
      className="max-w-2xl"
    >
        <div>
        <CommandSurfaceHeader className="group">
          <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <AnimatePresence mode="wait">
              {mode === "jump" ? (
                <motion.div
                  key="jump-icon"
                  initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.8, rotate: 20 }}
                >
                  <Compass className="h-5 w-5 text-primary" />
                </motion.div>
              ) : mode === "ask" ? (
                <motion.div
                  key="ask-icon"
                  initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                >
                  <Sparkles className="h-5 w-5 text-primary drop-shadow-[0_0_8px_var(--primary)]" />
                </motion.div>
              ) : (
                <motion.div
                  key="search-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Search className={cn("h-5 w-5 text-muted-foreground/50 transition-colors group-focus-within:text-primary", searchLoading && "opacity-0")} />
                </motion.div>
              )}
            </AnimatePresence>
            {searchLoading && mode === "search" && (
                <Loader2 className="absolute h-5 w-5 text-primary animate-spin" />
            )}
          </div>
          
          <div className="relative flex flex-1 items-center gap-2 pr-10">
            <input
              ref={inputRef}
              className="w-full bg-transparent text-xl outline-none placeholder:text-muted-foreground/20 font-light tracking-tight"
              style={{ 
                  WebkitUserModify: 'read-write-plaintext-only', 
                  pointerEvents: 'auto',
                  cursor: 'text'
              }}
              placeholder={
                mode === "jump"
                  ? "Navigate article..."
                  : mode === "ask"
                  ? "Consult Sparkle AI..."
                  : "Search blog knowledge..."
              }
              value={searchQuery}
              onChange={onCommandInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mode === 'ask') {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  const query = searchQuery.trim();
                  if (query) {
                    const sendFn = (chat as any).sendMessage;
                    if (typeof sendFn === 'function') {
                      sendFn({ text: query });
                      setSearchQuery("");
                    }
                  }
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  if (typeof setChatInput === 'function') {
                    setChatInput("");
                  }
                  inputRef.current?.focus();
                }}
                className="absolute right-0 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-all opacity-0 group-focus-within:opacity-100"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          <div className="flex h-full shrink-0 items-center justify-center gap-3">
            {mode === "ask" && searchQuery.trim() && (
              <motion.button
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const query = searchQuery.trim();
                  const sendFn = (chat as any).sendMessage;
                  if (typeof sendFn === 'function') {
                    sendFn({ text: query });
                    setSearchQuery("");
                  }
                }}
                className="flex items-center justify-center p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-glow-sm"
                title="Send to Sparkle AI"
              >
                <Sparkles size={16} />
              </motion.button>
            )}
            <div className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest transition-all duration-500",
              mode === "jump" 
                ? "border-primary/20 bg-primary/5 text-primary" 
                : mode === "ask"
                ? "border-primary/40 bg-primary/20 text-primary shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)] animate-pulse"
                : "border-muted-foreground/10 bg-muted/20 text-muted-foreground/60"
            )}>
              {mode === "jump" ? "JUMP" : mode === "ask" ? "ASK" : "SEARCH"}
            </div>
          </div>
          
          {/* Snappy Animated Search Loader */}
          <div className={cn(
              "absolute bottom-0 left-0 right-0 h-[1px] transition-opacity duration-500",
              searchLoading && mode === "search" ? "opacity-100" : "opacity-0"
          )}>
            <div className="h-full w-full animate-search-loader bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          </div>
        </CommandSurfaceHeader>

        <CommandSurfaceBody className={cn(
          "relative overflow-hidden transition-[height,max-height,min-height] duration-500 ease-in-out",
          mode === "ask" 
            ? "h-[70vh] min-h-[480px] max-h-[850px] md:h-[600px]" 
            : "h-[50vh] min-h-[400px] max-h-[500px] overflow-y-auto"
        )}>
          <div className={cn(
            "h-full w-full",
            mode !== "ask" && "px-6 py-4 space-y-4"
          )}>
          {mode === "search" && (deferredSearchQuery || "").trim() ? (
            searchResults.length > 0 ? (
              <div className="space-y-2 pb-4">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    disabled={!!pendingUrl}
                    onClick={() => navigateToBlogPost(result.url)}
                    className={cn(
                      "block w-full rounded-2xl border border-border/40 bg-muted/15 p-4 text-left transition-[background-color,border-color,transform,opacity]",
                      "hover:border-primary/30 hover:bg-primary/[0.06] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5",
                      pendingUrl === result.url ? "scale-[0.98] border-primary ring-1 ring-primary/20 bg-primary/[0.08]" : (pendingUrl ? "opacity-40 grayscale-[0.5] blur-[0.5px]" : "active:scale-[0.99]")
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      {/* 1. Filename (Slug) - The primary identifier, most prominent */}
                      <SearchMatch 
                        className={cn(
                          "block text-[15px] font-black tracking-tight text-foreground transition-colors group-hover:text-primary leading-tight",
                          pendingUrl === result.url && "text-primary"
                        )}
                        text={result.highlightedContext}
                        fallback={result.context || ""}
                        query={searchQuery}
                      />

                      {/* 2. Page Title / Section Heading - Highly visible but distinct from filename */}
                      {(result.title !== result.context) && (
                        <div className="flex items-center gap-2 text-foreground/85">
                          <SearchMatch 
                            className="text-[13px] font-bold tracking-tight"
                            text={result.highlightedTitle}
                            fallback={result.title}
                            query={searchQuery}
                          />
                        </div>
                      )}

                      {/* 3. Content Preview (Grey) - Muted context */}
                      {result.description ? (
                        <SearchMatch 
                          className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-muted-foreground/50 font-sans font-normal"
                          text={result.highlightedDescription}
                          fallback={result.description}
                          query={searchQuery}
                        />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <CommandEmptyState
                  icon={<Search className="h-10 w-10 text-muted-foreground" />}
                  title="No matching blog posts yet"
                  description="Try a broader keyword, a slug fragment, or a concept from the article body."
                />
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof setChatInput === 'function') {
                        setChatInput(searchQuery);
                      }
                      setMode("ask");
                    }}
                    className="group flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary transition-all hover:bg-primary/10 hover:border-primary/40 active:scale-95 shadow-glow-sm"
                  >
                    <Sparkles size={14} className="animate-pulse" />
                    <span>Try asking Sparkle AI assistant instead</span>
                  </button>
                </div>
              </div>
            )
          ) : mode === "jump" ? (
            readingContext ? (
              <>
                {jumpSubMode === "history" ? (
                  <div className="space-y-6">
                    {filteredRecentReading.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/70 dark:text-muted-foreground/50">
                          Recent Reading
                        </div>
                        <div className="space-y-2">
                          {filteredRecentReading.map((entry) => {
                            const targetUrl = entry.sectionSlug
                              ? `/blog/${entry.slug}#${entry.sectionSlug}`
                              : `/blog/${entry.slug}`;

                            return (
                              <button
                                key={entry.slug}
                                type="button"
                                disabled={!!pendingUrl}
                                onClick={() => navigateToBlogPost(targetUrl)}
                                className={cn(
                                  "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-[background-color,border-color,transform,opacity]",
                                  "hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5",
                                  pendingUrl === targetUrl
                                    ? "scale-[0.98] border-primary/40 bg-primary/10"
                                    : pendingUrl
                                      ? "opacity-40 grayscale-[0.5] blur-[0.5px]"
                                      : "active:scale-[0.99]",
                                )}
                              >
                                {pendingUrl === targetUrl ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : (
                                  <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span
                                    className={cn(
                                      "truncate text-sm font-medium transition-colors",
                                      pendingUrl === targetUrl
                                        ? "text-primary font-semibold"
                                        : "text-foreground/85 group-hover:text-foreground",
                                    )}
                                  >
                                    {pendingUrl === targetUrl ? "Entering post..." : entry.title}
                                  </span>
                                  {entry.sectionTitle && (
                                    <span className="truncate text-[11px] text-muted-foreground/60 flex items-center gap-1.5 overflow-hidden">
                                      <Hash className="h-2.5 w-2.5 shrink-0" />
                                      {entry.sectionTitle}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {filteredReadingSections.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/70 dark:text-muted-foreground/50">
                          Sections
                        </div>
                        <div className="space-y-2">
                          {filteredReadingSections.map((section) => (
                            <button
                              key={section.id}
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                scrollToReadingSection(section.id);
                              }}
                              className="group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-[background-color,border-color,transform,opacity] hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5"
                            >
                              <span className="font-mono text-[11px] font-bold text-primary/80 transition-transform group-hover:scale-125 dark:text-primary/70">
                                {"#".repeat(Math.max(1, section.level))}
                              </span>
                              <SearchMatch
                                className="min-w-0 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground"
                                text={section.renderedTitle}
                                fallback={section.title}
                                query={searchQuery}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Default order: Sections first */}
                    {filteredReadingSections.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/70 dark:text-muted-foreground/50">
                          Sections
                        </div>
                        <div className="space-y-2">
                          {filteredReadingSections.map((section) => (
                            <button
                              key={section.id}
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                scrollToReadingSection(section.id);
                              }}
                              className="group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-[background-color,border-color,transform,opacity] hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5"
                            >
                              <span className="font-mono text-[11px] font-bold text-primary/80 transition-transform group-hover:scale-125 dark:text-primary/70">
                                {"#".repeat(Math.max(1, section.level))}
                              </span>
                              <SearchMatch
                                className="min-w-0 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground"
                                text={section.renderedTitle}
                                fallback={section.title}
                                query={searchQuery}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredRecentReading.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/70 dark:text-muted-foreground/50">
                          Recent Reading
                        </div>
                        <div className="space-y-2">
                          {filteredRecentReading.map((entry) => {
                            const targetUrl = entry.sectionSlug
                              ? `/blog/${entry.slug}#${entry.sectionSlug}`
                              : `/blog/${entry.slug}`;

                            return (
                              <button
                                key={entry.slug}
                                type="button"
                                disabled={!!pendingUrl}
                                onClick={() => navigateToBlogPost(targetUrl)}
                                className={cn(
                                  "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-[background-color,border-color,transform,opacity]",
                                  "hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5",
                                  pendingUrl === targetUrl
                                    ? "scale-[0.98] border-primary/40 bg-primary/10"
                                    : pendingUrl
                                      ? "opacity-40 grayscale-[0.5] blur-[0.5px]"
                                      : "active:scale-[0.99]",
                                )}
                              >
                                {pendingUrl === targetUrl ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : (
                                  <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span
                                    className={cn(
                                      "truncate text-sm font-medium transition-colors",
                                      pendingUrl === targetUrl
                                        ? "text-primary font-semibold"
                                        : "text-foreground/85 group-hover:text-foreground",
                                    )}
                                  >
                                    {pendingUrl === targetUrl ? "Entering post..." : entry.title}
                                  </span>
                                  {entry.sectionTitle && (
                                    <span className="truncate text-[11px] text-muted-foreground/60 flex items-center gap-1.5 overflow-hidden">
                                      <Hash className="h-2.5 w-2.5 shrink-0" />
                                      {entry.sectionTitle}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {filteredReadingSections.length === 0 && filteredRecentReading.length === 0 ? (
                  <CommandEmptyState
                    icon={<Compass className="h-10 w-10 text-muted-foreground" />}
                    title="Nothing matches that jump query"
                    description="Try a section keyword, a heading fragment, or another recent article title."
                  />
                ) : null}
              </>
            ) : (
              <CommandEmptyState
                icon={<Compass className="h-10 w-10 text-muted-foreground" />}
                title="Reading jump is unavailable here"
                description="Open this mode from an article page to jump across sections or switch between recent posts."
              />
            )
          ) : mode === "ask" ? (
              <ChatPanel 
                chat={chat}
                context={readingContext ? { title: readingContext.title, slug: readingContext.slug } : undefined}
                hideInput={true}
              />
          ) : mode === "search" ? (
            <div className="space-y-6 pb-4">
              {filteredRecentReading.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/70 dark:text-muted-foreground/50">
                    Recent Reading
                  </div>
                  <div className="space-y-2">
                    {filteredRecentReading.map((entry) => {
                      const targetUrl = entry.sectionSlug 
                        ? `/blog/${entry.slug}#${entry.sectionSlug}` 
                        : `/blog/${entry.slug}`;
                      
                      return (
                        <button
                          key={entry.slug}
                          type="button"
                          disabled={!!pendingUrl}
                          onClick={() => navigateToBlogPost(targetUrl)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-[background-color,border-color,transform,opacity]",
                            "hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5",
                            pendingUrl === targetUrl ? "scale-[0.98] border-primary/40 bg-primary/10" : (pendingUrl ? "opacity-40 grayscale-[0.5] blur-[0.5px]" : "active:scale-[0.99]")
                          )}
                        >
                          {pendingUrl === targetUrl ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          ) : (
                            <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className={cn(
                              "truncate text-sm font-medium transition-colors",
                              pendingUrl === targetUrl ? "text-primary font-semibold" : "text-foreground/85 group-hover:text-foreground"
                            )}>
                              {pendingUrl === targetUrl ? "Entering post..." : entry.title}
                            </span>
                            {entry.sectionTitle && (
                              <span className="truncate text-[11px] text-muted-foreground/60 flex items-center gap-1.5 overflow-hidden">
                                <Hash className="h-2.5 w-2.5 shrink-0" />
                                {entry.sectionTitle}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filteredRecentReading.length === 0 ? (
                <CommandEmptyState
                  icon={<Clock className="h-10 w-10 text-primary/40" />}
                  title="Begin your search"
                  description="Use the same blog search logic here as on the blog index."
                  actions={
                    <div className="flex max-w-md flex-wrap justify-center gap-2">
                      {["pytest", "AI", "playwright", "RAG"].map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleSearchSuggestion(suggestion)}
                          className="rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  }
                />
              ) : (
                <div className="mt-8 flex flex-col items-center gap-3 border-t border-border/10 pt-6 opacity-60">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Try searching for</span>
                  <div className="flex max-w-md flex-wrap justify-center gap-2">
                    {["性能", "MDX", "项目", "测试"].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleSearchSuggestion(suggestion)}
                        className="rounded-full border border-border/40 bg-muted/20 px-3 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
          </div>
        </CommandSurfaceBody>
        
        <CommandSurfaceFooter className="justify-center border-t-0 bg-transparent py-3">
          <div className="flex p-1.5 rounded-full bg-muted/20 border border-border/10 backdrop-blur-md relative overflow-hidden">
            {/* Sliding Pill Background */}
            <motion.div 
              layoutId="nav-pill"
              className="absolute inset-y-1 bg-primary/10 border border-primary/20 rounded-full"
              initial={false}
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              style={{
                left: mode === "search" ? "4px" : mode === "jump" ? "108px" : "192px",
                width: mode === "search" ? "100px" : mode === "jump" ? "80px" : "108px",
              }}
            />

            {[
              { id: "search", label: "SEARCH", icon: Search },
              { id: "jump", label: "JUMP", icon: Compass },
              { id: "ask", label: "ASK AI", icon: Sparkles }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = mode === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setMode(tab.id as CommandMode)}
                  className={cn(
                    "relative px-4 py-1.5 rounded-full flex items-center gap-2 transition-colors duration-300 z-10",
                    isActive ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground/60"
                  )}
                >
                  <Icon size={12} className={cn(isActive && tab.id === "ask" && "animate-pulse")} />
                  <span className="text-[10px] font-black tracking-widest">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="absolute right-6 flex items-center gap-2 text-[9px] font-black tracking-widest text-muted-foreground/20 uppercase pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-2"
              >
                {mode === "ask" ? (
                  <>
                    <Bot size={10} />
                    <span>RAG ACTIVE</span>
                  </>
                ) : mode === "jump" ? (
                  <>
                    <FileText size={10} />
                    <span>NAV MODE</span>
                  </>
                ) : (
                  <>
                    <Hash size={10} />
                    <span>GLOBAL</span>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </CommandSurfaceFooter>
        </div>
    </CommandSurface>
  );
}
