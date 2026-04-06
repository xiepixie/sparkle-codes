import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center select-none">
			<h1 className="text-8xl font-bold text-primary mb-4 opacity-30 select-none">404</h1>
			<h2 className="text-2xl font-semibold mb-6">Lost in the Starry Night?</h2>
			<p className="text-muted-foreground mb-8 max-w-md">
				The page you are looking for seems to have drifted away. 
				Perhaps it was moved or never existed.
			</p>
			<Link 
				href="/"
				className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
			>
				Back to Orbit
			</Link>
		</div>
	);
}
