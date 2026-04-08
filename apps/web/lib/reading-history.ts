export interface ReadingHistoryEntry {
  slug: string;
  title: string;
  // Optional section-level tracking for "Resume Reading"
  sectionSlug?: string;
  sectionTitle?: string;
}

export const READING_HISTORY_KEY = "sparkle_reading_history";

/**
 * Canonical slug normalization — the SINGLE SOURCE OF TRUTH for all slug
 * comparison / dedup / storage in the reading-history subsystem.
 *
 * 保护约束：
 * - 去掉 URL 编码 (%E6%B5%8B → 测试)
 * - 去掉前导斜杠、路由前缀 (/blog/xxx → xxx)
 * - 去掉尾部斜杠、hash、query string
 * - 全部小写
 *
 * 改坏会怎样：历史记录里出现重复条目或当前文章出现在推荐列表中。
 */
export function normalizeSlug(raw?: string): string {
  if (!raw) {
    return "";
  }
  let slug = raw;
  try {
    // 1. Handle URL decoding. We decode multiple times to handle double-encoded slugs 
    // common in Obsidian-to-Next.js pipelines.
    // Try double decoding first for robust handling of Chinese/special chars.
    slug = decodeURIComponent(decodeURIComponent(slug));
  } catch {
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // malformed URI or raw bytes — just continue
    }
  }

  return slug
    .trim()
    .normalize("NFC")               // Enforce NFC for Mac/Obsidian parity
    .replace(/^\/+/, "")            // strip leading slashes
    .replace(/^blog\//i, "")        // strip /blog prefix
    .split("#")[0]                  // strip hash fragment
    .split("?")[0]                  // strip query string
    .replace(/\/+$/, "")            // strip trailing slashes
    .toLowerCase();                 // canonical lowercase
}

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

/**
 * Read the full history from localStorage, with strict dedup.
 * Returns entries in MRU order (most recently visited first).
 */
export function readReadingHistory(): ReadingHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(READING_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const valid = parsed.filter(isReadingHistoryEntry);

    // Strict deduplication by normalized slug.
    // Keeps the FIRST occurrence (= most recent) of each slug.
    const seen = new Set<string>();
    const deduped: ReadingHistoryEntry[] = [];
    for (const entry of valid) {
      const key = normalizeSlug(entry.slug);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      // We store the normalized slug back into the entry for consistency
      deduped.push({
        ...entry,
        slug: key
      });
    }
    return deduped;
  } catch {
    return [];
  }
}

/**
 * Read history entries suitable for display, excluding the given slug.
 * This is the correct API for any UI that needs "recent posts excluding current".
 */
export function readFilteredHistory(excludeSlug?: string): ReadingHistoryEntry[] {
  const all = readReadingHistory();
  if (!excludeSlug) {
    return all;
  }
  const excludeKey = normalizeSlug(excludeSlug);
  // SINCE readReadingHistory already normalizes entries, a direct comparison is usually safe,
  // but we use normalizeSlug again on the entry for absolute defensive parity.
  return all.filter((entry) => normalizeSlug(entry.slug) !== excludeKey);
}

/**
 * Updates the reading history store with the current entry.
 * Normalizes the entry before storing for consistency.
 */
export function updateReadingHistory(current: ReadingHistoryEntry): void {
  if (typeof window === "undefined") {
    return;
  }

  const currentKey = normalizeSlug(current.slug);
  if (!currentKey) {
    return;
  }

  const normalizedCurrent: ReadingHistoryEntry = {
    slug: currentKey,
    title: current.title,
    sectionSlug: current.sectionSlug,
    sectionTitle: current.sectionTitle,
  };

  const history = readReadingHistory();

  // Remove existing and prepend current
  const updated = [
    normalizedCurrent,
    ...history.filter((entry) => normalizeSlug(entry.slug) !== currentKey)
  ].slice(0, 15);

  window.localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(updated));
}

/**
 * Builds a list of recommended posts for the UI.
 * Prioritizes recently visited posts (excluding current) and supplements with 
 * server-provided suggestions if history is thin.
 */
export function getReadingRecommendations(
  currentSlug: string,
  suggestions: ReadingHistoryEntry[] = []
): ReadingHistoryEntry[] {
  const currentKey = normalizeSlug(currentSlug);
  const history = readReadingHistory();
  
  // 1. Visited Excluding Current
  // Extra safety: re-normalize in the filter to ensure parity regardless of store state.
  const visited = history.filter((entry) => normalizeSlug(entry.slug) !== currentKey);
  
  const combined = [...visited];
  const seenKeys = new Set(combined.map((e) => e.slug));
  seenKeys.add(currentKey);

  // 2. Supplement with suggestions
  for (const suggestion of suggestions) {
    if (combined.length >= 6) {
      break;
    }
    const suggestionKey = normalizeSlug(suggestion.slug);
    if (!suggestionKey || seenKeys.has(suggestionKey)) {
      continue;
    }
    
    combined.push({ 
      slug: suggestionKey, 
      title: suggestion.title 
    });
    seenKeys.add(suggestionKey);
  }

  return combined.slice(0, 6);
}

export function updateLastReadSection(
  slug: string,
  sectionId: string,
  sectionTitle: string
): void {
  const currentKey = normalizeSlug(slug);
  const history = readReadingHistory();

  const updated = history.map((entry) => {
    if (normalizeSlug(entry.slug) === currentKey) {
      return {
        ...entry,
        sectionSlug: sectionId, // We use sectionSlug to store the heading ID
        sectionTitle: sectionTitle,
      };
    }
    return entry;
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(updated));
  }
}
