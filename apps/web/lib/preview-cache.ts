import { getPostBySlugQuery, getPostFragmentPreviewQuery } from "@repo/database/queries/posts";
import { cacheLife, cacheTag } from "next/cache";

export async function getCachedPreviewPost(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts", `preview-${slug}`);
  return await getPostBySlugQuery(slug);
}

export async function getCachedFragmentPreview(documentId: string, fragment: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts", `fragment-${documentId}-${fragment}`);
  return await getPostFragmentPreviewQuery(documentId, fragment);
}
