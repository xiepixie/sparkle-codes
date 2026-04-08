import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, FileText, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import { getPostPreview } from "../app/actions/preview";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { MarkdownSnippet } from "./markdown-snippet";

export interface PreviewData {
  title?: string;
  description?: string;
  area?: string;
  status?: string;
  tags?: string[];
  htmlContent?: string;
}

/**
 * Extract a fragment section from the current page DOM.
 * Uses multiple strategies: direct ID lookup, heading slug match, block anchor.
 * Returns an HTML snippet of the heading + following content (up to the next heading of same/higher level).
 */
function extractFragmentFromDOM(container: HTMLElement, fragment: string): string | null {
  // 1. Prepare search targets based on Rust parser canonical patterns
  const isBlock = fragment.startsWith("^");
  // Headings in Rust are h-[slugified-text]
  const headingId = `h-${fragment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, '');
  
  // Strategy 1: Direct ID lookup (Canonical)
  // Blocks keep the ^ in their ID: <span id="^blockid">
  // Headings are h-prefixed: <h2 id="h-slug">
  let targetEl = container.querySelector(`[id="${fragment}"]`) as HTMLElement;

  // Strategy 2: Prefix-aware lookup
  if (!targetEl) {
    if (isBlock) {
       // If it's a block but wasn't found, it might be stored without ^ in some legacy context (unlikely now)
       targetEl = container.querySelector(`[id="${fragment.slice(1)}"]`) as HTMLElement;
    } else {
       // Try heading prefix
       targetEl = container.querySelector(`[id="${headingId}"]`) as HTMLElement;
    }
  }
  
  // Strategy 3: Text-based heading match (Final fallback for dynamic/unscoped content)
  if (!targetEl && !isBlock) {
    const targetText = fragment.toLowerCase().replace(/[^a-z0-9]+/g, '');
    targetEl = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .find(h => (h.textContent || '').toLowerCase().replace(/[^a-z0-9]+/g, '') === targetText) as HTMLElement;
  }
  
  if (!targetEl) {
    return null;
  }
  
  // For block anchors (<span class="block-anchor" id="^...">), return the content of the parent block + context heading
  if (targetEl.classList.contains('block-anchor')) {
    const parent = targetEl.parentElement;
    if (parent) {
      // Find the nearest preceding heading for structural context
      let prevHeading: HTMLElement | null = null;
      let curr: Element | null = parent;
      while (curr && !prevHeading) {
        curr = curr.previousElementSibling;
        if (curr?.tagName.match(/^H(\d)$/i)) {
          prevHeading = curr as HTMLElement;
        }
      }

      const headingHtml = prevHeading ? 
        `<div class="preview-context-heading mb-4 -mx-6 px-6 pointer-events-none sticky top-0 bg-background/95 backdrop-blur-md z-20 shadow-[0_1px_3px_rgba(0,0,0,0.05)] py-2.5 border-b border-primary/10 flex items-center gap-2">
           <div class="w-1 h-4 bg-primary/20 rounded-full" />
           ${prevHeading.outerHTML}
         </div>` : 
        '';

      // We return the heading context and the highlighted target block
      // Removed absolute overlay to prevent blocking content and ensured data-block-id is properly set
      return `
        ${headingHtml}
        <div class="wiki-block-highlight highlight-target border-l-2 border-primary/30 pl-4 py-2 my-3 relative" data-block-id="${targetEl.id}">
           <div class="relative z-10 prose-p:my-1 prose-headings:my-2 prose-headings:font-bold prose-headings:text-foreground">${parent.innerHTML}</div>
        </div>`;
    }
    return null;
  }
  
  // For headings, collect content until the next heading of same or higher level
  const headingMatch = targetEl.tagName.match(/^H(\d)$/i);
  if (headingMatch) {
    const level = Number.parseInt(headingMatch[1], 10);
    // Include the heading itself (with its original ID for any relative links)
    const parts: string[] = [targetEl.outerHTML];
    
    let sibling = targetEl.nextElementSibling;
    let collectedLength = 0;
    const MAX_CHARS = 1500; // Increased limit for better context
    
    while (sibling && collectedLength < MAX_CHARS) {
      // Stop at next heading of same or higher level
      const sibMatch = sibling.tagName.match(/^H(\d)$/i);
      if (sibMatch && Number.parseInt(sibMatch[1], 10) <= level) {
        break;
      }
      parts.push(sibling.outerHTML);
      collectedLength += (sibling.textContent || '').length;
      sibling = sibling.nextElementSibling;
    }
    
    return `<div class="preview-section-context px-1">${parts.join('')}</div>`;
  }
  
  // Fallback: return the element itself wrapped in a highlight container
  return `<div class="highlight-target bg-primary/[0.04] p-5 rounded-2xl border border-primary/10 shadow-sm leading-relaxed">${targetEl.outerHTML}</div>`;
}

export function WikiLinkPreviewManager({ 
  containerRef, 
  currentSlug,
  currentPostMeta
}: { 
  containerRef: React.RefObject<HTMLElement | null>;
  currentSlug?: string;
  currentPostMeta?: PreviewData;
}) {
  const [hoveredLink, setHoveredLink] = useState<{ element: HTMLElement; slug: string } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | 'error' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Positional states
  const [cardPos, setCardPos] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHoveringCard, setIsHoveringCard] = useState(false);
  const [isCalculated, setIsCalculated] = useState(false);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // LRU cache inside ref
  const cacheRef = useRef<Map<string, { data: PreviewData; timestamp: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000;
  
  const router = useRouter();

  const hoveredLinkRef = useRef(hoveredLink);
  hoveredLinkRef.current = hoveredLink;

  const isHoveringCardRef = useRef(isHoveringCard);
  isHoveringCardRef.current = isHoveringCard;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let isTouch = false;

    const handlePreviewTrigger = (link: HTMLElement, _e?: MouseEvent | TouchEvent) => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      
      const slug = link.dataset.target;
      if (!slug) {
        return;
      }
      
      if (hoveredLinkRef.current?.element === link) {
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(async () => {
        const targetSlug = (slug.startsWith("#") && currentSlug) 
          ? `${currentSlug}${slug}`
          : slug;

        setHoveredLink({ element: link, slug: targetSlug });
        setIsLoading(true);
        setPreviewData(null);
        setIsCalculated(false);

        // Initial naive positioning (will be fixed in useLayoutEffect)
        const rect = link.getBoundingClientRect();
        setCardPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
        setPlacement('bottom');

        try {
          // Current document short-circuit (Phase 1)
          // data-target uses the full Obsidian vault path (e.g. "Documents/.../测试#fragment")
          // but currentSlug is just the URL filename (e.g. "测试").
          // We must extract the page name to compare correctly.
          const dataPage = link.dataset.page || "";
          const targetPageName = dataPage.split("/").pop() || "";
          const targetPathWithoutFragment = targetSlug.split("#")[0];
          const targetFileName = targetPathWithoutFragment.split("/").pop() || "";
          
          const isSameDocument = 
            currentSlug && (
              targetSlug === currentSlug ||
              targetSlug.startsWith(`${currentSlug}#`) ||
              targetPageName === currentSlug ||
              targetFileName === currentSlug
            );
          
          if (isSameDocument) {
            // For fragment links to the current document, try to extract the target section from DOM
            const fragment = targetSlug.includes("#") ? targetSlug.split("#").slice(1).join("#") : "";
            if (fragment && containerRef.current) {
              const fragmentHtml = extractFragmentFromDOM(containerRef.current, fragment);
              if (fragmentHtml) {
                setPreviewData({ 
                  ...currentPostMeta,
                  title: currentPostMeta?.title || "Current Document",
                  htmlContent: fragmentHtml 
                });
                setIsLoading(false);
                return;
              }
            }
            setPreviewData(currentPostMeta || { title: "Current Document", description: "You are already reading this document." });
            setIsLoading(false);
            return;
          }

          // Cache check (Phase 2)
          const cached = cacheRef.current.get(targetSlug);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setPreviewData(cached.data);
            setIsLoading(false);
            return;
          }

          const data = await getPostPreview(targetSlug);
          if (data) {
             cacheRef.current.set(targetSlug, { data, timestamp: Date.now() });
          }
          setPreviewData(data || 'error');
        } catch (error) {
          console.error("Failed to load preview", error);
          setPreviewData('error');
        } finally {
          setIsLoading(false);
        }
      }, isTouch ? 300 : 500); 
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a.wiki-link") as HTMLElement;
      if (link) {
        handlePreviewTrigger(link, e);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a.wiki-link");
      if (link) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        closeTimeoutRef.current = setTimeout(() => {
          if (!isHoveringCardRef.current) {
            setHoveredLink(null);
            setPreviewData(null);
          }
        }, 300);
      }
    };
    
    // Touch events for mobile (Phase 8)
    const handleTouchStart = (e: TouchEvent) => {
      isTouch = true;
      const target = e.target as HTMLElement;
      const link = target.closest("a.wiki-link") as HTMLElement;
      if (link) {
        handlePreviewTrigger(link, e);
      }
    };
    
    const handleTouchEnd = () => {
      if (timeoutRef.current && isTouch) {
        clearTimeout(timeoutRef.current);
      }
    };

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseout", handleMouseOut);
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);

    // Global click listener to close card on mobile when clicked outside
    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
       if (hoveredLinkRef.current && cardRef.current) {
          const target = e.target as Node;
          if (!cardRef.current.contains(target) && !hoveredLinkRef.current.element.contains(target)) {
             setHoveredLink(null);
             setPreviewData(null);
          }
       }
    };
    document.addEventListener("click", handleGlobalClick);
    document.addEventListener("touchstart", handleGlobalClick, { passive: true });

    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseout", handleMouseOut);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("click", handleGlobalClick);
      document.removeEventListener("touchstart", handleGlobalClick);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [containerRef, currentSlug, currentPostMeta]);

  // Responsive boundary calculations (Phase 4)
  useLayoutEffect(() => {
     if (hoveredLink && cardRef.current && typeof window !== 'undefined') {
        const link = hoveredLink.element;
        const linkRect = link.getBoundingClientRect();
        const cardRect = cardRef.current.getBoundingClientRect();
        
        const GAP = 8;
        const MARGIN = 16;
        
        let newLeft = linkRect.left + window.scrollX;
        let newTop = linkRect.bottom + window.scrollY + GAP;
        let newPlacement: 'top' | 'bottom' = 'bottom';

        // Right boundary
        if (newLeft + cardRect.width > window.innerWidth - MARGIN) {
           newLeft = window.innerWidth - cardRect.width - MARGIN;
        }
        
        // Left boundary
        if (newLeft < MARGIN) {
           newLeft = MARGIN;
        }
        
        // Bottom boundary (+ scroll flip)
        if (linkRect.bottom + GAP + cardRect.height > window.innerHeight) {
           // Flip to top
           newTop = linkRect.top + window.scrollY - GAP - cardRect.height;
           newPlacement = 'top';
           
           // If it also overflows top, we just force it inside viewport
           if (newTop - window.scrollY < MARGIN) {
              newTop = window.scrollY + MARGIN;
           }
        }
        
        setCardPos({ top: newTop, left: newLeft });
        setPlacement(newPlacement);
        requestAnimationFrame(() => setIsCalculated(true));
     }
  }, [hoveredLink, previewData, isLoading]);

  const handleCardMouseEnter = () => {
    setIsHoveringCard(true);
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
  };

  const handleCardMouseLeave = () => {
    setIsHoveringCard(false);
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredLink(null);
      setPreviewData(null);
    }, 300);
  };

  const handleNavigate = (path: string) => {
     setHoveredLink(null);
     setIsLoading(false);
     setPreviewData(null);
     router.push(path);
  };

  if (!hoveredLink) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Hover card wrapping element doesn't need focus
    <div 
      ref={cardRef}
      className={`absolute z-[100] transition-all duration-300 ease-out will-change-transform
        ${isCalculated ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95'}
        ${placement === 'bottom' ? (isCalculated ? 'translate-y-0' : '-translate-y-2') : (isCalculated ? 'translate-y-0' : 'translate-y-2')}`}
      style={{ top: cardPos.top, left: cardPos.left }}
      onMouseEnter={handleCardMouseEnter}
      onMouseLeave={handleCardMouseLeave}
    >
      <Card className="w-[min(480px,90vw)] max-w-[480px] shadow-[var(--shadow-ambient)] dark:shadow-none border border-border/80 bg-background/95 dark:bg-card/95 backdrop-blur-2xl overflow-hidden ring-1 ring-white/10 dark:ring-white/5 relative rounded-[var(--radius-xl)]">
        <div className="absolute inset-0 rounded-[var(--radius-xl)] pointer-events-none shadow-[var(--shadow-inner-glow)]" />
        
        {isLoading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-4">
             <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full mix-blend-screen animate-pulse" />
                <Loader2 className="w-8 h-8 text-primary animate-spin relative z-10" />
             </div>
             <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest animate-pulse font-mono flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                Resolving context
             </p>
          </div>
        ) : previewData === 'error' ? (
          <div className="p-8 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive/80 mb-1 ring-1 ring-destructive/20 border border-destructive/20 shadow-glow">
              <span className="text-xl font-bold">!</span>
            </div>
            <p className="text-base text-foreground font-semibold">Link Broken</p>
            <p className="text-sm text-muted-foreground/80 max-w-[200px]">The target document couldn't be loaded or doesn't exist.</p>
          </div>
        ) : previewData ? (
          <>
            <div className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary/60 via-primary/40 to-transparent ${placement === 'top' ? 'top-auto bottom-0' : ''}`} />
            <CardHeader className="p-6 pb-3">
              <div className="flex justify-between items-start mb-2 gap-4">
                <div className="flex gap-2 items-center flex-wrap">
                   {previewData.area && (
                    <Badge className="text-[10px] uppercase font-bold tracking-wider text-primary border-primary/20 bg-primary/5 px-2 py-0.5 rounded-sm shadow-sm ring-1 ring-primary/10">
                      {previewData.area}
                    </Badge>
                   )}
                   {(!previewData.status || previewData.status === 'draft') && (
                    <Badge className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground border-border/40 bg-muted/20 px-2 py-0.5 rounded-sm shadow-sm">
                       Draft
                    </Badge>
                   )}
                </div>
              <button 
                  type="button"
                  className="text-primary/40 hover:text-primary transition-all cursor-pointer hover:scale-110 active:scale-95" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Correctly handle fragments during navigation
                    const rawSlug = decodeURIComponent(hoveredLink.slug);
                    const parts = rawSlug.split("#");
                    const pathPart = parts[0].split("/").pop() || parts[0];
                    const fragmentPart = parts.length > 1 ? `#${parts.slice(1).join("#")}` : "";
                    const targetPath = `/blog/${encodeURIComponent(pathPart)}${fragmentPart}`;
                    handleNavigate(targetPath);
                  }}
                  aria-label="Open document"
                >
                    <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <CardTitle 
                className="text-2xl font-black leading-tight text-foreground transition-colors hover:text-primary cursor-pointer mt-1 mb-2 group inline-block tracking-tight" 
                onClick={(e) => { 
                   e.preventDefault();
                   e.stopPropagation();
                   // Correctly handle fragments during navigation
                   const rawSlug = decodeURIComponent(hoveredLink.slug);
                   const parts = rawSlug.split("#");
                   const pathPart = parts[0].split("/").pop() || parts[0];
                   const fragmentPart = parts.length > 1 ? `#${parts.slice(1).join("#")}` : "";
                   const targetPath = `/blog/${encodeURIComponent(pathPart)}${fragmentPart}`;
                   handleNavigate(targetPath);
                }}
              >
                <MarkdownSnippet 
                  content={previewData.title || ""} 
                  hitKind="title"
                  className="group-hover:text-primary transition-colors" 
                />
                <span className="block h-[2px] w-0 bg-primary/40 transition-all duration-300 group-hover:w-full mt-1.5 rounded-full" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              {/* biome-ignore lint: Accessibility handled via hover card interaction */}
              <div 
                className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed overflow-y-auto max-h-[45vh] min-h-[120px] relative scrollbar-thin scrollbar-thumb-primary/10 hover:scrollbar-thumb-primary/20 pr-1"
                onClick={(e) => {
                  // Catch wiki-link clicks inside the preview to prevent page reloads
                  const target = e.target as HTMLElement;
                  const link = target.closest("a") as HTMLAnchorElement;
                  if (link) {
                    const isWikiLink = link.classList.contains("wiki-link") || link.hasAttribute('data-page');
                    const isBlogLink = link.getAttribute('href')?.startsWith('/blog/');
                    
                    if (isWikiLink || isBlogLink) {
                      e.preventDefault();
                      e.stopPropagation();
                      let targetHref = link.getAttribute('href') || "";
                      
                      // If it's a wiki link in the preview, handle it properly
                      if (isWikiLink) {
                         const target = decodeURIComponent(link.dataset.target || link.getAttribute('href') || "");
                         const parts = target.split("#");
                         const pathPart = parts[0].split("/").pop() || parts[0];
                         const fragmentPart = parts.length > 1 ? `#${parts.slice(1).join("#")}` : "";
                         targetHref = `/blog/${encodeURIComponent(pathPart)}${fragmentPart}`;
                      }
                      
                      if (targetHref) {
                        handleNavigate(targetHref);
                      }
                    }
                  }
                }}
              >
                {previewData.htmlContent ? (
                  <div 
                    className="relative z-10"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized backend output (Phase 7)
                    dangerouslySetInnerHTML={{ __html: typeof window !== 'undefined' ? DOMPurify.sanitize(previewData.htmlContent) : previewData.htmlContent }}
                  />
                ) : (
                  <MarkdownSnippet 
                    content={previewData.description || ""} 
                    className="text-sm block"
                  />
                )}
                {!previewData.htmlContent && (!previewData.description || previewData.description === "No context available.") && (
                   <span className="italic opacity-60 flex items-center gap-2 mt-2"><FileText className="w-4 h-4" /> No content snippet available.</span>
                )}
              </div>
              
              {previewData.tags && previewData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-4 mt-2">
                  {previewData.tags.slice(0, 4).map((tag: string) => (
                    <span key={tag} className="text-[10px] font-medium text-foreground/70 bg-secondary/50 border border-border/50 rounded px-2 py-0.5 transition-colors hover:text-primary hover:border-primary/30">#{tag}</span>
                  ))}
                  {previewData.tags.length > 4 && (
                    <span className="text-[10px] font-medium text-muted-foreground/60 bg-transparent px-2 py-0.5">+{previewData.tags.length - 4}</span>
                  )}
                </div>
              )}
            </CardContent>

          </>
        ) : (
          <div className="p-8 flex flex-col items-center justify-center text-center gap-3">
             <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground/40 text-xl font-bold mb-1 ring-1 ring-border shadow-[var(--shadow-inner-glow)]">
                ?
             </div>
             <p className="text-base text-foreground font-semibold">Unknown Link</p>
             <p className="text-sm text-muted-foreground/70">This document hasn't been created yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
