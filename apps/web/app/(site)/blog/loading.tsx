export default function Loading() {
	return (
		<div className="container relative z-10 mx-auto max-w-5xl animate-pulse px-5 py-24 sm:px-6 sm:py-28 lg:py-32">
			<header className="mb-14 space-y-4 text-center sm:mb-20">
				<div className="h-6 w-48 bg-muted/20 rounded-full mx-auto" />
				<div className="h-12 w-full max-w-[24rem] bg-muted/20 rounded-xl mx-auto" />
				<div className="h-6 w-full max-w-2xl bg-muted/20 rounded-md mx-auto" />
			</header>

			<div className="grid gap-10">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-64 rounded-2xl border border-border/50 bg-background/20 p-6 backdrop-blur-xl sm:p-8"
					>
						<div className="flex gap-4 mb-4">
							<div className="h-4 w-16 bg-muted/20 rounded" />
							<div className="h-4 w-16 bg-muted/20 rounded" />
						</div>
						<div className="h-10 w-3/4 bg-muted/20 rounded-lg mb-6" />
						<div className="h-4 w-full bg-muted/20 rounded mb-2" />
						<div className="h-4 w-5/6 bg-muted/20 rounded" />
					</div>
				))}
			</div>
		</div>
	);
}
