import { Suspense } from "react";
import { BlogClientShell } from "@/components/Blog/BlogClientShell";
import { queryBlogPostFeed } from "@/lib/blog";

export const metadata = {
	title: "Blog | Sparkle",
	description:
		"Clear writing on AI workflows, testing, and practical systems for real-world execution.",
};

interface BlogIndexPageProps {
	searchParams: Promise<{
		search?: string;
		tag?: string | string[];
		page?: string;
	}>;
}

function toTagList(value?: string | string[]) {
	if (!value) {
		return [];
	}

	const tags = Array.isArray(value) ? value : [value];
	return tags
		.flatMap((entry) => entry.split(","))
		.map((tag) => tag.trim())
		.filter(Boolean);
}

export default async function BlogIndexPage({
	searchParams,
}: BlogIndexPageProps) {
	const resolvedSearchParams = await searchParams;
	const initialFeed = await queryBlogPostFeed({
		query: resolvedSearchParams.search || "",
		tags: toTagList(resolvedSearchParams.tag),
		page: Number.parseInt(resolvedSearchParams.page || "1", 10) || 1,
		pageSize: 8,
	});

	return (
		<div className="relative min-h-screen flex flex-col font-sans overflow-hidden">
			<div className="container relative z-10 mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-20 lg:py-24">


				<Suspense fallback={<BlogSkeleton />}>
					<BlogClientShell initialFeed={initialFeed} />
				</Suspense>
			</div>

			<div className="h-20" />
		</div>
	);
}

/**
 * Skeleton Loader consistent with the industrial 'Starry Night' design.
 */
function BlogSkeleton() {
	return (
		<div className="w-full">
			{/* Skeleton for Search */}
			<div className="mx-auto mb-10 h-14 max-w-md rounded-2xl border border-border/50 bg-background/40 backdrop-blur-md animate-pulse sm:mb-12" />
			<div className="grid gap-8 md:grid-cols-1">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="relative flex h-[280px] flex-col gap-6 overflow-hidden rounded-3xl border border-border/20 bg-background/20 p-6 backdrop-blur-3xl animate-pulse sm:h-[300px] sm:gap-8 sm:p-8 md:p-10"
					>
						<div className="flex justify-between items-center">
							<div className="flex gap-2">
								<div className="h-5 w-20 bg-primary/10 rounded-full border border-primary/10" />
								<div className="h-5 w-20 bg-primary/10 rounded-full border border-primary/10" />
							</div>
							<div className="h-4 w-28 bg-muted/10 rounded-full" />
						</div>

						<div className="space-y-4">
							<div className="h-10 w-3/4 bg-muted/20 rounded-xl" />
							<div className="h-4 w-5/6 bg-muted/10 rounded-lg" />
							<div className="h-4 w-1/2 bg-muted/10 rounded-lg" />
						</div>

						<div className="mt-auto pt-6 border-t border-border/5 flex justify-between items-center">
							<div className="h-4 w-24 bg-primary/10 rounded-md" />
							<div className="flex gap-2">
								<div className="h-6 w-12 bg-muted/5 rounded border border-border/10" />
								<div className="h-6 w-12 bg-muted/5 rounded border border-border/10" />
							</div>
						</div>

						<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
					</div>
				))}
			</div>
		</div>
	);
}
