"use server";

import { normalizeSlug, parseWikiLink, slugifyPath } from "@repo/utils";
import { getCachedFragmentPreview, getCachedPreviewPost, getCachedPreviewPostById } from "../../lib/preview-cache";

export async function getPostPreview(slug: string, id?: string) {
  try {
    // Extract fragment info from the original slug/href
    const linkInfo = parseWikiLink(slug);
    const fragment = linkInfo.fragment || "";

    // Initialize post variable
    let post = null;

    // 1. Prioritize direct ID lookup if provided (from data-document-id)
    if (id) {
      post = await getCachedPreviewPostById(id);
    }
    
    // 2. Fallback to slug-based resolution if ID lookup fails or is missing
    if (!post) {
      const mainPath = linkInfo.path;
      // Use normalizeSlug to handle /blog/ /docs/ etc. prefixes correctly
      const normalizedSlug = normalizeSlug(mainPath);

      post = await getCachedPreviewPost(normalizedSlug);
      
      if (!post && linkInfo.basename) {
        const fileNameSlug = slugifyPath(linkInfo.basename);
        if (fileNameSlug !== normalizedSlug) {
          post = await getCachedPreviewPost(fileNameSlug);
        }
      }
    }
    
    if (!post) {
      return null;
    }
    
    let description = post.description || "";
    let htmlContent = "";
    let isFragment = false;

    let fragmentType: 'heading' | 'block' | undefined;

    if (fragment) {
      const fragmentData = await getCachedFragmentPreview(post.id, fragment);
      if (fragmentData) {
        htmlContent = fragmentData.html;
        isFragment = true;
        fragmentType = fragmentData.type as 'heading' | 'block';
        
        // Use section title as a subheading or update description for context
        if (fragmentData.type === "heading" && fragmentData.title) {
          description = `Section: ${fragmentData.title}`;
        } else if (fragmentData.type === "block") {
          description = `Block Reference context from "${post.title}"`;
        }
      }
    }
    
    if (!description && post.content && !isFragment) {
      // ... (existing cleanup logic)
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
      slug: post.slug,
      description: description || "No context available.",
      area: post.area,
      status: post.isPublished ? 'published' : 'draft',
      tags: Array.isArray(post.metadata?.tags) ? post.metadata.tags : [],
      htmlContent: htmlContent || undefined,
      isFragment,
      fragmentType
    };
  } catch (error) {
    console.error("Failed to fetch post preview:", error);
    return null;
  }
}
