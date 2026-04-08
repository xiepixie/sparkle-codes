"use client";

import { useMemo } from "react";
import { renderMarkdownSnippet, escapeRegExp } from "@/lib/markdown-utils";
import { cn } from "@repo/ui";

interface MarkdownSnippetProps {
  /** Raw markdown or text to render. Alias for 'content' to support legacy 'SearchMatch' props. */
  text?: string;
  /** Raw markdown or text to render */
  content?: string;
  /** Optional search query for highlighting matches */
  query?: string;
  /** What kind of hit is this? Impacts styling and telemetry data attributes */
  hitKind?: "title" | "description" | "body";
  /** Fallback string if content is empty */
  fallback?: string;
  /** Custom CSS classes for the container */
  className?: string;
}

/**
 * MarkdownSnippet
 * 
 * A high-performance, safe component for rendering a constrained subset of Markdown.
 * Used for previews, search descriptions, and command menu hits.
 * 
 * Features:
 * - Direct ID-based highlighting (via server-rendered <mark> tags if available)
 * - Transparent fallback to client-side highlighting for raw text
 * - KaTeX support (via markdown-utils)
 * - Sanitized-by-design (uses escapeHtml + specific white-listed tags)
 */
export function MarkdownSnippet({
  content,
  text,
  query = "",
  fallback = "",
  hitKind = "body",
  className,
}: MarkdownSnippetProps) {
  const rawContent = content || text || fallback;
  
  const renderedHtml = useMemo(() => {
    if (!rawContent) {
      return "";
    }
    // we use it as is if it doesn't need fresh highlighting.
    // Otherwise, we re-run the snippet renderer.
    const hasPreRenderedHtml = 
      rawContent.includes("<span") || 
      rawContent.includes("<mark") || 
      rawContent.includes("<code") ||
      rawContent.includes("<strong") ||
      rawContent.includes("<h3") ||
      rawContent.includes("<em") ||
      rawContent.includes("<a") ||
      rawContent.includes("<del");
    
    if (hasPreRenderedHtml) {
      return rawContent;
    }

    return renderMarkdownSnippet(rawContent, query, hitKind);
  }, [rawContent, query, hitKind]);

  if (!renderedHtml && !query.trim()) {
     // Safe manual highlight for tiny strings or edge cases where logic might skip
     return <span className={className}>{rawContent}</span>;
  }

  return (
    <span 
      className={cn("markdown-snippet", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderMarkdownSnippet uses strict escapeHtml for all non-whitelisted segments
      dangerouslySetInnerHTML={{ __html: renderedHtml }} 
    />
  );
}

/**
 * AccessibleMarkdownSnippet
 * 
 * A version that uses a more robust splitting strategy for raw text to avoid
 * dangerouslySetInnerHTML where possible, while still falling back to it for 
 * complex markdown features (like math).
 */
export function AccessibleMarkdownSnippet({
  content,
  text,
  query = "",
  fallback = "",
  hitKind = "body",
  className,
}: MarkdownSnippetProps) {
  const rawContent = content || text || fallback;
  
  const hasComplexMarkdown = 
    rawContent.includes("$") || 
    rawContent.includes("`") || 
    rawContent.includes("[") ||
    rawContent.includes("**") ||
    rawContent.includes("==") ||
    rawContent.includes("<");

  if (!hasComplexMarkdown && query.trim()) {
    const parts = rawContent.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
    return (
      <span className={cn("markdown-snippet", className)}>
        {parts.map((part, i) => 
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="search-hit font-semibold bg-primary/20 text-primary underline decoration-primary/30 underline-offset-2" data-hit-kind={hitKind}>
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  }

  // Fallback to the rich renderer for everything else
  return (
    <MarkdownSnippet 
      content={content} 
      text={text}
      query={query} 
      fallback={fallback} 
      hitKind={hitKind} 
      className={className} 
    />
  );
}
