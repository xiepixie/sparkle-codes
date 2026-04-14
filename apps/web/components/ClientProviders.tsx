"use client";

import { config } from "@/config";
import { StarryBackground, StarCursor, StarryToaster, ThemeCookieSync, toast } from "@repo/ui";
import { ThemeProvider } from "next-themes";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";

// Suppress React 19 "Encountered a script tag" warning from next-themes
if (typeof window !== "undefined") {
	const originalError = console.error;
	console.error = (...args: any[]) => {
		if (
			typeof args[0] === "string" &&
			args[0].includes("Encountered a script tag")
		) {
			return;
		}
		originalError.call(console, ...args);
	};
}

interface ClientProvidersProps {
	children: ReactNode;
	initialTheme?: string;
}

/**
 * ClientProviders - Final Hardened Version.
 *
 * FIX: 'enableColorScheme={false}' is critical for React 19 / Next.js 16
 * to prevent the 'Encountered a script tag' console error.
 */
export function ClientProviders({
	children,
	initialTheme,
}: ClientProvidersProps) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme={initialTheme || config.defaultTheme}
			enableSystem={false}
			enableColorScheme={false}
			disableTransitionOnChange
		>
			<InternalProviders>{children}</InternalProviders>
		</ThemeProvider>
	);
}

/**
 * InternalProviders - Nested under ThemeProvider to access theme context correctly.
 */
function InternalProviders({ children }: { children: ReactNode }) {
	const pathname = usePathname();

	// ✅ P0: Bridge MarkdownRenderer notifications to @repo/ui toast
	useEffect(() => {
		const handleNotify = (e: any) => {
			const { message, level, i18nKey, i18nParams, description } = e.detail || {};
			const displayMessage = message || i18nKey || "Notification";
			const displayDescription = description || i18nParams?.description || (i18nParams ? JSON.stringify(i18nParams) : undefined);

			const options = {
				description: displayDescription,
			};

			if (level === "error") {
				toast.error(displayMessage, options);
			} else if (level === "warning") {
				toast.warning(displayMessage, options);
			} else if (level === "info") {
				toast.info(displayMessage, options);
			} else {
				toast.success(displayMessage, options);
			}
		};

		window.addEventListener("app-notify", handleNotify);
		return () => window.removeEventListener("app-notify", handleNotify);
	}, []);

	return (
		<>
			<ThemeCookieSync />
			<StarryBackground />
			<StarCursor pathname={pathname} />
			{children}
			<StarryToaster />
		</>
	);
}
