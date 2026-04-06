'use client';

import Link from "next/link";
import { Calendar, ArrowRight, Clock } from "lucide-react";
import type { BlogPostSummary } from "@/lib/blog";

interface BlogCardProps {
  post: BlogPostSummary;
  index: number;
  activeTags?: string[];
  onTagSelect?: (tag: string) => void;
}

function HighlightedTitle({ className, html }: { className?: string; html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Search highlights are sanitized before reaching the client.
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function HighlightedBlock({ className, html }: { className?: string; html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Search highlights are sanitized before reaching the client.
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function stripHtml(value?: string | null) {
  return (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function BlogCard({ post, index, activeTags = [], onTagSelect }: BlogCardProps) {
  const selectedTags = new Set(activeTags.map((tag) => tag.toLowerCase()));
  const hasDescription = Boolean(post.highlightedDescription || post.description);
  const normalizedDescription = stripHtml(post.highlightedDescription || post.description);
  const normalizedBodyPreview = stripHtml(post.highlightedBodyPreview);
  const shouldShowBodyPreview =
    Boolean(post.highlightedBodyPreview) &&
    normalizedBodyPreview.length > 0 &&
    normalizedBodyPreview !== normalizedDescription;

  // Format date consistently
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(post.date));

  return (
    <article
      className="h-full animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/40 bg-background/40 p-5 shadow-sm transition-all duration-300 hover:border-primary/25 hover:bg-muted/10 hover:shadow-glow sm:p-6 md:p-8 backdrop-blur-3xl">
          {/* Top Decorative Scanning Line */}
          <div className="pointer-events-none absolute left-0 top-0 h-[1px] w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          
          <Link 
            href={`/blog/${post.path}`}
            className="relative z-10 flex flex-1 flex-col rounded-2xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Read post: ${post.displayTitle || post.title}`}
          >
            {/* Header Info: Date and Reading Time */}
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/50 sm:mb-6 sm:text-[11px] sm:tracking-widest">
              <div className="flex items-center gap-1.5 transition-colors group-hover:text-primary/70">
                <Calendar className="h-3.5 w-3.5" />
                <time dateTime={post.date}>{formattedDate}</time>
              </div>
              
              <span className="w-1 h-1 rounded-full bg-border/60" />
              
              <div className="flex items-center gap-1.5 transition-colors group-hover:text-primary/70">
                <Clock className="h-3.5 w-3.5" />
                <span>{post.readingTime || "5 MIN READ"}</span>
              </div>
            </div>

            {/* Title & Description */}
            <div className="mb-4 min-w-0 space-y-3 sm:space-y-4">
              <h2 className="text-xl font-bold leading-snug tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary [overflow-wrap:anywhere] sm:text-2xl">
                <HighlightedTitle html={post.highlightedTitle || post.displayTitle || post.title} />
              </h2>

              {hasDescription ? (
                <HighlightedBlock 
                  className="line-clamp-3 min-w-0 text-sm font-sans leading-relaxed text-muted-foreground/85 transition-colors group-hover:text-foreground/90 [overflow-wrap:anywhere] md:line-clamp-3"
                  html={post.highlightedDescription || post.description || ""}
                />
              ) : null}

              {shouldShowBodyPreview ? (
                <HighlightedBlock
                  className="rounded-2xl border border-border/10 bg-muted/10 px-4 py-3 text-xs leading-relaxed text-foreground/80 [overflow-wrap:anywhere]"
                  html={post.highlightedBodyPreview || ""}
                />
              ) : null}
            </div>
          </Link>

          {/* Footer: Tags & Action */}
          <div className="relative z-20 mt-auto flex flex-col gap-4 border-t border-border/20 pt-5 transition-colors group-hover:border-primary/20 sm:flex-row sm:items-center sm:justify-between">
            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {post.tags && post.tags.length > 0 ? (
                post.tags.slice(0, 3).map((tag: string) => (
                  <button
                    type="button"
                    key={tag} 
                    onClick={() => onTagSelect?.(tag)}
                    aria-pressed={selectedTags.has(tag.toLowerCase())}
                    className={`inline-flex min-h-11 items-center rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer ${
                      selectedTags.has(tag.toLowerCase())
                        ? "border-primary/40 bg-primary/14 text-foreground"
                        : "border-border/30 bg-muted/40 text-muted-foreground/85 hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                    }`}
                  >
                    {tag}
                  </button>
                ))
              ) : (
                <span className="inline-flex min-h-11 items-center rounded-xl border border-border/20 bg-muted/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
                  ARTICLE
                </span>
              )}
            </div>

            {/* Read More Trigger */}
            <Link href={`/blog/${post.path}`} className="flex items-center gap-2 self-start rounded-lg pr-1 text-primary no-underline transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:self-auto">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-100 transition-all duration-300">
                Read article
              </span>
              <ArrowRight className="h-4 w-4 text-primary opacity-80 transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100" />
            </Link>
          </div>

          {/* Corner Decals */}
          <div className="absolute pointer-events-none -bottom-2 -right-2 w-10 h-10 border-r border-b border-primary/0 group-hover:border-primary/30 transition-all duration-500 rounded-br-3xl" />
          <div className="absolute pointer-events-none -top-2 -left-2 w-10 h-10 border-l border-t border-primary/0 group-hover:border-primary/30 transition-all duration-500 rounded-tl-3xl" />
      </div>
    </article>
  );
}
