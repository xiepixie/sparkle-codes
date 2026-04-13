import type { ReadingHistoryEntry } from "./reading-history";

export type CommandCenterMode = "search" | "jump";

export interface CommandCenterSection {
	id: string;
	title: string;
	renderedTitle?: string;
	level: number;
}

export interface CommandCenterReadingContext {
	title: string;
	slug?: string;
	sections: CommandCenterSection[];
	recentPosts: ReadingHistoryEntry[];
}

export type CommandJumpSubMode = "sections" | "history";

export interface OpenCommandCenterPayload {
	mode?: CommandCenterMode;
	jumpTo?: CommandJumpSubMode;
	reading?: CommandCenterReadingContext | null;
}

export const COMMAND_CENTER_EVENT = "sparkle:command-center";
export const COMMAND_CENTER_SYNC_EVENT = "sparkle:command-center-sync";

// Keep the command center transport tiny and explicit so multiple surfaces
// can invoke the same global palette without importing each other's UI.
export function openCommandCenter(payload: OpenCommandCenterPayload = {}) {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<OpenCommandCenterPayload>(COMMAND_CENTER_EVENT, {
			detail: payload,
		}),
	);
}

/**
 * Update the command center's reading context without opening the menu.
 * Used for background synchronization as the user navigates.
 */
export function syncCommandCenterContext(
	reading: CommandCenterReadingContext | null,
) {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<OpenCommandCenterPayload>(COMMAND_CENTER_SYNC_EVENT, {
			detail: { reading },
		}),
	);
}

export function scrollToReadingSection(id: string) {
	if (typeof document === "undefined") {
		return;
	}

	const el = document.getElementById(id);
	if (!el) {
		return;
	}

	const yOffset = -140;
	const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
	window.scrollTo({ top: y, behavior: "auto" });
	el.classList.add("jump-highlight");
	window.setTimeout(() => {
		el.classList.remove("jump-highlight");
	}, 2000);
}
