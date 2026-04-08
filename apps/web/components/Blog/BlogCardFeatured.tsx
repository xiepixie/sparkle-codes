'use client';

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock } from "lucide-react";
import type { BlogPostSummary } from "@/lib/blog";
import { TiltWrapper } from "@repo/ui";

interface BlogCardFeaturedProps {
  post: BlogPostSummary;
  serialNumber?: string;
  activeTags?: string[];
  onTagSelect?: (tag: string) => void;
}

function HighlightedTitle({ className, html }: { className?: string; html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized before reaching the client.
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function HighlightedBlock({ className, html }: { className?: string; html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized before reaching the client.
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function BlogCardFeatured({ post, serialNumber = "01", activeTags = [], onTagSelect }: BlogCardFeaturedProps) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(post.date));

  const selectedTags = new Set(activeTags.map((tag) => tag.toLowerCase()));
  const hasDescription = Boolean(post.highlightedDescription || post.description);
  const normalizedDescription = (post.highlightedDescription || post.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const normalizedBodyPreview = (post.highlightedBodyPreview || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const shouldShowBodyPreview = Boolean(post.highlightedBodyPreview) && normalizedBodyPreview.length > 0 && normalizedBodyPreview !== normalizedDescription;

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4">
      <TiltWrapper variant="nebula" tiltAngle={3} className="rounded-[2rem]">
        <div className="group relative flex h-full flex-col min-h-[320px] sm:min-h-[400px] md:min-h-[440px] w-full p-6 sm:p-10 decoration-transparent overflow-hidden rounded-[calc(2rem-2px)]">
          <Link 
            href={`/blog/${post.path}`}
            className="absolute inset-0 z-10 focus-visible:outline-none"
            aria-label={`Read post: ${post.displayTitle || post.title}`}
          />
          
          {/* Subtle Primary Gradient Background or Image Banner */}
          {post.banner ? (
            <div className="absolute inset-0 pointer-events-none -z-10">
              <Image 
                src={post.banner} 
                alt={post.title} 
                fill
                priority
                className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen transition-transform duration-1000 group-hover:scale-105 group-hover:opacity-60" 
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/20" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/20 lg:hidden" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none -z-10" />
          )}
          
          {/* Left Decorative Line */}
          <div className="absolute left-[20px] sm:left-[30px] top-8 bottom-8 w-[3px] rounded-full bg-primary/40 transition-colors duration-500 group-hover:bg-primary/80 z-0" />

          {/* Top Info: LATEST Badge & Number */}
          <div className="flex justify-between items-start mb-6 sm:mb-10 pl-4 sm:pl-6 relative z-10 w-full pointer-events-none">
            <div className="flex flex-col gap-1.5 sm:gap-2">
              <span className="inline-flex w-fit items-center rounded-full bg-primary/20 xl:bg-primary/30 px-3 py-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-primary/95 ring-1 ring-inset ring-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                LATEST
              </span>
              <time dateTime={post.date} className="mt-1 sm:mt-2 text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80 sm:tracking-widest">
                {formattedDate}
              </time>
            </div>
            
            <div className="font-mono text-5xl sm:text-7xl font-black text-primary/10 transition-colors duration-500 group-hover:text-primary/30 select-none">
              {serialNumber}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center pl-4 sm:pl-6 max-w-xl md:max-w-3xl lg:max-w-4xl relative z-10 pointer-events-none">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black leading-[1.15] sm:leading-[1.1] tracking-tight text-foreground transition-colors duration-300 group-hover:text-primary [overflow-wrap:anywhere] mb-4 sm:mb-6 drop-shadow-md">
              <HighlightedTitle html={post.highlightedTitle || post.displayTitle || post.title} />
            </h2>
            
            {(hasDescription || shouldShowBodyPreview) && (
              <HighlightedBlock 
                className="line-clamp-2 md:line-clamp-3 min-w-0 text-sm sm:text-base md:text-lg font-sans leading-relaxed text-muted-foreground/90 transition-colors group-hover:text-foreground/95 [overflow-wrap:anywhere]"
                html={hasDescription ? (post.highlightedDescription || post.description || "") : (post.highlightedBodyPreview || "")}
              />
            )}
          </div>

          {/* Footer Area */}
          <div className="pl-4 sm:pl-6 mt-6 sm:mt-8 relative z-20 w-full">
            <div className="flex flex-col gap-4 border-t border-border/20 pt-5 sm:pt-6 transition-colors group-hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between">
              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {post.tags && post.tags.length > 0 && post.tags.map((tag: string) => (
                  <button
                    key={tag} 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      onTagSelect?.(tag);
                    }}
                    className={`inline-flex items-center rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.15em] transition-all ring-1 ring-inset backdrop-blur-md cursor-pointer ${
                      selectedTags.has(tag.toLowerCase())
                        ? "bg-primary/20 text-foreground ring-primary/40 shadow-glow-sm"
                        : "bg-background/50 sm:bg-background/40 text-foreground/90 ring-border/50 hover:bg-primary/10 hover:ring-primary/30 hover:text-primary"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Read Info */}
              <div className="flex items-center gap-3 sm:gap-4 self-end sm:self-auto pointer-events-none">
                <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80 transition-colors group-hover:text-primary/80">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>{post.readingTime || "5 MIN READ"}</span>
                </div>
                
                <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-border/40 bg-background/50 transition-all duration-300 group-hover:bg-primary group-hover:border-primary group-hover:shadow-[0_0_15px_rgba(var(--primary),0.5)]">
                  <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground transition-all duration-300 group-hover:text-primary-foreground group-hover:-rotate-45" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </TiltWrapper>
    </div>
  );
}
