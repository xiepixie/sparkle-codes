import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { getPostBySlug, getAllPostSummaries } from "@/lib/blog";
import { ReadingHeader } from "@/components/ReadingHeader";

/**
 * Technical Post Page - High Performance Server Component.
 * Optimized for React 19 / Turbopack with BFCache support.
 */

import { MarkdownInteractivity } from "@/components/markdown-interactivity";

const BUILD_PLACEHOLDER_SLUG = "__build-placeholder__";

interface PostPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  if (slug === BUILD_PLACEHOLDER_SLUG) {
    notFound();
  }

  // 🚀 Fetch post from DB
  const post = await getPostBySlug(slug);

  if (!post) {
    console.error(`[SLUG ERROR] Post not found for decoded slug: ${slug}`);
    notFound();
  }

  // Fetch some suggested posts as fallback for reading history from the global cache
  const allPosts = await getAllPostSummaries();
  const suggestedPosts = allPosts
    .filter(p => p.path !== slug)
    .slice(0, 10)
    .map(p => ({
      slug: p.path,
      title: p.displayTitle || p.title
    }));
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(post.date));

  return (
    <div className="starry-night-theme relative mx-auto max-w-4xl overflow-hidden px-4 py-6 sm:px-6 sm:py-10 lg:py-16">
        {/* Sticky Global Navigation - Managed Header */}
        <ReadingHeader 
          slug={slug} 
          title={post.displayTitle || post.title} 
          suggestedPosts={suggestedPosts}
        />

        {/* Minimalist Metadata Layer - All identity is now in the Atlas Command Bar */}
        <header className="mb-12 flex flex-col px-1 pt-16 sm:mb-16 sm:px-4 sm:pt-20">
            <div className="flex flex-col gap-4 border-b border-border/50 py-4 opacity-90 transition-opacity hover:opacity-100 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-4">
                    {/* Unified Premium Tags */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {post.tags.map((tag: string) => (
                            <span key={tag} className="premium-tag md-hashtag">
                                #{tag}
                            </span>
                        ))}
                    </div>

                    <div className="hidden h-3 w-[1px] bg-border/60 sm:block" />

                    {/* Published Date */}
                    <div className="flex items-center gap-2 text-foreground/40 font-mono text-[10px] tracking-[0.1em] font-medium leading-none whitespace-nowrap">
                        <Calendar size={12} className="opacity-30" />
                        <time dateTime={post.date}>
                            {formattedDate}
                        </time>
                    </div>

                    <div className="hidden h-3 w-[1px] bg-border/60 sm:block" />

                    {/* Author Attribution */}
                    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.2em] text-foreground/40">
                        <span className="opacity-20">BY</span>
                        <span className="text-foreground/60">{post.authorName}</span>
                    </div>
                </div>

                <div className="hidden items-center gap-2 rounded-full border border-border/50 bg-background/50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 md:flex">
                    Reading mode
                </div>
            </div>

            {post.description && (
              <div className="group relative mt-8 rounded-[1.75rem] border border-border/50 bg-background/40 p-6 shadow-glow-sm transition-all hover:border-primary/20 hover:bg-background/60 sm:mt-10 sm:rounded-[2rem] sm:p-8">
                  <div className="absolute left-5 top-0 -translate-y-1/2 rounded-full border border-border/60 bg-background px-3 py-1 text-[9px] font-bold uppercase tracking-[0.32em] text-primary shadow-glow-sm sm:left-8 sm:px-4 sm:tracking-[0.4em]">
                      Abstract
                  </div>
                  <p className="text-[14px] italic leading-[1.75] text-muted-foreground font-medium [overflow-wrap:anywhere] sm:text-[15px]">
                      {post.description}
                  </p>
              </div>
            )}
        </header>

        {/* Immersive Reading Layer */}
        <article>
            <MarkdownInteractivity html={post.body.html || ""} />
        </article>

        {/* Simple Navigation Footer */}
        <footer className="mt-20 border-t border-border pt-10 sm:mt-24 sm:pt-12">
            <div className="flex flex-col gap-6 rounded-2xl border border-border/50 bg-muted/30 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">About the Author</p>
                <div className="font-semibold text-lg">{post.authorName}</div>
              </div>
              <Link 
                href="/blog"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-6 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Back to Blog
              </Link>
            </div>
        </footer>
    </div>
  );
}

/**
 * generateMetadata - Dynamic SEO metadata.
 * `getPostBySlug` is cached across generateMetadata and Page components.
 */
export async function generateMetadata({ params }: PostPageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  if (slug === BUILD_PLACEHOLDER_SLUG) {
    return {
      title: "Post Not Found | Sparkle Insights",
    };
  }

  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: "Post Not Found | Sparkle Insights",
    };
  }

  return {
    title: `${post.displayTitle || post.title} | Sparkle Insights`,
    description: post.description || "Deep dive into modern architecture, AI interaction, and content engineering.",
    openGraph: {
      type: "article",
      title: post.displayTitle || post.title,
      description: post.description || undefined,
      publishedTime: post.date,
      tags: post.tags,
      authors: [post.authorName],
    },
    twitter: {
      card: "summary_large_image",
      title: post.displayTitle || post.title,
      description: post.description || undefined,
    },
  };
}

/**
 * generateStaticParams - Build-time static path generation.
 * Uses cached shared summaries for maximum build performance.
 */
export async function generateStaticParams() {
   const allPosts = await getAllPostSummaries();

   if (allPosts.length === 0) {
     return [{ slug: BUILD_PLACEHOLDER_SLUG }];
   }

   return allPosts.map((post) => ({
     slug: post.path,
   }));
}
