import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Revalidate API Route
 *
 * Used by Sentinel or manual maintenance to purge the Next.js cache
 * when the database content changes.
 *
 * Usage: GET /api/revalidate?tag=posts
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const tag = searchParams.get("tag");

	// Accept secret from header (preferred) or query param (legacy fallback).
	// Why header-first: query params leak into access logs, CDN logs, and Referrer headers.
	const secret =
		request.headers.get("x-revalidate-secret") || searchParams.get("secret");

	// Fail-closed: reject if REVALIDATE_SECRET is not configured or does not match.
	// Why: the previous "fail-open" pattern silently skipped auth when the env var was unset,
	// allowing unauthenticated cache purges.
	const serverSecret = process.env.REVALIDATE_SECRET;
	if (!serverSecret || secret !== serverSecret) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
		console.error("[revalidate] Revalidation failed:", err);
		return NextResponse.json(
			{ message: "Revalidation failed" },
			{ status: 500 },
		);
	}
}
