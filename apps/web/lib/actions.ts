"use server";

import { getPostBySlug } from "./blog";

/**
 * Server Action to fetch a full blog post by its slug.
 * Used for client-side prefetching on hover to ensure zero-latency transitions.
 */
export async function getBlogPostAction(slug: string) {
  try {
    const post = await getPostBySlug(slug);
    return { success: true, post };
  } catch (error) {
    console.error("Prefetch error for slug:", slug, error);
    return { success: false, error: "Failed to fetch post" };
  }
}
