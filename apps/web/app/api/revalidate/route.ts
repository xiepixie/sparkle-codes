import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Revalidate API Route
 *
 * Used by Sentinel or manual maintenance to purge the Next.js cache
 * when the database content changes.
 *
 * Security: Accepts secret via Authorization header (preferred) or query param (legacy).
 * Usage: GET /api/revalidate?tag=posts  (with Authorization: Bearer <secret>)
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const tag = searchParams.get("tag");

	// Security: REVALIDATE_SECRET must be configured; reject all requests if missing.
	// Why: Without this guard, any unauthenticated request could purge the cache.
	const serverSecret = process.env.REVALIDATE_SECRET;
	if (!serverSecret) {
		return NextResponse.json(
			{ message: "Revalidation endpoint is not configured" },
			{ status: 503 },
		);
	}

	// Accept secret from Authorization header (preferred) or query param (legacy/Sentinel compat).
	// Why: Query-param secrets leak into access logs and browser history.
	const authHeader = request.headers.get("authorization");
	const headerSecret = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7)
		: null;
	const secret = headerSecret || searchParams.get("secret");

	if (secret !== serverSecret) {
		return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
	}

	if (!tag) {
		return NextResponse.json(
			{ message: "Missing tag parameter" },
			{ status: 400 },
		);
	}

	try {
		// Next.js 16 signature: revalidateTag(tag: string, profile: string)
		// "max" profile uses stale-while-revalidate behavior.
		revalidateTag(tag, "max");

		return NextResponse.json({
			revalidated: true,
			tag,
			now: Date.now(),
		});
	} catch (err) {
		console.error("[Revalidate] Failed:", err);
		return NextResponse.json(
			{ message: "Revalidation failed" },
			{ status: 500 },
		);
	}
}
