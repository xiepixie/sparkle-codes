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
  recentPosts: Array<{ slug: string; title: string }>;
}

export interface OpenCommandCenterPayload {
  mode?: CommandCenterMode;
  reading?: CommandCenterReadingContext | null;
}

export const COMMAND_CENTER_EVENT = "sparkle:command-center";

// Keep the command center transport tiny and explicit so multiple surfaces
// can invoke the same global palette without importing each other's UI.
export function openCommandCenter(payload: OpenCommandCenterPayload = {}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent<OpenCommandCenterPayload>(COMMAND_CENTER_EVENT, { detail: payload }));
}

export function scrollToReadingSection(id: string) {
  if (typeof document === "undefined") return;

  const el = document.getElementById(id);
  if (!el) return;

  const yOffset = -140;
  const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
  window.scrollTo({ top: y, behavior: "auto" });
  el.classList.add("jump-highlight");
  window.setTimeout(() => el.classList.remove("jump-highlight"), 2000);
}
