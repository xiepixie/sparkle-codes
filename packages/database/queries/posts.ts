import { db, documents, documentSections, and, or, eq, desc, sql } from "../index";

/**
 * Common Post Filter - Work Area & Published
 */
export const basePostFilter = and(
  eq(documents.isPublished, true),
  eq(documents.area, "WORK")
);

export interface QueryPostSummariesOptions {
  page?: number;
  pageSize?: number;
  query?: string;
  tags?: string[];
}

function normalizeTags(tags?: string[]) {
  return [...new Set((tags || []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function buildTagFilter(tags?: string[]) {
  const normalizedTags = normalizeTags(tags);
  if (normalizedTags.length === 0) {
    return undefined;
  }

  return sql`${documents.metadata} @> ${JSON.stringify({ tags: normalizedTags })}::jsonb`;
}

function buildSearchFilter(query?: string) {
  const trimmed = query?.trim();
  if (!trimmed) {
    return undefined;
  }

  const pattern = `%${trimmed}%`;
  return sql`(
    ${documents.title} ilike ${pattern}
    or coalesce(${documents.description}, '') ilike ${pattern}
    or ${documents.slug} ilike ${pattern}
    or ${documents.content} ilike ${pattern}
  )`;
}

function buildSearchRank(query?: string) {
  const trimmed = query?.trim();
  if (!trimmed) {
    // Return a constant that actually exists in the target list if needed, 
    // or just return 0 to be used in select.
    return sql<number>`0`;
  }

  const pattern = `%${trimmed}%`;
  return sql<number>`
    (
      case when ${documents.slug} ilike ${pattern} then 12 else 0 end +
      case when ${documents.title} ilike ${pattern} then 8 else 0 end +
      case when coalesce(${documents.description}, '') ilike ${pattern} then 4 else 0 end +
      case when ${documents.content} ilike ${pattern} then 1 else 0 end
    )
  `;
}

/**
 * Unified paginated post query supporting search + multi-tag filtering.
 * Tags use jsonb containment, so a post must contain every selected tag.
 */
export async function queryPostSummariesQuery(options: QueryPostSummariesOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.max(1, Math.min(50, options.pageSize || 5));
  const whereClause = and(
    basePostFilter,
    buildSearchFilter(options.query),
    buildTagFilter(options.tags),
  );
  
  const isSearch = !!options.query?.trim();
  const rank = buildSearchRank(options.query);

  const orderBy = isSearch
    ? [desc(rank), desc(documents.createdAt)]
    : [desc(documents.createdAt)];

  return await db
    .select({
      id: documents.id,
      slug: documents.slug,
      title: documents.title,
      description: documents.description,
      banner: documents.banner,
      content: documents.content,
      html: documents.html,
      metadata: documents.metadata,
      createdAt: documents.createdAt,
      contentLength: sql<number>`char_length(${documents.content})`,
      totalCount: sql<number>`count(*) over()`,
      rank: rank.as('search_rank'), // Give it an alias for clarity
    })
    .from(documents)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

/**
 * Fetch a single page of post summaries (paginated).
 * Uses SQL window functions for a single-round-trip count + data fetch.
 */
export async function getPostsPageQuery(page = 1, pageSize = 5, query?: string) {
  return await queryPostSummariesQuery({ page, pageSize, query });
}

/**
 * Fetch all summaries for local-first search.
 */
export async function getAllPostSummariesQuery() {
  return await db
    .select({
      id: documents.id,
      slug: documents.slug,
      title: documents.title,
      description: documents.description,
      banner: documents.banner,
      metadata: documents.metadata,
      createdAt: documents.createdAt,
      contentLength: sql<number>`char_length(${documents.content})`,
    })
    .from(documents)
    .where(basePostFilter)
    .orderBy(desc(documents.createdAt));
}

/**
 * Fetch all posts with raw content for local-first full-text search.
 */
export async function getAllPostsForSearchQuery() {
  return await db
    .select({
      id: documents.id,
      slug: documents.slug,
      title: documents.title,
      description: documents.description,
      content: documents.content,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(basePostFilter)
    .orderBy(desc(documents.createdAt));
}

/**
 * Search published WORK-area posts directly from Neon.
 * We rank title/description matches above body-only matches to keep results useful.
 */
export async function searchPostsQuery(query: string, limit = 8) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  return await queryPostSummariesQuery({
    query: trimmed,
    page: 1,
    pageSize: limit,
  });
}

/**
 * Find a single post by slug, handling both exact matches and partial paths.
 */
/**
 * Find a single post by slug, handling exact matches, aliases, and partial paths.
 * 🚀 Industrial Optimization: Single round-trip query with priority-based ranking.
 */
export async function getPostBySlugQuery(slug: string) {
  const [mainSlug] = slug.split('#');
  if (!mainSlug) {
    return null;
  }

  const searchTarget = mainSlug;

  // Unified query with scoring for performance
  const results = await db
    .select({
      id: documents.id,
      slug: documents.slug,
      title: documents.title,
      description: documents.description,
      banner: documents.banner,
      content: documents.content,
      metadata: documents.metadata,
      createdAt: documents.createdAt,
      isPublished: documents.isPublished,
      area: documents.area,
      html: documents.html,
    // Priority hierarchy for resolution (Obsidian-aligned):
    // 1. Exact Slug Match (WORK) -> Most specific
    // 2. Alias Match (WORK)      -> Explicitly defined intent
    // 3. Title Match (WORK)      -> Document name
    // 4. Exact Slug Match (Any)  -> Fallback to other areas
    // 5. Alias Match (Any)       -> Fallback
    // 6. Title Match (Any)       -> Fallback
    priority: sql<number>`
      CASE 
        WHEN ${documents.slug} = ${searchTarget} AND ${documents.area} = 'WORK' THEN 1
        WHEN ${documents.aliases} @> ${JSON.stringify([searchTarget])}::jsonb AND ${documents.area} = 'WORK' THEN 2
        WHEN ${documents.title} = ${searchTarget} AND ${documents.area} = 'WORK' THEN 3
        WHEN ${documents.slug} = ${searchTarget} THEN 4
        WHEN ${documents.aliases} @> ${JSON.stringify([searchTarget])}::jsonb THEN 5
        WHEN ${documents.title} = ${searchTarget} THEN 6
        ELSE 7
      END
    `.as('match_priority')
  })
  .from(documents)
  .where(
    or(
      eq(documents.slug, searchTarget),
      eq(documents.title, searchTarget),
      sql`${documents.aliases} @> ${JSON.stringify([searchTarget])}::jsonb`
    )
  )
  .orderBy(sql`match_priority`, desc(documents.isPublished), desc(documents.createdAt))
  .limit(1);

  return results[0] || null;
}

/**
 * Retrieve a specific section or block from a post.
 */
export async function getPostFragmentPreviewQuery(documentId: string, fragment: string) {
  if (fragment.startsWith('^')) {
    const block = await db.query.documentBlocks.findFirst({
      where: (blocks, { eq, and }) => and(
        eq(blocks.documentId, documentId),
        eq(blocks.blockId, fragment)
      )
    });
    return block ? { html: block.html, type: "block" } : null;
  }

  // Obsidian often doesn't store exact ID matching for heading in link, but we'll try exact match first
  const section = await db.query.documentSections.findFirst({
    where: (sections, { eq, and, or, ilike }) => and(
      eq(sections.documentId, documentId),
      or(
        eq(sections.headingId, fragment),
        ilike(sections.headingText, fragment)
      )
    )
  });
  return section ? { html: section.html, type: "heading", title: section.headingText } : null;
}

/**
 * Internal SQL fragment to search across sections and blocks.
 */
function buildSectionSearchFilter(query: string) {
  const pattern = `%${query}%`;
  return sql`(
    ${documentSections.headingText} ilike ${pattern} 
    or ${documentSections.textContent} ilike ${pattern}
  )`;
}

/**
 * Search across all document sections to find specific hits.
 */
export async function searchPostSectionsQuery(query: string, limit = 20) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  return await db
    .select({
      id: documentSections.id,
      documentId: documentSections.documentId,
      slug: documents.slug,
      title: documents.title,
      headingId: documentSections.headingId,
      headingText: documentSections.headingText,
      textContent: documentSections.textContent,
      html: documentSections.html,
      headingLevel: documentSections.headingLevel,
      // Priority: heading match > content match
      rank: sql<number>`
        CASE 
          WHEN ${documentSections.headingText} ilike ${`%${trimmed}%`} THEN 10
          ELSE 1
        END
      `.as('section_rank')
    })
    .from(documentSections)
    .innerJoin(documents, eq(documentSections.documentId, documents.id))
    .where(
      and(
        basePostFilter,
        buildSectionSearchFilter(trimmed)
      )
    )
    .orderBy(sql`section_rank desc`, desc(documents.createdAt))
    .limit(limit);
}
