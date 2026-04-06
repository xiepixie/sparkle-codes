import { NextResponse } from "next/server";
import { searchBlogPosts } from "@/lib/blog";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    const blogResults = await searchBlogPosts(query, 8);
    return NextResponse.json(blogResults);
  } catch (error) {
    console.error("Search Proxy Error:", error);
    return NextResponse.json([]);
  }
}
