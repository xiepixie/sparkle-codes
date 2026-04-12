import { createOpenAI } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import type { UIMessage } from "ai";
import { convertToModelMessages, streamText } from "ai";
import { hybridRetrieve } from "./retrieval";
import { managedCloudflareSearch, isManagedSearchEnabled } from "./managed-search";
import os from "node:os";

const SYSTEM_PROMPT = `You are Sparkle AI (✨), the elite technical assistant for Sparkle Codes.
    
KNOWLEDGE BASE CONTEXT:
{{CONTEXT}}

2. CITATIONS: When using blog context, you MUST append a citation using the provided Wiki-link. 
   Formula: [[slug#headingId|Display Title]]
   Example: "[[appium-login-guide#h-page-object-model|Appium 登录自动化]]"
   (The part before | is the canonical slug and heading ID. Use the Title or Heading text as the display alias after |).
3. TONE: Concise, technical, and professional. Avoid fluff. Use code snippets where applicable.
4. LANGUAGE: Respond in the language used by the user. Default to Chinese if unclear.`;

/**
 * Ask a question with RAG-enhanced tool calling
 */
export async function askQuestion(messages: UIMessage[]) {
	console.log(
		`🚀 [AI SDK] askQuestion initiated with ${messages.length} messages`,
	);

	try {
		const isLocal = os.platform() === "darwin";
		const isCloudSearch = isManagedSearchEnabled();
		let context = "";

		const lastUserMessage = messages
			.slice()
			.reverse()
			.find((m) => m.role === "user");

		const query = lastUserMessage
			? lastUserMessage.parts
					?.filter((p: any) => p.type === "text")
					.map((p: any) => p.text)
					.join("") ||
			  (lastUserMessage as any).content ||
			  ""
			: "";

		// A) LOCAL RAG MODE (Mac + MLX + Neon)
		if (isLocal && query) {
			console.log(`\n🔍 [Local MLX RAG] Triggering retrieval for: "${query.substring(0, 50)}..."`);
			try {
				const results = await hybridRetrieve(query);
				if (results && results.length > 0) {
					console.log(`✅ [Local MLX RAG] Found ${results.length} relevant chunks`);
					context = results
						.map(
							(r) =>
								`[Context Section: [[${r.doc_slug}#${r.heading_id}|${r.doc_title} > ${r.heading_path}]]]\n${r.chunk_text}`,
						)
						.join("\n\n---\n\n");
				} else {
					console.log("⚠️ [Local MLX RAG] No relevant context found in database.");
				}
			} catch (retrievalError) {
				console.error("❌ [Local MLX RAG] Context retrieval failed:", retrievalError);
			}
		} 
		// B) CLOUD MANAGED RAG MODE (VPS + Cloudflare AI Search)
		else if (isCloudSearch && query) {
			console.log(`\n☁️ [Cloud Managed RAG] Triggering Cloudflare AI Search for: "${query.substring(0, 50)}..."`);
			try {
				const results = await managedCloudflareSearch(query);
				if (results && results.length > 0) {
					console.log(`✅ [Cloud Managed RAG] Found ${results.length} relevant documents`);
					context = results
						.map(
							(r) =>
								`[Context Document: ${r.title}]\n${r.content}`
						)
						.join("\n\n---\n\n");
				} else {
					console.log("⚠️ [Cloud Managed RAG] No relevant context found in Cloudflare index.");
				}
			} catch (searchError) {
				console.error("❌ [Cloud Managed RAG] Search failed:", searchError);
			}
		}
		// C) PURE CHAT MODE
		else if (!isLocal) {
			console.log("☁️ [Cloud Mode] Bypassing RAG and using Cloudflare Gemma for standard chat assistance.");
		}

		// 2. Convert UIMessages to model-compatible format
		const modelMessages = await convertToModelMessages(messages);

		// 3. Cloudflare Mode vs Local Mode Output Generation
		if (!isLocal) {
			// Cloudflare Mode (Uses Gemma 4 MoE)
			const accountId = process.env.CF_ACCOUNT_ID;
			const token = process.env.CF_AI_TOKEN;

			if (!accountId || !token) {
				throw new Error("CF_ACCOUNT_ID and CF_AI_TOKEN must be set in .env for VPS deployment.");
			}

			const cloudflareAI = createOpenAI({
				baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
				apiKey: token,
			});

			const result = streamText({
				model: cloudflareAI("@cf/google/gemma-4-26b-a4b-it"),
				system: SYSTEM_PROMPT.replace(
					"{{CONTEXT}}",
					context
						? `The following information was retrieved from the sparkle-codes knowledge base to assist you:\n---\n${context}\n---`
						: "No blog context available. Act as a pure technical chat assistant.",
				),
				messages: modelMessages,
			});

			return result.toTextStreamResponse();
		}

		// Local Mode (With RAG context, and Deepseek)
		const modelId = process.env.GENERATION_MODEL || "deepseek-chat";
		const result = streamText({
			model: deepseek(modelId),
			system: SYSTEM_PROMPT.replace(
				"{{CONTEXT}}",
				context
					? `The following information was retrieved from the sparkle-codes blog to assist you:\n---\n${context}\n---`
					: "No blog context found for this query.",
			),
			messages: modelMessages,
		});

		return result.toTextStreamResponse();
	} catch (error) {
		console.error("❌ [AI SDK] askQuestion Critical Error:", error);
		throw error;
	}
}
