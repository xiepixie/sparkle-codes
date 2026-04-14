import { type NextRequest, NextResponse } from "next/server";
import { getExplorerNodesQuery } from "@repo/database";

/**
 * GET /api/blog-folders
 * 
 * Query parameters:
 * - prefix: The vault path prefix (default: "工作领域/")
 * - depth: The depth to query at (default: 1)
 * 
 * Used for the Directory Explorer in CommandMenu.
 */
export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const prefix = searchParams.get("prefix") || "工作领域/";
	const depthStr = searchParams.get("depth");
	
	const depth = Number.parseInt(depthStr || "1", 10);
	
	try {
		const nodes = await getExplorerNodesQuery(prefix, depth);
		
		// Set cache headers to optimize experience
		return NextResponse.json(nodes, {
			headers: {
				"Cache-Control": "public, s-age=60, stale-while-revalidate=30",
			},
		});
	} catch (error) {
		console.error("[API ERROR] Failed to fetch explorer nodes:", error);
		return NextResponse.json(
			{ error: "Internal Server Error" },
			{ status: 500 },
		);
	}
}
