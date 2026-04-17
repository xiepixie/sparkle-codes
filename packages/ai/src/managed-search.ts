import { db, documents, eq } from "@repo/database";
import os from "node:os";

/**
 * Cloudflare AI Search (Managed RAG) Implementation
 * Uses Cloudflare's fully managed search service (formerly AutoRAG).
 *
 * Documentation: https://developers.cloudflare.com/ai-search/usage/rest-api
 */
export interface CloudflareSearchResult {
	success: boolean;
	result: {
		data: Array<{
			filename: string;
			score: number;
			content: Array<{
				text: string;
			}>;
		}>;
	};
}

/**
 * Perform a managed search using Cloudflare AI Search REST API
 */
export async function managedCloudflareSearch(query: string) {
	const accountId = process.env.CF_ACCOUNT_ID?.replace(/['"]/g, "");
	const token = process.env.CF_AI_TOKEN?.replace(/['"]/g, "");
	const autoragName = process.env.CF_AI_SEARCH_NAME?.replace(/['"]/g, "");

	if (!accountId || !token || !autoragName) {
		console.log(
			"ℹ️ [Managed Search] Bypassing: CF_ACCOUNT_ID, CF_AI_TOKEN, or CF_AI_SEARCH_NAME not set.",
		);
		return [];
	}

	try {
		console.log(`🔍 [Cloudflare AI Search] Querying index: ${autoragName}`);

		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/autorag/rags/${autoragName}/search`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query,
					max_num_results: 5,
					reranking: { enabled: true, model: "@cf/baai/bge-reranker-base" },
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(
				`❌ [Cloudflare AI Search] API Error: ${response.status} - ${errorText}`,
			);
			return [];
		}

		const data: CloudflareSearchResult = await response.json();

		if (!data.success || !data.result?.data) {
			return [];
		}

		// Flatten the results into a unified format for the chat context and resolve titles
		const results = await Promise.all(
			data.result.data.map(async (item) => {
				console.log(`📄 [Cloudflare AI Search] Mapping item: ${item.filename}`, {
					score: item.score,
					attributes: (item as any).attributes, // Log attributes to see if 'title' exists
				});

				// Extract slug from URL if it's a sparkle.codes link
				let slug = item.filename;
				try {
					if (item.filename.startsWith("http")) {
						const url = new URL(item.filename);
						const parts = url.pathname.split("/").filter(Boolean);
						slug = parts[parts.length - 1] || item.filename;
					}
				} catch (_e) {
					console.warn(
						"[Managed Search] Failed to parse slug from filename:",
						item.filename,
					);
				}

				// Attempt to find the real document title and its sections (headings) from Neon DB
				let docTitle = (item as any).attributes?.file?.title || (item as any).attributes?.title || null;
				let headings: { id: string; text: string }[] = [];

				try {
					const doc = await db.query.documents.findFirst({
						where: eq(documents.slug, slug),
						columns: { title: true, id: true },
						with: {
							sections: {
								columns: { headingId: true, headingText: true },
							},
						},
					});

					if (doc) {
						if (!docTitle) docTitle = doc.title;
						headings = doc.sections
							.filter((s) => s.headingId)
							.map((s) => ({
								id: s.headingId as string,
								text: s.headingText,
							}));
					}
				} catch (dbError) {
					console.error(
						`[Managed Search] Database lookup failed for slug ${slug}:`,
						dbError,
					);
				}

				return {
					title: docTitle, // Real doc_title from DB or Attributes
					filename: item.filename, // Original URL/Path
					slug: slug,
					content: item.content.map((c) => c.text).join("\n\n"),
					score: item.score,
					headings, // List of section IDs and labels
				};
			}),
		);

		return results;
	} catch (error) {
		console.error("❌ [Cloudflare AI Search] Request failed:", error);
		return [];
	}
}

/**
 * Helper to check if managed search should be used
 */
export function isManagedSearchEnabled(): boolean {
	// Respect the explicit toggle first
	if (process.env.CF_AI_SEARCH_ENABLED === "true") {
		return true;
	}
	// Fallback to platform check only if not explicitly enabled
	return (
		process.env.CF_AI_SEARCH_ENABLED !== "false" &&
		os.platform() !== "darwin"
	);
}
