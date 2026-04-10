"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

/**
 * CommandMenuLazy - Client-side boundary for the heavy CommandMenu component.
 *
 * Why: The CommandMenu includes many icons, complex search logic, and history management.
 * By using dynamic import with ssr: false, we keep it out of the initial server-rendered
 * HTML and the main critical-path JS bundle until the client is ready.
 */
const CommandMenu = dynamic(
	() => import("./CommandMenu").then((mod) => mod.CommandMenu),
	{
		ssr: false,
		loading: () => null,
	},
);

export function CommandMenuLazy() {
	return (
		<Suspense fallback={null}>
			<CommandMenu />
		</Suspense>
	);
}
