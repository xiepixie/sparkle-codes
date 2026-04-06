"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { 
  Search, 
  Loader2, 
  FileText, 
  Compass,
  Clock,
} from "lucide-react";
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
  type CommandCenterMode,
  type CommandCenterReadingContext,
  scrollToReadingSection,
} from "@/lib/command-center";
import { useRouter } from "next/navigation";

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

function normalizeSearchResults(data: unknown): SearchResultItem[] {
  if (!Array.isArray(data)) return [];

  const results: Array<SearchResultItem | null> = data.map((item, index) => {
      if (!item || typeof item !== "object") return null;

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

      if (!title || !url) return null;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const router = useRouter();

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
      }>;

      if (customEvent.detail?.reading !== undefined) {
        setReadingContext(customEvent.detail.reading ?? null);
      }

      if (customEvent.detail?.mode) {
        setMode(customEvent.detail.mode);
      } else if (customEvent.detail?.reading) {
        setMode("jump");
      }

      setOpen(true);
    };

    window.addEventListener(COMMAND_CENTER_EVENT, handleCommandCenterOpen as EventListener);
    return () => window.removeEventListener(COMMAND_CENTER_EVENT, handleCommandCenterOpen as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    setRecentHistory(readReadingHistory().slice(0, 4));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "jump" || !readingContext) {
      setJumpQuery("");
    }
  }, [mode, open, readingContext]);

  useEffect(() => {
    if (mode !== "search") return;

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
    }, 120);

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

    if (!query) return sections;
    return sections.filter((section) => section.title.toLowerCase().includes(query));
  }, [jumpQuery, readingContext]);

  const filteredRecentReading = useMemo(() => {
    const source = readingContext?.recentPosts?.length ? readingContext.recentPosts : recentHistory;
    const query = jumpQuery.trim().toLowerCase();

    if (!query) return source;
    return source.filter((entry) => entry.title.toLowerCase().includes(query));
  }, [jumpQuery, readingContext, recentHistory]);

  const navigateToBlogPost = (url: string) => {
    setOpen(false);
    startTransition(() => {
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
            autoFocus
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
                    onClick={() => navigateToBlogPost(result.url)}
                    className="block w-full rounded-2xl border border-border/40 bg-muted/15 p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/[0.06] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5"
                  >
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/55">
                      <Search className="h-3 w-3" />
                      <span>{result.section || "Content"}</span>
                    </div>
                    <div
                      className="mb-2 text-sm font-semibold text-foreground"
                      dangerouslySetInnerHTML={{ __html: result.highlightedTitle || result.title }}
                    />
                    {result.description ? (
                      <div
                        className="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: result.highlightedDescription || result.description }}
                      />
                    ) : null}
                    {result.bodyPreview ? (
                      <div className="mt-3 rounded-xl border border-border/10 bg-background/50 px-3 py-2.5">
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-primary/60">
                          Body Match
                        </div>
                        <div
                          className="line-clamp-3 text-xs leading-relaxed text-foreground/70"
                          dangerouslySetInnerHTML={{ __html: result.highlightedBodyPreview || result.bodyPreview }}
                        />
                      </div>
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
              <div className="space-y-6 pb-4">
                <div className="rounded-2xl border border-border/30 bg-muted/20 p-4 transition-colors dark:border-border/10 dark:bg-muted/10">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-primary/70">
                    Reading Context
                  </div>
                  <div className="text-sm font-semibold text-foreground/85">{readingContext.title}</div>
                </div>

                {filteredReadingSections.length > 0 ? (
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
                          <span
                            className="min-w-0 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground"
                            dangerouslySetInnerHTML={{ __html: section.renderedTitle || section.title }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {filteredRecentReading.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground/70 dark:text-muted-foreground/50">
                      Recent Reading
                    </div>
                    <div className="space-y-2">
                      {filteredRecentReading.map((entry) => (
                        <button
                          key={entry.slug}
                          type="button"
                          onClick={() => navigateToBlogPost(`/blog/${entry.slug}`)}
                          className="group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5"
                        >
                          <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                          <span className="min-w-0 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground">{entry.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {filteredReadingSections.length === 0 && filteredRecentReading.length === 0 ? (
                  <CommandEmptyState
                    icon={<Compass className="h-10 w-10 text-muted-foreground" />}
                    title="Nothing matches that jump query"
                    description="Try a section keyword, a heading fragment, or another recent article title."
                  />
                ) : null}
              </div>
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
                        onClick={() => navigateToBlogPost(`/blog/${entry.slug}`)}
                        className="group flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-muted/15 px-4 py-3 text-left transition-all hover:border-primary/35 hover:bg-primary/[0.08] dark:border-border/10 dark:bg-muted/10 dark:hover:border-primary/20 dark:hover:bg-primary/5"
                      >
                        <Clock className="h-4 w-4 text-primary/80 transition-transform group-hover:rotate-6 dark:text-primary/70" />
                        <span className="min-w-0 truncate text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground">{entry.title}</span>
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
            
            <div className="flex items-center gap-2 rounded-full border border-border/10 bg-muted/20 px-3 py-1 text-muted-foreground/60">
                {mode === "jump" ? "READING CONTEXT" : "BLOG INDEX"}
            </div>
        </CommandSurfaceFooter>
        </div>
    </CommandSurface>
  );
}
