"use client";

import { 
  Clock,
  Compass,
  FileText, 
  Hash,
  Loader2, 
  Search, 
} from "lucide-react";
import { 
  useDeferredValue, 
  useEffect, 
  useMemo, 
  useRef, 
  useState, 
  useTransition 
} from "react";
import { cn } from "@repo/ui";
import {
  CommandEmptyState,
  CommandModeRail,
  CommandSurface,
  CommandSurfaceBody,
  CommandSurfaceFooter,
  CommandSurfaceHeader,
} from "@/components/CommandSurface";
import { readFilteredHistory, type ReadingHistoryEntry } from "@/lib/reading-history";
import { normalizeSlug } from "@repo/utils";
import {
  COMMAND_CENTER_EVENT,
  scrollToReadingSection,
  type CommandJumpSubMode,
  type CommandCenterMode,
  type CommandCenterReadingContext,
} from "@/lib/command-center";
import { AccessibleMarkdownSnippet as SearchMatch } from "./markdown-snippet";
import { usePathname, useRouter } from "next/navigation";

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
    if (!item || typeof item !== "object") return acc;

    const candidate = item as Record<string, unknown>;
    const title = typeof candidate.title === "string" ? candidate.title : typeof candidate.name === "string" ? candidate.name : null;
    const url = typeof candidate.url === "string" ? candidate.url : typeof candidate.href === "string" ? candidate.href : null;
    
    if (!title || !url) return acc;

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

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CommandMode>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [jumpQuery, setJumpQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recentHistory, setRecentHistory] = useState<ReadingHistoryEntry[]>([]);
  const [readingContext, setReadingContext] = useState<CommandCenterReadingContext | null>(null);
  const [jumpSubMode, setJumpSubMode] = useState<CommandJumpSubMode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isNavigating, startNavTransition] = useTransition();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

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
      const availableModes: CommandMode[] = readingContext ? ["search", "jump"] : ["search"];

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

  useEffect(() => {
    if (!open) {
      return;
    }
    // Use pathname to exclude the current page from history.
    // normalizeSlug inside readFilteredHistory handles /blog/xxx → xxx canonicalization.
    setRecentHistory(readFilteredHistory(pathname).slice(0, 4));
  }, [open, pathname]);

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
      setJumpQuery("");
    }
  }, [mode, open, readingContext]);

  useEffect(() => {
    if (mode !== "search") {
      return;
    }

    const query = deferredSearchQuery.trim();
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
    const query = jumpQuery.trim().toLowerCase();

    if (!query) {
      return sections;
    }
    return sections.filter((section) => section.title.toLowerCase().includes(query));
  }, [jumpQuery, readingContext]);

  const filteredRecentReading = useMemo(() => {
    // 1. Source: Always fetch fresh from local storage for consistency, 
    // ensuring exclusion works even if the parent context is slightly behind.
    const source = readFilteredHistory(pathname);
    
    // Explicitly determine current page slug from various possible sources
    // to ensure exclusion works even if one context is slightly delayed.
    const currentPathKey = normalizeSlug(pathname);
    const appContextKey = normalizeSlug(readingContext?.slug);
    
    const query = jumpQuery.trim().toLowerCase();
    
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
    }).slice(0, 5);
  }, [jumpQuery, readingContext, pathname]);

  const navigateToBlogPost = (url: string) => {
    if (pendingUrl) return; 
    
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
          <div className="flex-shrink-0">
            {mode === "jump" ? (
                <Compass className="h-5 w-5 text-primary/80 transition-all duration-300" />
            ) : (
                <Search className={cn("h-5 w-5 text-muted-foreground transition-all duration-300", searchLoading && "opacity-0")} />
            )}
            {searchLoading && mode === "search" && (
                <Loader2 className="absolute top-5 left-6 h-5 w-5 text-primary animate-spin" />
            )}
          </div>
          
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-xl outline-none placeholder:text-muted-foreground/30 font-light tracking-tight min-w-0"
            placeholder={
              mode === "jump"
                ? "Jump to sections or recent reading..."
                : "Search blog posts..."
            }
            value={mode === "jump" ? jumpQuery : searchQuery}
            onChange={
              mode === "jump"
                ? (event) => setJumpQuery(event.target.value)
                : (event) => setSearchQuery(event.target.value)
            }
          />
          
          <div className="flex h-full shrink-0 items-center justify-center px-4">
            <div className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black tracking-widest transition-all duration-500",
              mode === "jump" 
                ? "border-primary/20 bg-primary/10 text-primary" 
                : "border-muted-foreground/20 bg-muted-foreground/10 text-muted-foreground"
            )}>
              {mode === "jump" ? "JUMP" : "SEARCH"}
            </div>
          </div>
          
          {/* High-Fidelity Animated Search Loader */}
          <div className={cn(
              "absolute bottom-0 left-0 right-0 h-[1.5px] transition-all duration-500",
              searchLoading && mode === "search" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[1px]"
          )}>
            <div className={cn(
              "h-full w-full animate-search-loader bg-gradient-to-r from-transparent via-primary to-transparent opacity-80"
            )} />
          </div>
        </CommandSurfaceHeader>

        <CommandSurfaceBody className="space-y-4">
          {mode === "search" && deferredSearchQuery.trim() ? (
            searchResults.length > 0 ? (
              <div className="space-y-2 pb-4">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    disabled={!!pendingUrl}
                    onClick={() => navigateToBlogPost(result.url)}
                    className={cn(
                      "block w-full rounded-2xl border border-border/40 bg-muted/15 p-4 text-left transition-all",
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
              <CommandEmptyState
                icon={<Search className="h-10 w-10 text-muted-foreground" />}
                title="No matching blog posts yet"
                description="Try a broader keyword, a slug fragment, or a concept from the article body."
              />
            )
          ) : mode === "jump" ? (
            readingContext ? (
              <>
                {jumpSubMode === "history" ? (
                  <>
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
                                    "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all",
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
                                className="group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5"
                              >
                                <span className="font-mono text-[11px] font-bold text-primary/80 transition-transform group-hover:scale-125 dark:text-primary/70">
                                  {"#".repeat(Math.max(1, section.level))}
                                </span>
                                <SearchMatch
                                  className="min-w-0 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground"
                                  text={section.renderedTitle}
                                  fallback={section.title}
                                  query={jumpQuery}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Default order: Sections first */}
                    <div className="space-y-6">
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
                                className="group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5"
                              >
                                <span className="font-mono text-[11px] font-bold text-primary/80 transition-transform group-hover:scale-125 dark:text-primary/70">
                                  {"#".repeat(Math.max(1, section.level))}
                                </span>
                                <SearchMatch
                                  className="min-w-0 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground"
                                  text={section.renderedTitle}
                                  fallback={section.title}
                                  query={jumpQuery}
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
                                    "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all",
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
                    </div>
                  </>
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
                            "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all",
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

              <CommandEmptyState
                icon={<Clock className="h-10 w-10 text-primary/40" />}
                title={recentHistory.length > 0 ? "Jump into a post" : "Begin your search"}
                description="Use the same blog search logic here as on the blog index, with jump mode available while reading."
                actions={
                  <div className="flex max-w-md flex-wrap justify-center gap-2">
                    {["性能", "MDX", "项目", "测试"].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleSearchSuggestion(suggestion)}
                        className="rounded-lg border border-border/30 bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-all duration-300 hover:bg-accent hover:text-accent-foreground dark:border-border/10"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                }
              />
            </div>
          ) : null}
        </CommandSurfaceBody>
        
        <CommandSurfaceFooter>
            <div className="flex items-center gap-6">
                <CommandModeRail
                  leftLabel="SEARCH"
                  rightLabel="JUMP"
                  activeMode={mode === "search" ? "left" : "right"}
                />
            </div>
            
            <div className="flex items-center gap-2 rounded-full border border-border/10 bg-muted/20 px-3 py-1 text-[10px] font-bold text-muted-foreground/60 transition-all duration-300">
                {mode === "jump" ? (
                  <>
                    <FileText className="h-3 w-3" />
                    <span>READING CONTEXT</span>
                  </>
                ) : (
                  <>
                    <Search className="h-3 w-3" />
                    <span>BLOG INDEX</span>
                  </>
                )}
            </div>
        </CommandSurfaceFooter>
        </div>
    </CommandSurface>
  );
}
