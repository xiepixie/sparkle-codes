import type { MetadataRoute } from "next";
import { getAllPostSummaries } from "@/lib/blog";

/**
 * Sitemap Generator for Sparkle Codes
 * Helps Cloudflare AI Search crawler discover all blog posts accurately.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://sparkle.codes";

	const posts = await getAllPostSummaries();

	const blogUrls = posts.map((post) => ({
		url: `${baseUrl}/blog/${post.slug}`,
		lastModified: new Date(post.date),
		changeFrequency: "weekly" as const,
		priority: 0.8,
	}));

	return [
		{
			url: baseUrl,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 1,
		},
		{
			url: `${baseUrl}/blog`,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 0.9,
		},
		...blogUrls,
	];
}
