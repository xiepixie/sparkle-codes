"use client";

import { useEffect } from "react";
import { prefetchBlogFeed } from "@/lib/client-prefetch";

/**
 * BlogWarmup Component
 * 
 * Automatically triggers a background pre-fetch of the blog feed
 * when the user arrives on the Home page. This populates the shared
 * client cache, making the transition to /blog instant.
 */
export function BlogWarmup() {
  useEffect(() => {
    // Initial warmup for the first page of the blog
    prefetchBlogFeed({ page: 1, pageSize: 5 }).catch(() => {});
  }, []);

  return null; // Invisible optimization
}
