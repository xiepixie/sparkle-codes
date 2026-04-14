import type { MetadataRoute } from "next";

/**
 * Robots.txt configuration (2026 Standards)
 * Follows RFC 9309 (REP) with explicit AI crawler management.
 */
export default function robots(): MetadataRoute.Robots {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sparkle.codes";

	return {
		rules: [
			{
				// === Main Indexing Agents ===
				userAgent: ["*", "Googlebot", "Bingbot", "Applebot"],
				allow: "/",
				disallow: [
					"/api/",
					"/experiments/",
					"/_next/",
					"/static/",
					"/admin/",
					"/app/",
				],
			},
			{
				// === Premium AI & LLM Crawlers (Friendly Indexing) ===
				// These are invited to index the site for high-quality discovery.
				userAgent: [
					"Cloudflare-AICrawler",
					"GPTBot",
					"Claude-bot",
					"PerplexityBot",
					"CCBot",
					"Google-Extended",
				],
				allow: "/",
			},
			{
				// === Aggressive Scrapers / Training Bots ===
				// Optional: block specific bad actors if they ignore crawl-delay
				userAgent: "Amazonbot",
				disallow: "/api/",
			},
		],
		sitemap: `${baseUrl}/sitemap.xml`,
	};
}

