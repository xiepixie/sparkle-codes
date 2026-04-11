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

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-11 w-11 p-3" />;
	}

	const isDark = resolvedTheme === "dark";
	const nextTheme = isDark ? "light" : "dark";

	const handleToggle = (event: React.MouseEvent | React.KeyboardEvent) => {
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

		// Why: Locking both html and body height prevents catastrophic layout jumps 
		// if theme-specific margins/line-heights cause content to expand or contract.
		const scrollY = window.scrollY;
		const originalBodyHeight = document.body.style.height;
		const originalHtmlHeight = document.documentElement.style.height;
		const originalOverflow = document.body.style.overflow;
		
		const currentHeight = `${document.documentElement.scrollHeight}px`;
		document.body.style.height = currentHeight;
		document.documentElement.style.height = currentHeight;
		document.body.style.overflow = "hidden";

		if (typeof window !== "undefined") {
			(window as any).__SPARKLE_THEME_TRANSITION__ = true;
		}

		const x = "clientX" in event ? event.clientX : window.innerWidth / 2;
		const y = "clientY" in event ? event.clientY : window.innerHeight / 2;
		const endRadius = Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y),
		);

		document.documentElement.style.setProperty("--x", `${x}px`);
		document.documentElement.style.setProperty("--y", `${y}px`);
		document.documentElement.style.setProperty("--r", `${endRadius}px`);

		const transition = transitionDocument.startViewTransition(() => {
			flushSync(() => {
				setTheme(nextTheme);
			});
		});

		transition.finished.finally(() => {
			// Why: Defer unlocking to the next frame to ensure the new theme layout is fully painted
			// and stable before removing the height constraints.
			requestAnimationFrame(() => {
				document.documentElement.classList.remove("theme-transitioning");
				document.body.style.height = originalBodyHeight;
				document.documentElement.style.height = originalHtmlHeight;
				document.body.style.overflow = originalOverflow;
				window.scrollTo(0, scrollY);
				
				if (typeof window !== "undefined") {
					(window as any).__SPARKLE_THEME_TRANSITION__ = false;
				}
				transitionLock = false;
			});
		});
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleToggle(event);
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: role="button" and tabIndex={0} provide accessibility for the wrapped interaction.
<div
			role="button"
			tabIndex={0}
			aria-label={`Switch to ${nextTheme} theme`}
			// Why: Outer container must be a <div> because the internal Horizon library already 
			// renders a <button>. Nesting buttons is invalid HTML and causes hydration errors.
			className={cn(
				"relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-[transform,background-color] duration-300 group/theme interactive active:scale-95 will-change-transform outline-none",
				"focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				className,
			)}
			onClick={handleToggle}
			onKeyDown={handleKeyDown}
		>
			<div className="relative z-10 flex h-5 w-5 items-center justify-center pointer-events-none">
				{/* @ts-ignore - Horizon types incompatibility with React 19 */}
				<Horizon
					duration={500}
					toggled={isDark}
					className={cn(
						"text-primary [&_svg]:h-5 [&_svg]:w-5 transition-transform duration-300 will-change-transform",
						isDark ? "rotate-0" : "rotate-180",
					)}
				/>
			</div>

			{/* Decorative background glow with optimized transitions */}
			<div className="pointer-events-none absolute inset-0 rounded-full bg-primary/10 opacity-0 blur-md transition-[transform,opacity] duration-500 group-hover/theme:scale-110 group-hover/theme:opacity-100 will-change-[transform,opacity]" />
			{/* Inner border refinement */}
			<div className="pointer-events-none absolute inset-2 rounded-full border border-border/40 opacity-0 transition-opacity duration-300 group-hover/theme:opacity-60" />
		</div>
	);
}
