import { db, sql } from "@repo/database";
import { tool } from "ai";
import { z } from "zod";
import { generateEmbedding } from "./embeddings";

export interface RetrievedChunk {
	chunk_id: string;
	document_id: string;
	chunk_index: number;
	heading_path: string;
	heading_id: string;
	chunk_text: string;
	rrf_score: number;
	doc_title: string;
	doc_slug: string;
}

/**
 * Hybrid Retrieval using RRF on Neon Postgres
 */
export async function hybridRetrieve(
	query: string,
	limit = 5,
): Promise<RetrievedChunk[]> {
	// 1. Generate Query Embedding via selected strategy (MLX or Cloudflare)
	const embedding = await generateEmbedding(query);

	// 2. Execute Hybrid Search (Vector + FTS) via RRF Stored Procedure
	const vectorStr = `[${embedding.join(",")}]`;

	const results = await db.execute(sql`
    SELECT 
      r.*,
      d.title as doc_title,
      d.slug as doc_slug
    FROM hybrid_search_rrf(${query}, ${vectorStr}::halfvec, ${limit}) r
    JOIN documents d ON d.id = r.document_id
  `);

	return results.rows as unknown as RetrievedChunk[];
}

/**
 * Technical Search Tool for the LLM
 */
export const searchTool = tool({
	description: "Search the Sparkle Codes blog for technical information.",
	parameters: z.object({
		query: z.string(),
	}),
	// @ts-expect-error: Bypass strict versioning checks in Vercel AI SDK vs local Zod
	execute: async ({ query }: { query: string }) => {
		console.log(`\n🔍 [RAG Search Initiated] Query: "${query}"`);

		try {
			const results = await hybridRetrieve(query);

			if (results.length > 0) {
				const uniqueDocs = [...new Set(results.map((r) => r.doc_title))];
				console.log(`✅ [RAG Success] Found ${results.length} relevant chunks`);
				console.log(`📂 [Source Documents] ${uniqueDocs.join(", ")}`);
				console.log(
					`📊 [Top Hit] Score: ${results[0].rrf_score.toFixed(4)} | Path: ${results[0].heading_path}\n`,
				);
			} else {
				console.warn(
					`⚠️ [RAG Warning] No chunks found for query: "${query}". Check embedding space or model path.\n`,
				);
			}

			return results.map((r, i) => ({
				id: i + 1,
				title: r.doc_title,
				slug: r.doc_slug,
				heading: r.heading_path,
				headingId: r.heading_id,
				content: r.chunk_text,
			}));
		} catch (error) {
			console.error(
				`❌ [RAG Critical Error] Failed to process query "${query}":`,
				error,
			);
			throw error;
		}
	},
});
