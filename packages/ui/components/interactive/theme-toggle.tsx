"use client";

import { Horizon } from "@theme-toggles/react";
import "@theme-toggles/react/css/Horizon.css";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "../../lib";

let transitionLock = false;

type ViewTransitionLike = {
	ready: Promise<void>;
	finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
	startViewTransition?: (callback: () => void) => ViewTransitionLike;
};

export function ThemeToggle({ className }: { className?: string }) {
	const { setTheme, resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const [isAnimating, setIsAnimating] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-11 w-11 p-3" />;
	}

	const isDark = resolvedTheme === "dark";
	const nextTheme = isDark ? "light" : "dark";

	const handleToggle = (event: React.MouseEvent) => {
		if (transitionLock) {
			return;
		}

		const transitionDocument = document as ViewTransitionDocument;
		if (
			!transitionDocument.startViewTransition ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			setTheme(nextTheme);
			return;
		}

		transitionLock = true;
		document.documentElement.classList.add("theme-transitioning");

		if (typeof window !== "undefined") {
			(
				window as { __SPARKLE_THEME_TRANSITION__?: boolean }
			).__SPARKLE_THEME_TRANSITION__ = true;
		}

		// Fallback for keyboard events where clientX/Y might be 0
		const x = event.clientX || window.innerWidth / 2;
		const y = event.clientY || window.innerHeight / 2;
		const endRadius = Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y),
		);

		setIsAnimating(true);
		setTimeout(() => setIsAnimating(false), 500);

		const transition = transitionDocument.startViewTransition(() => {
			flushSync(() => {
				setTheme(nextTheme);
			});
		});

		transition.ready.then(() => {
			const clipPath = [
				`circle(0px at ${x}px ${y}px)`,
				`circle(${endRadius}px at ${x}px ${y}px)`,
			];

			document.documentElement.animate(
				{
					clipPath,
				},
				{
					duration: 500,
					easing: "cubic-bezier(0.25, 1, 0.5, 1)",
					pseudoElement: "::view-transition-new(root)",
				},
			);
		});

		transition.finished.finally(() => {
			document.documentElement.classList.remove("theme-transitioning");
			if (typeof window !== "undefined") {
				(
					window as { __SPARKLE_THEME_TRANSITION__?: boolean }
				).__SPARKLE_THEME_TRANSITION__ = false;
			}
			transitionLock = false;
		});
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Horizon manages keyboard
		// biome-ignore lint/a11y/noStaticElementInteractions: Needed to get coordinates
		<div
			className={cn(
				"relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 group/theme interactive active:scale-90",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				isAnimating && "theme-toggle-nova",
				className,
			)}
			onClick={handleToggle}
		>
			<div className="relative z-10 flex h-5 w-5 items-center justify-center pointer-events-none">
				{/* @ts-ignore - Horizon types incompatibility with React 19 */}
				<Horizon
					duration={500}
					toggled={isDark}
					className={cn(
						"text-primary [&_svg]:h-5 [&_svg]:w-5 transition-transform duration-300",
						isDark ? "rotate-0" : "rotate-180",
					)}
				/>
			</div>

			<div className="pointer-events-none absolute inset-0 rounded-full bg-primary/5 opacity-0 blur-md transition-all duration-500 group-hover/theme:scale-110 group-hover/theme:opacity-100" />
			<div className="pointer-events-none absolute inset-2 rounded-full border border-border/60 opacity-0 transition-opacity group-hover/theme:opacity-50" />
		</div>
	);
}
