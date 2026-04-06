export interface ReadingHistoryEntry {
  slug: string;
  title: string;
}

export const READING_HISTORY_KEY = "sparkle_reading_history";

function isReadingHistoryEntry(value: unknown): value is ReadingHistoryEntry {
  return Boolean(
    value &&
      typeof value === "object" &&
      "slug" in value &&
      "title" in value &&
      typeof (value as { slug: unknown }).slug === "string" &&
      typeof (value as { title: unknown }).title === "string",
  );
}

export function readReadingHistory(): ReadingHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(READING_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReadingHistoryEntry);
  } catch {
    return [];
  }
}

export function updateReadingHistory(
  current: ReadingHistoryEntry,
  suggestions: ReadingHistoryEntry[] = [],
): ReadingHistoryEntry[] {
  const history = readReadingHistory();
  const filtered = history.filter((entry) => entry.slug !== current.slug);
  const updated = [current, ...filtered].slice(0, 12);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(updated));
  }

  const visitedLocal = updated.filter((entry) => entry.slug !== current.slug);
  const combined = [...visitedLocal];
  const existingSlugs = new Set(combined.map((entry) => entry.slug));
  existingSlugs.add(current.slug);

  for (const suggestion of suggestions) {
    if (combined.length >= 5) break;
    if (!existingSlugs.has(suggestion.slug)) {
      combined.push(suggestion);
      existingSlugs.add(suggestion.slug);
    }
  }

  return combined.slice(0, 5);
}
