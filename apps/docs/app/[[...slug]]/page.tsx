import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageImage, source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
	const { slug } = await props.params;
	
	// Standard lookup (handles direct and decoded slugs)
	let page = source.getPage(slug);
	
	if (!page && slug) {
		// Fallback for URL-encoded identifiers in the index (common on some filesystems/builds)
		const encodedSlug = slug.map(s => encodeURIComponent(s));
		page = source.getPage(encodedSlug);
		
		if (!page) {
			// Deep search as a last resort (normalization-agnostic)
			const target = encodedSlug.join("/");
			page = source.getPages().find(p => p.slugs.join("/") === target);
		}
	}

	if (!page) {
		notFound();
	}

	// Type-safe metadata extraction (Zero-Any approach)
	const data = page.data as {
		title: string;
		description?: string;
		area?: string;
		updatedAt?: string;
		tags: string[];
		toc: any;
		full?: boolean;
		body: any;
	};

	const MDX = data.body;

	return (
		<DocsPage toc={data.toc} full={data.full}>
			<div className="mb-4 flex flex-wrap items-center gap-2.5 sm:gap-3">
				{data.area && (
					<span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">
						{data.area}
					</span>
				)}
				{data.tags.map((tag: string) => (
					<span 
						key={tag} 
						className="cursor-pointer text-[11px] text-muted-foreground transition-all hover:text-primary hover:shadow-glow"
					>
						#{tag}
					</span>
				))}
				{data.updatedAt && (
					<span className="w-full text-[10px] italic text-muted-foreground/60 sm:ml-auto sm:w-auto">
						Updated: {new Date(data.updatedAt).toLocaleDateString()}
					</span>
				)}
			</div>
			<DocsTitle>{data.title}</DocsTitle>
			<DocsDescription className="mb-0">
				{data.description}
			</DocsDescription>
			<DocsBody>
				{/* Directly execute on the server to avoid serializing 'components' (functions) across Client boundary */}
				{(() => {
					try {
						const MDXContent = MDX({
							components: getMDXComponents({
								a: createRelativeLink(source, page),
							}),
						});
						return <>{MDXContent}</>;
					} catch (err) {
						console.error("MDX Server Render Error:", err);
						return <div>MDX Render Failure</div>;
					}
				})()}
			</DocsBody>
		</DocsPage>
	);
}

export async function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(
	props: { params: Promise<{ slug?: string[] }> },
): Promise<Metadata> {
	const { slug } = await props.params;
	
	let page = source.getPage(slug);
	
	if (!page && slug) {
		const encodedSlug = slug.map(s => encodeURIComponent(s));
		page = source.getPage(encodedSlug);
		
		if (!page) {
			const target = encodedSlug.join("/");
			page = source.getPages().find(p => p.slugs.join("/") === target);
		}
	}
	
	if (!page) {
		notFound();
	}

	return {
		title: page.data.title,
		description: page.data.description,
		openGraph: {
			images: getPageImage(page).url,
		},
	};
}
