"use client";

import { useEffect } from "react";
import { prefetchBlogFeed, prefetchPost } from "@/lib/client-prefetch";

/**
 * BlogWarmup Component (Industrial Pre-warming)
 * 
 * Orchestrates background hydration of the blog ecosystem.
 * Strategic Priorities:
 * 1. ZERO Impact on LCP: Executes only during idle cycles.
 * 2. Network Empathy: Respects 'save-data' and bandwidth constraints.
 * 3. Predictive Preparation: Pre-warms both metadata feeds and top-post assets.
 */
export function BlogWarmup() {
  useEffect(() => {
    // 1. Guard: Check for data-saving preferences or extremely slow connections
    const connection = (navigator as any).connection;
    const isSlowConnection = connection && (connection.saveData || /2g/.test(connection.effectiveType));
    
    if (isSlowConnection) {
      return;
    }

    const startWarmup = () => {
      // 2. Phase I: Warm the Global Feed Metadata
      // Populates the internal feedCache, eliminating the 'Loading' state on /blog navigation.
      prefetchBlogFeed({ page: 1, pageSize: 5 })
        .then((result) => {
          if (!result || !result.posts) {
            return;
          }

          // 3. Phase II: Opportunistic Depth Pre-warming
          // Prefetch the top 2 'High-Probability' posts to ensure the Featured section is instant.
          const highProbabilityPosts = result.posts.slice(0, 2);
          for (const post of highProbabilityPosts) {
            // This seeds both the RSC payload cache and browser asset cache.
            prefetchPost(post.path);
          }
        })
        .catch(() => {
          // Silent catch for background operations
        });
    };

    // 4. Scheduling: Use Idle Callback with a 2s timeout to ensure non-blocking behavior.
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => startWarmup(), { timeout: 2000 });
    } else {
      // Fallback for browsers without RIC (safari < 16.4)
      const timer = setTimeout(startWarmup, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  return null; 
}
