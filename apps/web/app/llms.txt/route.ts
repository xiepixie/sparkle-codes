import { getAllPostSummaries } from "@/lib/blog";

/**
 * Industrial-grade LLM Index endpoint (llms.txt)
 * Provides a structured, markdown-friendly manifest for LLM discovery.
 * 
 * 为什么这样做：
 * 1. 适配 2026 AI 搜索趋势：LLM (如 Perplexity, SearchGPT) 优先消耗结构化原信息而非网页 HTML。
 * 2. 统一语义入口：作为全站知识图谱的根清单，帮助 AI 代理快速定位相关业务博文。
 * 3. 缓存策略：依赖 getAllPostSummaries 的 'use cache'，确保秒级响应并随数据库同步自动失效。
 */
export async function GET() {
	const posts = await getAllPostSummaries();
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sparkle.codes";

	const lines: string[] = [];
	lines.push("# Sparkle Codes");
	lines.push("> Industrial-grade technical blog and content-first knowledge platform.");
	lines.push("");
	lines.push("## Public Posts");
	for (const post of posts) {
		const description = post.description ? `: ${post.description}` : "";
		lines.push(`- [${post.title}](${baseUrl}/blog/${post.slug})${description}`);
	}

	lines.push("");
	lines.push("## Documentation");
	lines.push(`- [View Full Context (llms-full.txt)](${baseUrl}/llms-full.txt)`);

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}

