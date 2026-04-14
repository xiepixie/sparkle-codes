import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../client";
import { documents, documentSections } from "../schema/knowledge";

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

export interface ExplorerNode {
  id: string;          // file cuid or path hash/key
  name: string;        // display name
  type: 'folder' | 'file';
  slug?: string;       // only for files
  vaultPath: string;   // full physical path
  displayPath: string; // breadcrumb path
  hasChildren: boolean;
  postCount?: number;
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

  const sortDate = sql`coalesce(${documents.publishedAt}, ${documents.createdAt})`;

  const orderBy = isSearch
    ? [desc(rank), desc(sortDate)]
    : [desc(sortDate)];

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
      updatedAt: documents.updatedAt,
      publishedAt: documents.publishedAt,
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
      updatedAt: documents.updatedAt,
      publishedAt: documents.publishedAt,
      contentLength: sql<number>`char_length(${documents.content})`,
    })
    .from(documents)
    .where(basePostFilter)
    .orderBy(desc(sql`coalesce(${documents.publishedAt}, ${documents.createdAt})`));
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
      updatedAt: documents.updatedAt,
      publishedAt: documents.publishedAt,
    })
    .from(documents)
    .where(basePostFilter)
    .orderBy(desc(sql`coalesce(${documents.publishedAt}, ${documents.createdAt})`));
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
      updatedAt: documents.updatedAt,
      publishedAt: documents.publishedAt,
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
        WHEN ${documents.title} ILIKE ${searchTarget} AND ${documents.area} = 'WORK' THEN 3
        WHEN ${documents.slug} = ${searchTarget} THEN 4
        WHEN ${documents.aliases} @> ${JSON.stringify([searchTarget])}::jsonb THEN 5
        WHEN ${documents.title} ILIKE ${searchTarget} THEN 6
        ELSE 7
      END
    `.as('match_priority')
  })
  .from(documents)
  .where(
    or(
      eq(documents.slug, searchTarget),
      sql`${documents.title} ILIKE ${searchTarget}`,
      sql`${documents.aliases} @> ${JSON.stringify([searchTarget])}::jsonb`,
      // Extra safety: handle cases where searchTarget was normalized but title is still literal
      sql`LOWER(${documents.title}) = LOWER(${searchTarget})`
    )
  )
  .orderBy(sql`match_priority`, desc(documents.isPublished), desc(sql`coalesce(${documents.publishedAt}, ${documents.createdAt})`))
  .limit(1);

  return results[0] || null;
}

/**
 * Find a single post by its UUID.
 * 🚀 High Performance: Direct primary key lookup.
 */
export async function getPostByIdQuery(id: string) {
  if (!id) {
    return null;
  }
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
      updatedAt: documents.updatedAt,
      publishedAt: documents.publishedAt,
      isPublished: documents.isPublished,
      area: documents.area,
      html: documents.html,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);

  return results[0] || null;
}

/**
 * Retrieve a specific section or block from a post for previews.
 * 🛡️ [Architecture] Handles both slugified heading IDs (h-) and block anchors (^).
 */
export async function getPostFragmentPreviewQuery(documentId: string, fragment: string) {
  // 1. Identify and normalize block references (stripping/adding ^ as needed)
  const isBlock = fragment.startsWith('^') ||  // Source contains ^
                  (!fragment.startsWith('h-') && fragment.length === 8); // Heuristic for block IDs in href
  
  if (isBlock) {
    const cleanBlockId = fragment.startsWith('^') ? fragment : `^${fragment}`;
    const block = await db.query.documentBlocks.findFirst({
      where: (blocks, { eq, and }) => and(
        eq(blocks.documentId, documentId),
        eq(blocks.blockId, cleanBlockId)
      )
    });
    return block ? { html: block.html, type: "block" } : null;
  }

  // 2. Identify Heading references (h- prefix or literal fallback)
  const section = await db.query.documentSections.findFirst({
    where: (sections, { eq, and, or, ilike }) => and(
      eq(sections.documentId, documentId),
      or(
        eq(sections.headingId, fragment),
        ilike(sections.headingText, fragment),
        // Fallback for cases where headingId might have been stored without the h- prefix (legacy)
        eq(sections.headingId, fragment.replace(/^h-/, ''))
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
/**
 * getExplorerNodesQuery - specialized query for Directory Explorer.
 * Implements lazily-loaded cascading panels by calculating nodes at a specific depth.
 */
export async function getExplorerNodesQuery(prefix = '工作领域/', depth = 1) {
  // 1. Calculate the 'split part' index.
  // Root '工作领域' is index 1.
  // PARA modules (项目, 归档 etc) are index 2 (depth 1).
  // Sub-folders are index 3 (depth 2) and so on.
  const partIndex = depth + 1;
  const prefixPattern = prefix.endsWith('/') ? prefix : `${prefix}/`;

  // We use a raw SQL query with sub-selects or distinct case-logic 
  // to correctly identify folders vs files at the target depth.
  const rawResults = await db.execute(sql`
    WITH RawNodes AS (
      SELECT 
        split_part("vaultPath", '/', ${partIndex}) as node_name,
        "vaultPath",
        "slug",
        "title",
        "isPublished",
        "id" as doc_id
      FROM documents
      WHERE "vaultPath" LIKE ${`${prefixPattern}%`}
        AND "area" = 'WORK'
        AND "isPublished" = true
    ),
    AggregatedNodes AS (
      SELECT 
        node_name,
        CASE 
          WHEN node_name LIKE '%.md' THEN 'file'
          ELSE 'folder'
        END as node_type,
        COUNT(*) as doc_count,
        MAX(doc_id) as first_id,
        MAX(slug) as first_slug,
        MAX(title) as first_title
      FROM RawNodes
      WHERE node_name IS NOT NULL AND node_name != ''
      GROUP BY node_name, node_type
    )
    SELECT 
      node_name,
      node_type,
      doc_count,
      first_slug,
      first_title,
      first_id
    FROM AggregatedNodes
    ORDER BY node_type DESC, node_name ASC
  `);

  return rawResults.rows.map((row: any) => {
    const isFile = row.node_type === 'file';
    const name = isFile ? row.node_name.replace(/\.md$/, '') : row.node_name;
    
    return {
      id: isFile ? row.first_id : `${prefix}${row.node_name}`,
      name: isFile ? (row.first_title || name) : name,
      type: row.node_type as 'folder' | 'file',
      slug: isFile ? row.first_slug : undefined,
      vaultPath: isFile ? `${prefix}${row.node_name}` : `${prefix}${row.node_name}/`,
      displayPath: `${prefix.replace('工作领域/', '')}${row.node_name}`,
      hasChildren: !isFile,
      postCount: row.doc_count
    } as ExplorerNode;
  });
}
