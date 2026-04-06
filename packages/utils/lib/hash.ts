/**
 * Generates a stable, numeric hash-based string from content.
 * Ideal for generating persistent IDs or keys during hydration/SSR.
 * 
 * Uses FNV-1a (32-bit) which is fast and reliable for small strings.
 */
export function generateContentHash(content: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
        hash ^= content.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(36);
}
