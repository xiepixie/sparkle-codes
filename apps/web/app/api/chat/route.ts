import { askQuestion } from "@repo/ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    console.log("📨 [API] POST /api/chat received request");

    // askQuestion now returns a Response object directly
    return await askQuestion(messages);

  } catch (error: any) {
    console.error("❌ [API] Critical Chat API Crash:", error);
    return new Response(JSON.stringify({ 
      error: error.message || "Critical internal server error"
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
