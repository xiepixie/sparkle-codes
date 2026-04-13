import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	outputFileTracingRoot: path.join(__dirname, "../../"),
	transpilePackages: [
		"@repo/utils",
		"@repo/database",
		"@repo/ui",
		"katex",
		"@v2/markdown-parser",
		"mermaid",
		"sonner",
	],
	images: {
		remotePatterns: [
			{
				// google profile images
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				// github profile images
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				// placeholder images
				protocol: "https",
				hostname: "picsum.photos",
			},
			{
				// sparkle cdn
				protocol: "https",
				hostname: "cdn.sparkle.codes",
			},
		],
	},
	async redirects() {
		return [
			{
				source: "/app/settings",
				destination: "/app/settings/general",
				permanent: true,
			},
			{
				source: "/app/:organizationSlug/settings",
				destination: "/app/:organizationSlug/settings/general",
				permanent: true,
			},
			{
				source: "/app/admin",
				destination: "/app/admin/users",
				permanent: true,
			},
		];
	},
	async rewrites() {
		return [
			{
				source: "/obsidian-assets/:path*",
				destination: "https://cdn.sparkle.codes/:path*",
			},
		];
	},
	webpack: (config, { webpack }) => {
		config.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /^pg-native$|^cloudflare:sockets$/,
			}),
		);
		return config;
	},
	turbopack: {},
	bundlePagesRouterDependencies: true,
	serverExternalPackages: ["shiki"],
	cacheComponents: true,
	experimental: {
		optimizePackageImports: [
			"lucide-react",
			"framer-motion",
			"@repo/ui",
			"@v2/markdown-parser",
		],
	},
};

export default nextConfig;
