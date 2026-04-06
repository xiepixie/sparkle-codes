import { NextResponse } from "next/server";
import { queryBlogPostFeed } from "@/lib/blog";

function parseTags(searchParams: URLSearchParams) {
  return searchParams
    .getAll("tag")
    .flatMap((value) => value.split(","))
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";
  const page = Number.parseInt(searchParams.get("page") || "1", 10);
  const pageSize = Number.parseInt(searchParams.get("pageSize") || "5", 10);
  const tags = parseTags(searchParams);

  try {
    const results = await queryBlogPostFeed({
      query,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 5,
      tags,
    });
    return NextResponse.json(results);
  } catch (error) {
    console.error("Blog Search Error:", error);
    return NextResponse.json({
      posts: [],
      totalCount: 0,
      page: 1,
      pageSize: 5,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
      query,
      tags,
    });
  }
}
