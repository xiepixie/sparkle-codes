import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
	basePath: "/docs",
	reactStrictMode: true,
	output: 'standalone',
};

const withMDX = createMDX();

export default withMDX(nextConfig);
