import { generateText, streamText } from "ai";
import { google } from "@ai-sdk/google";

/**
 * Basic retrieval logic shell (RAG).
 * In a real implementation, this would involve vector search on Neon Postgres.
 */
export async function getContext(query: string) {
    // Stub retrieval
    return "This is a technical context about sparkle-codes, a Next.js blog.";
}

export async function askQuestion(question: string) {
    const context = await getContext(question);
    
    return generateText({
        model: google("gemini-1.5-flash"),
        system: `You are an AI expert on technical documentation. Use the following context: ${context}`,
        prompt: question,
    });
}
