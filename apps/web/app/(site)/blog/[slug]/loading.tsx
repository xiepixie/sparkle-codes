export default function Loading() {
	return (
		<div className="relative mx-auto max-w-4xl px-6 py-24 sm:py-32 animate-pulse">
			<header className="mb-12 space-y-6">
				<div className="flex gap-4">
					<div className="h-6 w-20 bg-muted/20 rounded-full" />
					<div className="h-6 w-32 bg-muted/20 rounded-full" />
				</div>
				<div className="h-20 w-full bg-muted/20 rounded-xl" />
				<div className="h-6 w-2/3 bg-muted/20 rounded-md" />
			</header>

			<div className="space-y-4">
				<div className="h-4 w-full bg-muted/20 rounded" />
				<div className="h-4 w-full bg-muted/20 rounded" />
				<div className="h-4 w-5/6 bg-muted/20 rounded" />
				<div className="pt-8 space-y-4">
					<div className="h-32 w-full bg-muted/20 rounded-xl" />
				</div>
				<div className="h-4 w-full bg-muted/20 rounded" />
				<div className="h-4 w-4/5 bg-muted/20 rounded" />
			</div>
		</div>
	);
}
