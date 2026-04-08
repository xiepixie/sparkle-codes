'use client';

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock } from "lucide-react";
import type { BlogPostSummary } from "@/lib/blog";

interface BlogCardCompactProps {
  post: BlogPostSummary;
  serialNumber?: string;
  activeTags?: string[];
  onTagSelect?: (tag: string) => void;
}

function HighlightedTitle({ className, html }: { className?: string; html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized before reaching the client.
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function BlogCardCompact({ post, serialNumber = "02", activeTags = [], onTagSelect }: BlogCardCompactProps) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(post.date));

  const selectedTags = new Set(activeTags.map((tag) => tag.toLowerCase()));

  return (
    <article className="h-full animate-in fade-in slide-in-from-bottom-4">
      <div className="group relative flex h-[180px] sm:h-[200px] flex-col overflow-hidden rounded-2xl border border-border/40 bg-background/40 shadow-sm transition-all duration-300 hover:border-primary/25 hover:bg-muted/10 hover:shadow-[0_0_15px_rgba(var(--primary),0.15)] hover:-translate-y-0.5 backdrop-blur-3xl">
        <Link 
          href={`/blog/${post.path}`}
          className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 no-underline"
          aria-label={`Read post: ${post.displayTitle || post.title}`}
        />

        {/* Top Decorative Line / Background Banner */}
        {post.banner ? (
          <div className="absolute inset-0 pointer-events-none -z-10 bg-background">
            <Image 
              src={post.banner} 
              alt={post.title} 
              fill
              className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen transition-transform duration-700 group-hover:scale-105 group-hover:opacity-30" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          </div>
        ) : (
          <div className="pointer-events-none absolute left-0 top-0 h-[1px] w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        )}

        {/* Large serial number in the background / corner */}
        <div className="absolute right-4 top-4 font-mono text-3xl font-black text-muted-foreground/10 transition-colors duration-300 group-hover:text-primary/20 pointer-events-none">
          {serialNumber}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 min-w-0 pr-8 p-5 sm:p-6 pb-0 pointer-events-none">
          <h2 className="text-lg font-bold leading-snug tracking-tight text-foreground line-clamp-2 transition-colors duration-300 group-hover:text-primary [overflow-wrap:anywhere]">
            <HighlightedTitle html={post.highlightedTitle || post.displayTitle || post.title} />
          </h2>
          {post.tags && post.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 pointer-events-auto relative z-20">
               {post.tags.slice(0, 2).map((tag: string) => (
                 <button 
                  key={tag} 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onTagSelect?.(tag);
                  }}
                  className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    selectedTags.has(tag.toLowerCase())
                      ? "bg-primary/20 text-foreground ring-1 ring-primary/30"
                      : "bg-muted/40 text-muted-foreground/70 hover:bg-primary/10 hover:text-primary"
                  }`}
                 >
                   {tag}
                 </button>
               ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/50 p-5 sm:p-6 pt-4 border-t border-border/10 pointer-events-none">
          <div className="flex items-center gap-1.5 group-hover:text-primary/70 transition-colors">
            <time dateTime={post.date}>{formattedDate}</time>
            <span className="w-1 h-1 rounded-full bg-border/60 mx-1" />
            <Clock className="h-3 w-3" />
            <span>{post.readingTime || "5 MIN"}</span>
          </div>
          
          <ArrowRight className="h-3.5 w-3.5 text-primary opacity-0 -translate-x-2 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
      </div>
    </article>
  );
}
