import { db, documents, and, eq, desc, sql } from "../index";

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
  return [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))];
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
    or coalesce(${documents.content}, '') ilike ${pattern}
  )`;
}

function buildSearchRank(query?: string) {
  const trimmed = query?.trim();
  if (!trimmed) {
    return sql<number>`0`;
  }

  const pattern = `%${trimmed}%`;
  return sql<number>`
    (
      case when ${documents.title} ilike ${pattern} then 8 else 0 end +
      case when coalesce(${documents.description}, '') ilike ${pattern} then 4 else 0 end +
      case when ${documents.slug} ilike ${pattern} then 3 else 0 end +
      case when coalesce(${documents.content}, '') ilike ${pattern} then 1 else 0 end
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
  const rank = buildSearchRank(options.query);

  const orderBy = options.query?.trim() 
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
      metadata: documents.metadata,
      createdAt: documents.createdAt,
      contentLength: sql<number>`char_length(${documents.content})`,
      totalCount: sql<number>`count(*) over()`,
      rank,
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
export async function getPostBySlugQuery(slug: string) {
  let post = await db.query.documents.findFirst({
    where: (docs, { eq, and }) => and(
        eq(docs.slug, slug),
        eq(docs.area, "WORK")
    ),
  });

  if (!post) {
      post = await db.query.documents.findFirst({
          where: (docs, { eq, and, or }) => and(
              or(
                  eq(docs.slug, slug),
                  sql`${docs.slug} LIKE ${'%-' + slug}`,
                  sql`${docs.slug} LIKE ${'%/' + slug}`
              ),
              eq(docs.area, "WORK")
          ),
          orderBy: [desc(documents.createdAt)]
      });
  }

  return post || null;
}
