import { getAllPostsForLlm } from "@/lib/blog";

/**
 * Industrial-grade Full Context endpoint (llms-full.txt)
 * Concatenates all public blog posts into a single, LLM-digestible context window.
 * 
 * 为什么这样做：
 * 1. 优化 RAG 效率：大模型可以直接通过一个请求获取全站知识，无需反复触发多轮 Search/Fetch。
 * 2. 结构化分割：使用 Markdown HR (---) 和 Metadata Block 确保模型能准确区分不同文章的边界。
 * 3. 性能保护：考虑到博文数量可能增长，此接口必须配套 'use cache' (已在 getAllPostsForLlm 实现) 避免昂贵的数据库全表扫描。
 * 4. 降级方案：如果内容超过 10MB，未来应考虑流式传输或引入分页 RAG。
 */
export async function GET() {
	const posts = await getAllPostsForLlm();
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sparkle.codes";

	const lines: string[] = [];
	lines.push("# Sparkle Codes - Full Context");
	lines.push(`Generated: ${new Date().toISOString()}`);
	lines.push("");

	for (const post of posts) {
		lines.push("---");
		lines.push(`ID: ${post.id}`);
		lines.push(`Title: ${post.title}`);
		lines.push(`Slug: ${post.slug}`);
		lines.push(`URL: ${baseUrl}/blog/${post.slug}`);
		lines.push(`Date: ${post.publishedAt?.toISOString() || post.createdAt?.toISOString()}`);
		lines.push("");
		lines.push(post.content || "");
		lines.push("");
	}

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}

