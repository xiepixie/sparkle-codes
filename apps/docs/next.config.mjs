import { createMDX } from "fumadocs-mdx/next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
	basePath: "/docs",
	reactStrictMode: true,
	output: 'standalone',
	outputFileTracingRoot: path.join(__dirname, "../../"),
};

const withMDX = createMDX();

export default withMDX(nextConfig);
