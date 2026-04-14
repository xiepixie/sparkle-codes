export interface SearchResultItem {
	id: string;
	title: string;
	description: string;
	bodyPreview?: string;
	url: string;
	section?: string;
	context?: string;
	highlightedTitle?: string;
	highlightedDescription?: string;
	highlightedBodyPreview?: string;
	highlightedContext?: string;
}

export type CommandMode = "browse" | "search" | "jump";

export const panelVariants = {
	enter: (dir: number) => ({ x: dir * 20, opacity: 0 }),
	center: { x: 0, opacity: 1 },
	exit: (dir: number) => ({
		x: -dir * 20,
		opacity: 0,
		transition: { duration: 0.2 },
	}),
};
