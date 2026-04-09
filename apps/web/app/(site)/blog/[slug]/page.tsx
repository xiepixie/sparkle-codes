// Post Page Component - High Performance Server Component with PPR.
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, ChevronLeft } from "lucide-react";
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
    .filter(p => p.path !== post.slug)
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
    <div className="starry-night-theme relative mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {/* Sticky Global Navigation - Managed Header */}
        <ReadingHeader 
          key={post.slug}
          slug={post.slug} 
          title={post.displayTitle || post.title} 
          suggestedPosts={suggestedPosts}
        />

        <div className="grid grid-cols-1 gap-y-12 lg:grid-cols-[1fr_min(72ch,100%)_1fr] lg:gap-x-16">
            {/* Sidebar Left: Navigation & Context (Commented out for next phase)
            <aside className="hidden lg:sticky lg:top-32 lg:block lg:h-fit lg:pt-12">
                <Link 
                  href="/blog"
                  className="group/back flex items-center gap-2 text-foreground/40 transition-colors hover:text-primary"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/40 bg-background/40 transition-all group-hover/back:border-primary/40 group-hover/back:bg-primary/5 group-hover/back:group-hover/back:shadow-glow-sm">
                    <ChevronLeft size={16} className="transition-transform group-hover/back:-translate-x-0.5" />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                    Back to Blog
                  </span>
                </Link>

                <div className="mt-12 space-y-8">
                    <div className="h-px w-8 bg-border/40" />
                </div>
            </aside>
            */}

            {/* Main Content Column */}
            <main className="min-w-0 lg:col-start-2 lg:pt-12">
                <header className="mb-12 flex flex-col sm:mb-20">
                    {/* Editorial Meta: Author, Date, Stats */}
                    <div className="flex flex-col gap-8 border-b border-border/40 pb-10 transition-opacity">
                        <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl lg:leading-[1.1]">
                            {post.displayTitle || post.title}
                        </h1>

                        <div className="flex flex-wrap items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="flex -space-x-2">
                                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-background/80 to-muted/20 text-[10px] font-bold text-primary shadow-glow-sm transition-transform hover:scale-105">
                                        {post.authorName?.charAt(0) || "S"}
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold tracking-tight text-foreground/90">{post.authorName}</span>
                                    <div className="flex items-center gap-2 text-[10px] font-medium tracking-wider text-foreground/40 font-mono">
                                        <Calendar size={10} className="opacity-40" />
                                        <time dateTime={post.date}>{formattedDate}</time>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex h-1.5 w-1.5 rounded-full bg-emerald-500/40 shadow-glow-sm" title="Post is live" />
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/20">
                                    Editorial Insight
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Taxonomy: Progressive Tag Interaction */}
                    <div className="mt-8 flex flex-wrap items-center gap-2">
                        {post.tags.map((tag: string) => (
                            <Link 
                                href={`/blog?tag=${encodeURIComponent(tag)}`}
                                key={tag} 
                                className="group/tag relative overflow-hidden rounded-full border border-border/40 bg-background/40 px-3 py-1 transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-glow-xs active:scale-95"
                            >
                                <span className="relative z-10 text-[10px] font-bold tracking-wide text-foreground/50 transition-colors group-hover/tag:text-primary">
                                    # {tag}
                                </span>
                            </Link>
                        ))}
                    </div>

                    {post.description && (
                        <div className="group relative mt-12 rounded-3xl border border-border/40 bg-background/30 p-8 shadow-ambient transition-all hover:bg-background/50">
                            {/* Subtle Accent Line */}
                            <div className="absolute left-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-r-full bg-primary/20 transition-colors group-hover:bg-primary/40" />
                            
                            <div className="absolute left-8 top-0 -translate-y-1/2 rounded-full border border-border/60 bg-background px-4 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-primary shadow-glow-sm">
                                TL;DR
                            </div>
                            <p className="text-[15px] leading-relaxed text-foreground/80 font-medium selection:bg-primary/20">
                                {post.description}
                            </p>
                        </div>
                    )}
                </header>

                <article className="prose prose-starry prose-invert max-w-none">
                    <MarkdownInteractivity 
                      html={post.body.html || ""} 
                      currentSlug={slug}
                      currentPostMeta={{
                        title: post.displayTitle || post.title,
                        description: post.description || undefined,
                        area: post.area,
                        status: post.status,
                        tags: post.tags,
                      }}
                    />
                </article>

                <footer className="mt-20 flex flex-col items-center gap-12 border-t border-border/40 pt-16 sm:mt-32">
                    <Link 
                      href="/blog"
                      className="group/footer-btn relative flex items-center gap-3 overflow-hidden rounded-full border border-border/60 bg-background px-12 py-5 text-sm font-bold tracking-widest transition-all hover:border-primary/60 hover:shadow-glow-sm active:scale-95 lg:hidden"
                    >
                      <ChevronLeft size={18} className="transition-transform group-hover/footer-btn:-translate-x-1" />
                      BACK TO BLOG
                    </Link>

                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-foreground/20">
                            The End of Interaction
                        </div>
                        <div className="h-px w-24 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                    </div>
                </footer>
            </main>

            {/* Sidebar Right: Metadata & Stats (Commented out for next phase)
            <aside className="hidden lg:sticky lg:top-32 lg:block lg:h-fit lg:pt-12">
                <div className="space-y-12">
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/30">Metadata</h4>
                        <div className="rounded-2xl border border-border/40 bg-background/20 p-4 shadow-ambient">
                             <div className="flex flex-col gap-3">
                                 <div className="flex justify-between text-[10px]">
                                     <span className="text-foreground/40">Format</span>
                                     <span className="font-mono text-primary/60 uppercase tracking-tighter">MDX / SSR</span>
                                 </div>
                                 <div className="flex justify-between text-[10px]">
                                     <span className="text-foreground/40">Status</span>
                                     <span className="font-mono text-emerald-400 capitalize">Published</span>
                                 </div>
                             </div>
                        </div>
                    </div>
                </div>
            </aside>
            */}
        </div>
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
  try {
    const allPosts = await getAllPostSummaries();

    if (allPosts.length === 0) {
      return [{ slug: BUILD_PLACEHOLDER_SLUG }];
    }

    return allPosts.map((post) => ({
      slug: post.path,
    }));
  } catch (err) {
    console.error("[BUILD] generateStaticParams failed, falling back to empty paths to allow build to continue.", err);
    return [{ slug: BUILD_PLACEHOLDER_SLUG }];
  }
}
