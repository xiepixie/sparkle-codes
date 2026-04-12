import type { MetadataRoute } from "next";

/**
 * Robots.txt configuration
 * Directs Cloudflare AI Search crawler to the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sparkle.codes";

	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/", "/experiments/"],
			},
			{
				// Specifically welcome the Cloudflare AI crawler
				userAgent: "Cloudflare-AICrawler",
				allow: "/",
			},
		],
		sitemap: `${baseUrl}/sitemap.xml`,
	};
}
