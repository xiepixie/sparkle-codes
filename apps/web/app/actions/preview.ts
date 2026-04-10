"use server";

import { getCachedPreviewPost, getCachedFragmentPreview } from "../../lib/preview-cache";
import { parseWikiLink, slugifyPath } from "@repo/utils";

export async function getPostPreview(slug: string) {
  try {
    // 1. 使用协议层统一解析 (Layer 1: Resolution)
    // 注意：这里的 slug 可能是原始引用，也可能是已经处理过的 slug
    const linkInfo = parseWikiLink(slug);
    const mainPath = linkInfo.path;
    const fragment = linkInfo.fragment || "";
    
    // 2. 转换规范路径为 Web Slug (Layer 2: Slugify)
    const normalizedSlug = slugifyPath(mainPath);

    // 3. 尝试匹配文档
    // 优先尝试完整的 normalizedSlug（对应文件夹+文件名的层级 Slug）
    // 其次尝试纯文件名 Slug（Obsidian 习惯的短链匹配）
    let post = await getCachedPreviewPost(normalizedSlug);
    
    if (!post && linkInfo.basename) {
      const fileNameSlug = slugifyPath(linkInfo.basename);
      if (fileNameSlug !== normalizedSlug) {
        post = await getCachedPreviewPost(fileNameSlug);
      }
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
