"use client";

/**
 * Industrial-grade Client-side Prefetch Controller
 * 
 * Provides a unified way to warm up both listing and detail caches
 * before the user even clicks a link.
 */

interface CachedFeedEntry {
  expiresAt: number;
  result: any;
}

const FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const feedCache = new Map<string, CachedFeedEntry>();
const inflightRequests = new Map<string, Promise<any>>();

/**
 * Warm up the blog feed listing in the background.
 * Prevents the white-flash or loading delay when clicking "Read the blog".
 */
export async function prefetchBlogFeed(params: {
  query?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const key = JSON.stringify({
    query: (params.query || "").trim().toLowerCase(),
    tags: [...new Set((params.tags || []).map(t => t.toLowerCase()))].sort(),
    page: params.page || 1,
    pageSize: params.pageSize || 5
  });

  const now = Date.now();
  const cached = feedCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const searchParams = new URLSearchParams();
  if (params.query) {
    searchParams.set("query", params.query);
  }

  if (params.tags) {
    for (const tag of params.tags) {
      searchParams.append("tag", tag);
    }
  }

  searchParams.set("page", String(params.page || 1));
  searchParams.set("pageSize", String(params.pageSize || 5));

  const promise = (async () => {
    try {
      const response = await fetch(`/api/blog-search?${searchParams.toString()}`, {
        priority: "low"
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      feedCache.set(key, {
        expiresAt: Date.now() + FEED_CACHE_TTL_MS,
        result: data
      });
      return data;
    } catch (_error) {
      return null;
    } finally {
      inflightRequests.delete(key);
    }
  })();

  inflightRequests.set(key, promise);
  return promise;
}

/**
 * Access the underlying cache for hydration in components.
 */
export function getPrefetchedFeed(key: string) {
  const cached = feedCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  return null;
}

/**
 * Detail Page Prefetching
 */
export async function prefetchPost(_slug: string) {
  // We use Next.js's built-in router prefetch for RSC payload, 
  // but we can also hit the API or just rely on the router.
  // In our case, the router prefetch is very efficient because getPostBySlug is cached on server.
}
