"use client";

import { 
  Clock,
  Compass,
  FileText, 
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
import { readReadingHistory, type ReadingHistoryEntry } from "@/lib/reading-history";
import {
  COMMAND_CENTER_EVENT,
  scrollToReadingSection,
  type CommandJumpSubMode,
  type CommandCenterMode,
  type CommandCenterReadingContext,
} from "@/lib/command-center";
import { usePathname, useRouter } from "next/navigation";

type CommandMode = CommandCenterMode;

interface SearchResultItem {
  id: string;
  title: string;
  description: string;
  bodyPreview?: string;
  url: string;
  section?: string;
  highlightedTitle?: string;
  highlightedDescription?: string;
  highlightedBodyPreview?: string;
}

/**
 * Safe Search Match Component
 * Replaces dangerouslySetInnerHTML with a safe, accessible splitting strategy.
 * Prevents XSS while allowing highlighting of user query matches.
 */
  function SearchMatch({ 
    text, 
    query, 
    fallback, 
    className 
  }: { 
    text?: string; 
    query: string; 
    fallback: string;
    className?: string;
  }) {
    const content = text || fallback;
    
    // Snappy refinement: If we have pre-rendered HTML (e.g. math or tags) 
    // from the server-side renderSearchSnippet, we should trust it, 
    // as it already contains correctly positioned <mark> tags for the current query.
    // Client-side highlighting is only a fallback for raw text.
    const hasHtml = content.includes("<span") || content.includes("<mark") || content.includes("<div");
    
    if (hasHtml || !query.trim() || !content) {
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted content (math or server-highlighted) must be rendered as HTML.
      return <span className={className} dangerouslySetInnerHTML={{ __html: content }} />;
    }
  
    // Fallback: Safe text highlighting for raw content
    const parts = content.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  
    return (
      <span className={className}>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-primary/20 text-primary rounded-sm px-0.5 font-bold">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  }

function normalizeSearchResults(data: unknown): SearchResultItem[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const results: Array<SearchResultItem | null> = data.map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const title = typeof candidate.title === "string" ? candidate.title : typeof candidate.name === "string" ? candidate.name : null;
      const url = typeof candidate.url === "string" ? candidate.url : typeof candidate.href === "string" ? candidate.href : null;
      const description =
        typeof candidate.description === "string"
          ? candidate.description
          : typeof candidate.content === "string"
            ? candidate.content
            : typeof candidate.excerpt === "string"
              ? candidate.excerpt
              : "";
      const section =
        typeof candidate.section === "string"
          ? candidate.section
          : typeof candidate.type === "string"
            ? candidate.type
            : undefined;
      const bodyPreview =
        typeof candidate.bodyPreview === "string"
          ? candidate.bodyPreview
          : undefined;
      const highlightedTitle =
        typeof candidate.highlightedTitle === "string"
          ? candidate.highlightedTitle
          : undefined;
      const highlightedDescription =
        typeof candidate.highlightedDescription === "string"
          ? candidate.highlightedDescription
          : undefined;
      const highlightedBodyPreview =
        typeof candidate.highlightedBodyPreview === "string"
          ? candidate.highlightedBodyPreview
          : undefined;

      if (!title || !url) {
        return null;
      }

      return {
        id: typeof candidate.id === "string" ? candidate.id : `${url}-${index}`,
        title,
        description,
        bodyPreview,
        url,
        section,
        highlightedTitle,
        highlightedDescription,
        highlightedBodyPreview,
      };
    });

  return results.filter((item): item is SearchResultItem => item !== null);
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

    const normalize = (url: string) => url.split("#")[0].split("?")[0].replace(/\/$/, "");
    const current = normalize(pathname);
    const target = normalize(pendingUrl);
    
    // Arrival check: URL matches destination
    const hasArrived = current === target || target.endsWith(current);
    
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
    setRecentHistory(readReadingHistory().slice(0, 4));
  }, [open]);

  // A11Y & Control: Manual focus instead of autoFocus
  useEffect(() => {
    if (open) {
      // Small delay to ensure the animation/modal mounting is ready
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
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
        setSearchResults(normalizeSearchResults(data));
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
  }, [deferredSearchQuery, mode]);

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
    const source = readingContext?.recentPosts?.length ? readingContext.recentPosts : recentHistory;
    const currentSlug = readingContext?.slug;
    
    // Normalization helper for slugs to prevent mismatched exclusions 
    // due to leading slashes or differing formats.
    const normalizeSlug = (s?: string) => s?.replace(/^\//, "").toLowerCase() || "";
    const normalizedCurrent = normalizeSlug(currentSlug);

    // Filter out current post and apply search query
    const query = jumpQuery.trim().toLowerCase();
    return source.filter((entry) => {
      if (normalizeSlug(entry.slug) === normalizedCurrent) {
        return false;
      }
      if (!query) {
        return true;
      }
      return entry.title.toLowerCase().includes(query);
    });
  }, [jumpQuery, readingContext, recentHistory]);

  const navigateToBlogPost = (url: string) => {
    if (pendingUrl) {
      return; 
    }
    
    // Snappy UX: If target is current page, just hide menu immediately
    const normalize = (u: string) => u.split("#")[0].split("?")[0].replace(/\/$/, "");
    if (normalize(url) === normalize(pathname)) {
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
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/55">
                      {pendingUrl === result.url ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      <span>{pendingUrl === result.url ? "Opening..." : (result.section || "Content")}</span>
                    </div>
                    <SearchMatch 
                      className={cn("mb-2 block text-sm font-semibold transition-colors", pendingUrl === result.url ? "text-primary" : "text-foreground")}
                      text={result.highlightedTitle}
                      fallback={result.title}
                      query={searchQuery}
                    />
                    {result.description ? (
                      <SearchMatch 
                        className="line-clamp-2 block text-xs leading-relaxed text-muted-foreground"
                        text={result.highlightedDescription}
                        fallback={result.description}
                        query={searchQuery}
                      />
                    ) : null}
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
                            {filteredRecentReading.map((entry) => (
                              <button
                                key={entry.slug}
                                type="button"
                                disabled={!!pendingUrl}
                                onClick={() => navigateToBlogPost(`/blog/${entry.slug}`)}
                                className={cn(
                                  "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all",
                                  "hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5",
                                  pendingUrl === `/blog/${entry.slug}` ? "scale-[0.98] border-primary/40 bg-primary/10" : (pendingUrl ? "opacity-40 grayscale-[0.5] blur-[0.5px]" : "active:scale-[0.99]")
                                )}
                              >
                                {pendingUrl === `/blog/${entry.slug}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : (
                                  <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                                )}
                                <span className={cn(
                                  "min-w-0 truncate text-sm font-medium transition-colors",
                                  pendingUrl === `/blog/${entry.slug}` ? "text-primary font-semibold" : "text-foreground/85 group-hover:text-foreground"
                                )}>
                                  {pendingUrl === `/blog/${entry.slug}` ? "Entering post..." : entry.title}
                                </span>
                              </button>
                            ))}
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
                            {filteredRecentReading.map((entry) => (
                              <button
                                key={entry.slug}
                                type="button"
                                disabled={!!pendingUrl}
                                onClick={() => navigateToBlogPost(`/blog/${entry.slug}`)}
                                className={cn(
                                  "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all",
                                  "hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5",
                                  pendingUrl === `/blog/${entry.slug}` ? "scale-[0.98] border-primary/40 bg-primary/10" : (pendingUrl ? "opacity-40 grayscale-[0.5] blur-[0.5px]" : "active:scale-[0.99]")
                                )}
                              >
                                {pendingUrl === `/blog/${entry.slug}` ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                ) : (
                                  <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                                )}
                                <span className={cn(
                                  "min-w-0 truncate text-sm font-medium transition-colors",
                                  pendingUrl === `/blog/${entry.slug}` ? "text-primary font-semibold" : "text-foreground/85 group-hover:text-foreground"
                                )}>
                                  {pendingUrl === `/blog/${entry.slug}` ? "Entering post..." : entry.title}
                                </span>
                              </button>
                            ))}
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
              {recentHistory.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/70 dark:text-muted-foreground/50">
                    Recent Reading
                  </div>
                  <div className="space-y-2">
                    {recentHistory.map((entry) => (
                      <button
                        key={entry.slug}
                        type="button"
                        disabled={!!pendingUrl}
                        onClick={() => navigateToBlogPost(`/blog/${entry.slug}`)}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all",
                          "hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5",
                          pendingUrl === `/blog/${entry.slug}` ? "scale-[0.98] border-primary/40 bg-primary/10" : (pendingUrl ? "opacity-40 grayscale-[0.5] blur-[0.5px]" : "active:scale-[0.99]")
                        )}
                      >
                        {pendingUrl === `/blog/${entry.slug}` ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                        )}
                        <span className={cn(
                          "min-w-0 truncate text-sm font-medium transition-colors",
                          pendingUrl === `/blog/${entry.slug}` ? "text-primary font-semibold" : "text-foreground/85 group-hover:text-foreground"
                        )}>
                          {pendingUrl === `/blog/${entry.slug}` ? "Entering post..." : entry.title}
                        </span>
                      </button>
                    ))}
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
