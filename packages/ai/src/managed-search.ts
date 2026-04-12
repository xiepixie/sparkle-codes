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
	const accountId = process.env.CF_ACCOUNT_ID;
	const token = process.env.CF_AI_TOKEN;
	const autoragName = process.env.CF_AI_SEARCH_NAME;

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
			console.error(`❌ [Cloudflare AI Search] API Error: ${response.status} - ${errorText}`);
			return [];
		}

		const data: CloudflareSearchResult = await response.json();

		if (!data.success || !data.result?.data) {
			return [];
		}

		// Flatten the results into a unified format for the chat context
		return data.result.data.map((item) => ({
			title: item.filename,
			content: item.content.map((c) => c.text).join("\n\n"),
			score: item.score,
		}));
	} catch (error) {
		console.error("❌ [Cloudflare AI Search] Request failed:", error);
		return [];
	}
}

/**
 * Helper to check if managed search should be used
 */
export function isManagedSearchEnabled(): boolean {
	return (
		process.env.CF_AI_SEARCH_ENABLED === "true" &&
		os.platform() !== "darwin" // Prioritize local RAG on Mac
	);
}
