import { deepseek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { type UIMessage, convertToModelMessages, streamText } from "ai";
import os from "node:os";
import { isManagedSearchEnabled, managedCloudflareSearch } from "./managed-search";
import { hybridRetrieve } from "./retrieval";

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
export async function askQuestion(
	messages: UIMessage[],
	options?: { onFinish?: (text: string) => void },
) {
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

		// A) CLOUD MANAGED RAG MODE (Prioritized if enabled)
		if (isCloudSearch && query) {
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
		// B) LOCAL RAG MODE (Mac + MLX + Neon) - Fallback if Cloud is off
		else if (isLocal && query) {
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
		// C) PURE CHAT MODE
		else if (!isLocal) {
			console.log("☁️ [Cloud Mode] Bypassing RAG and using Cloudflare Gemma for standard chat assistance.");
		}

		// 2. Convert UIMessages to model-compatible format
		const modelMessages = await convertToModelMessages(messages);

		// 3. Selection: Should we use Cloudflare Workers AI or Deepseek?
		const forceCloud = process.env.FORCE_CLOUD_CHAT === "true";
		const useCloudflare = !isLocal || forceCloud;

		if (useCloudflare) {
			console.log("🤖 [MODEL] Route: Cloudflare Workers AI");
			// Cloudflare Mode (Uses Llama 3.1 8B)
			const accountId = process.env.CF_ACCOUNT_ID;
			const token = process.env.CF_AI_TOKEN;

			if (!accountId || !token) {
				throw new Error("CF_ACCOUNT_ID and CF_AI_TOKEN must be set in .env for VPS deployment.");
			}

			const cloudflare = createOpenAI({
				baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
				apiKey: token,
			});

			const result = streamText({
				model: cloudflare.chat("@cf/qwen/qwen3-30b-a3b-fp8"),
				system: SYSTEM_PROMPT.replace(
					"{{CONTEXT}}",
					context
						? `The following information was retrieved from the sparkle-codes knowledge base to assist you:\n---\n${context}\n---`
						: "No blog context available. Act as a pure technical chat assistant.",
				),
				messages: modelMessages,
				onFinish: ({ text }) => {
					if (options?.onFinish) {
						options.onFinish(text);
					}
				},
			});

			return result.toUIMessageStreamResponse();
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
			onFinish: ({ text }) => {
				if (options?.onFinish) {
					options.onFinish(text);
				}
			},
		});

		return result.toUIMessageStreamResponse();
	} catch (error) {
		console.error("❌ [AI SDK] askQuestion Critical Error:", error);
		throw error;
	}
}
