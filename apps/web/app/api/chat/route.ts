import crypto from "node:crypto";
import { askQuestion } from "@repo/ai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export const maxDuration = 60;

const MAX_MESSAGES = 50;
const MAX_PROMPT_LENGTH = 4000;

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const messages = body?.messages;

		// Basic input validation to prevent abuse and resource exhaustion.
		if (!Array.isArray(messages) || messages.length === 0) {
			return new Response(
				JSON.stringify({
					error: "Invalid request: messages array is required.",
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		if (messages.length > MAX_MESSAGES) {
			return new Response(
				JSON.stringify({
					error: `Too many messages. Maximum is ${MAX_MESSAGES}.`,
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		const lastMsg = messages[messages.length - 1];

		// Polymorphic content extraction:
		// AI SDK v4+ useChat sends UIMessage with `parts: [{ type: "text", text }]`
		// Older SDKs / raw clients may send `content: string | ContentPart[]`
		// Why this order matters: parts is the canonical v4+ format and must be checked first,
		// otherwise KV cache is bypassed entirely (content is undefined for parts-based messages).
		let lastMessage = "";

		// Priority 1: parts array (AI SDK v4+ UIMessage from useChat)
		if (Array.isArray(lastMsg?.parts)) {
			lastMessage = lastMsg.parts
				.filter((p: any) => p.type === "text")
				.map((p: any) => p.text)
				.join("");
		}

		// Priority 2: content field (string or structured array)
		if (!lastMessage) {
			const rawContent = lastMsg?.content;
			if (typeof rawContent === "string") {
				lastMessage = rawContent;
			} else if (Array.isArray(rawContent)) {
				lastMessage = rawContent
					.map((part: any) => ("text" in part ? part.text : ""))
					.join("");
			}
		}

		// Reject excessively long prompts to limit LLM cost and KV storage abuse.
		if (lastMessage.length > MAX_PROMPT_LENGTH) {
			return new Response(
				JSON.stringify({
					error: `Prompt too long. Maximum is ${MAX_PROMPT_LENGTH} characters.`,
				}),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}

		if (!lastMessage || lastMessage.trim().length === 0) {
			if (process.env.NODE_ENV === "development") {
				console.log("[API] Empty prompt, bypassing cache layer.");
			}
			return await askQuestion(messages);
		}

		// 1. Generate a stable cache key
		const normalizedPrompt = lastMessage
			.trim()
			.toLowerCase()
			.replace(/[.!?。！？\s]+$/, "");

		const promptHash = crypto
			.createHash("sha256")
			.update(normalizedPrompt)
			.digest("hex");

		const kvId = process.env.CF_KV_NAMESPACE_ID;
		const accountId = process.env.CF_ACCOUNT_ID;
		const token = process.env.CF_AI_TOKEN;

		if (process.env.NODE_ENV === "development") {
			console.info(
				`[KV] Checking Hash: ${promptHash.substring(0, 8)} | Target: "${normalizedPrompt}"`,
			);
			console.info(
				`[KV] Config Status: kvId=${!!kvId}, accountId=${!!accountId}, token=${!!token}`,
			);
		}

		// 2. [MANUAL OVERRIDE] Check for explicit shortcuts (FAQ)
		// Why: This allows constant-time, zero-cost responses for high-frequency questions
		// like "Introduce the blog" without needing LLM inference.
		if (kvId && accountId && token) {
			try {
				const manualKey = `manual:${normalizedPrompt}`;
				const manualUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/${encodeURIComponent(manualKey)}`;

				const manualResponse = await fetch(manualUrl, {
					headers: { Authorization: `Bearer ${token}` },
				});

				if (manualResponse.ok) {
					const manualText = await manualResponse.text();

					const textId = `manual-${promptHash.substring(0, 8)}`;
					return createUIMessageStreamResponse({
						stream: createUIMessageStream({
							execute({ writer }) {
								writer.write({ type: "text-start", id: textId });
								writer.write({
									type: "text-delta",
									id: textId,
									delta: manualText,
								});
								writer.write({ type: "text-end", id: textId });
							},
						}),
					});
				}
			} catch (manualError) {
				console.error("[KV SHORTCUT] Check failed:", manualError);
			}
		}

		// 3. [CACHE HIT CHECK] Try to find a global cached answer in the edge
		if (kvId && accountId && token) {
			try {
				const cacheUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/${promptHash}`;
				const cachedResponse = await fetch(cacheUrl, {
					headers: { Authorization: `Bearer ${token}` },
				});

				if (cachedResponse.ok) {
					const cachedText = await cachedResponse.text();

					// Return cached text as a proper AI SDK v5 UI Message Stream
					// Why: useChat expects SSE-based UIMessageStream, not raw data stream protocol.
					// Using the official createUIMessageStreamResponse ensures correct parsing.
					const textId = `cache-${promptHash.substring(0, 8)}`;
					return createUIMessageStreamResponse({
						stream: createUIMessageStream({
							execute({ writer }) {
								writer.write({ type: "text-start", id: textId });
								writer.write({
									type: "text-delta",
									id: textId,
									delta: cachedText,
								});
								writer.write({ type: "text-end", id: textId });
							},
						}),
					});
				}
			} catch (cacheError) {
				console.error("[KV CACHE] Check failed:", cacheError);
			}
		}

		// 3. [MISS] Execute RAG + Generation and hook the finish event to save to KV
		return await askQuestion(messages, {
			onFinish: (fullText: string) => {
				if (kvId && accountId && token) {
					fetch(
						`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvId}/values/${promptHash}`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${token}`,
								"Content-Type": "text/plain",
							},
							body: fullText,
						},
					)
						.then(() => {
							/* KV cache saved */
						})
						.catch((e) => console.error("[KV] Save failed:", e));
				}
			},
		});
	} catch (error: unknown) {
		// Security: Log the real error server-side but return a generic message to the client.
		// Why: error.message can contain DB connection strings, API keys, or stack traces.
		console.error("❌ [API] Critical Chat API Crash:", error);
		return new Response(
			JSON.stringify({
				error: "An internal error occurred. Please try again later.",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}
