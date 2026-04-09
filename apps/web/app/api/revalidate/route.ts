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
  const secret = searchParams.get("secret");

  // Validate secret if configured in environment
  const serverSecret = process.env.REVALIDATE_SECRET;
  if (serverSecret && secret !== serverSecret) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  if (!tag) {
    return NextResponse.json({ message: "Missing tag parameter" }, { status: 400 });
  }

  try {
    // Next.js 16 signature: revalidateTag(tag: string, profile: string)
    // "max" profile uses stale-while-revalidate behavior.
    revalidateTag(tag, "max");
    
    return NextResponse.json({ 
      revalidated: true, 
      tag,
      now: Date.now() 
    });
  } catch (err) {
    return NextResponse.json({ 
      message: "Revalidation failed", 
      error: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  }
}
