"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("Route segment error:", error);
	}, [error]);

	return (
		<div className="relative flex flex-col items-center justify-center min-h-[80vh] px-4 text-center overflow-hidden">
			{/* Decorative background element */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 animate-pulse" />
			
			<div className="relative p-8 rounded-3xl border border-border/50 bg-card/30 backdrop-blur-md shadow-2xl max-w-lg w-full">
				<div className="inline-flex items-center justify-center p-4 bg-destructive/10 rounded-2xl mb-8 group transition-all duration-500 hover:rotate-12 hover:bg-destructive/15">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="40"
						height="40"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-destructive animate-in fade-in zoom-in duration-700"
					>
						<title>Error Icon</title>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				</div>
				
				<h2 className="text-3xl font-bold mb-4 tracking-tight bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
					Quantum Paradox Detected
				</h2>
				
				<p className="text-muted-foreground mb-10 text-lg leading-relaxed">
					The timeline encountered a rupture. The segment you&apos;re trying to access has collapsed into a singularity.
				</p>

				<div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
					<button
						type="button"
						onClick={() => reset()}
						className="w-full sm:w-auto px-8 py-3 bg-primary text-primary-foreground font-medium rounded-full shadow-lg shadow-primary/20 hover:shadow-glow transition-all active:scale-95 duration-200"
					>
						Recalibrate Timeline
					</button>
					<Link
						href="/"
						className="w-full sm:w-auto px-8 py-3 bg-secondary text-secondary-foreground font-medium rounded-full border border-border/50 hover:bg-muted transition-all duration-200"
					>
						Abort to Orbit
					</Link>
				</div>
			</div>
		</div>
	);
}
