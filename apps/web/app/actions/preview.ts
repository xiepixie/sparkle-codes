"use server";

import { getCachedPreviewPost, getCachedFragmentPreview } from "../../lib/preview-cache";

export async function getPostPreview(slug: string) {
  try {
    let mainSlug = slug;
    let fragment = "";
    
    if (slug.includes('#')) {
      const parts = slug.split('#');
      mainSlug = parts[0];
      fragment = parts.slice(1).join('#');
    }

    // The slug may be a full Obsidian vault path (e.g. "Documents/I.P.A.R.A/工作领域/项目/知识提取")
    // but the DB stores slugified filenames (e.g. "知识提取").
    // Try the full slug first (exact match), then fall back to the filename portion.
    let post = await getCachedPreviewPost(mainSlug);
    
    if (!post && mainSlug.includes('/')) {
      const fileNameSlug = mainSlug.split('/').pop() || mainSlug;
      post = await getCachedPreviewPost(fileNameSlug);
    }
    
    if (!post) {
      return null;
    }
    
    let description = post.description || "";
    let htmlContent = "";
    let isFragment = false;

    if (fragment) {
      const fragmentData = await getCachedFragmentPreview(post.id, fragment);
      if (fragmentData) {
        htmlContent = fragmentData.html;
        isFragment = true;
        
        // Use section title as a subheading or update description for context
        if (fragmentData.type === "heading" && fragmentData.title) {
          description = `Section: ${fragmentData.title}`;
        } else if (fragmentData.type === "block") {
          description = `Block Reference context from "${post.title}"`;
        }
      }
    }
    
    if (!description && post.content && !isFragment) {
      // Smart cleanup for preview snippet:
      // Strip frontmatter, headers, links, and compact white space
      description = post.content
        .replace(/^---[\s\S]*?---/, '') // Strip frontmatter
        .replace(/#+\s+/g, '')          // Strip header symbols
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Clean standard links
        .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_: string, p: string, l: string) => l || p) // Clean WikiLinks
        .replace(/[`*~_]/g, '')         // Strip simple styling
        .replace(/\s+/g, ' ')           // Compact whitespace
        .trim()
        .slice(0, 180);
      
      if (description.length >= 180) {
        description = `${description.trim()}...`;
      }
    }
    
    return {
      title: post.title,
      description: description || "No context available.",
      area: post.area,
      status: post.isPublished ? 'published' : 'draft',
      tags: Array.isArray(post.metadata?.tags) ? post.metadata.tags : [],
      htmlContent: htmlContent || undefined,
      isFragment
    };
  } catch (error) {
    console.error("Failed to fetch post preview:", error);
    return null;
  }
}
