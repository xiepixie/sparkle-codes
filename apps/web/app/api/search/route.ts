import { NextResponse } from "next/server";
import { searchBlogPosts } from "@/lib/blog";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("query");

	if (!query) {
		return NextResponse.json([]);
	}

	try {
		if (query === "warmup") {
			// Just hit the function to warm up the server-side caches and Next.js instance
			await searchBlogPosts("a", 1);
			return NextResponse.json([]);
		}

		const prefix = searchParams.get("prefix") || undefined;
		const blogResults = await searchBlogPosts(query, 8, prefix);
		return NextResponse.json(blogResults, {
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
			},
		});
	} catch (error) {
		console.error("Search Proxy Error:", error);
		return NextResponse.json([]);
	}
}
