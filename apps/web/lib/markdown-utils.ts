import katex from "katex";

export function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Renders a constrained markdown subset for snippets (previews, search hits).
 * This ensures results stay readable without reusing the full article rendering pipeline.
 */
export function renderMarkdownSnippet(
  text: string, 
  query = "", 
  hitKind: "title" | "description" | "body" = "body"
) {
  if (!text) {
    return "";
  }

  const placeholders: Array<{ key: string; html: string }> = [];
  const pushPlaceholder = (html: string) => {
    const key = `__SPARKLE_SNIPPET_${placeholders.length}__`;
    placeholders.push({ key, html });
    return key;
  };

  // 1. Initial Opaque Structural Detection (Math, Code) -> Placeholders
  // These are things that should NOT have highlighting or escaping inside.
  let prepared = text;

  // KaTeX
  prepared = prepared.replace(/\$([^$\n]+)\$/g, (_match, formula) => {
    try {
      return pushPlaceholder(
        `<span class="search-katex font-serif">${katex.renderToString(formula, {
          displayMode: false,
          throwOnError: false,
        })}</span>`,
      );
    } catch {
      return formula;
    }
  });

  // Inline Code
  prepared = prepared.replace(/`([^`]+)`/g, (_match, code) =>
    pushPlaceholder(`<code class="search-inline-code font-mono text-[0.9em] bg-muted/50 px-1 rounded">${escapeHtml(code)}</code>`),
  );

  // 2. Heading Detection (BEFORE whitespace normalization)
  const headingTag = hitKind === "title" ? "strong" : "h3";
  let lines = prepared.split("\n");
  lines = lines.map(line => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      return `<${headingTag}>${match[2]}</${headingTag}>`;
    }
    return line;
  });
  prepared = lines.join("\n");

  // 3. Structural Markdown -> HTML Tags (Recursive-friendly order)
  // We leave the inner content unescaped for now; it will be handled by the segment loop.
  prepared = prepared
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Links (Escape ONLY the href, since label is an inner text segment)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, href) => 
      `<a class="premium-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    )
    // Strike
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    // Highlight (Obsidian ==)
    .replace(/==(.+?)==/g, "<mark class=\"search-inline-accent bg-primary/10 text-primary px-0.5 rounded transition-colors\">$1</mark>");

  // 4. Whitespace Normalization
  prepared = prepared.replace(/\s+/g, " ").trim();

  // 5. Tag-Safe Escaping & Highlighting
  const trimmedQuery = query.trim();
  const pattern = trimmedQuery ? new RegExp(`(${escapeRegExp(trimmedQuery)})`, "gi") : null;

  // Split by HTML tags OR placeholders. This ensures we don't modify tag attributes or opaque segments.
  const segments = prepared.split(/(<[^>]+>|__SPARKLE_SNIPPET_\d+__)/g);
  
  const processedSegments = segments.map(seg => {
    if (!seg) {
      return "";
    }
    // If it starts with < (tag) or __ (placeholder), return it as is.
    if (seg.startsWith("<") || seg.startsWith("__SPARKLE_SNIPPET_")) {
      return seg;
    }
    
    // It's raw text: Escape it and apply highlight
    let escaped = escapeHtml(seg);
    if (pattern) {
      escaped = escaped.replace(
        pattern,
        `<mark class="search-hit font-semibold bg-primary/20 text-primary underline decoration-primary/30 underline-offset-2" data-hit-kind="${hitKind}">$1</mark>`
      );
    }
    return escaped;
  });

  let finalHtml = processedSegments.join("");

  // 6. Restore Opaque Placeholders
  for (const placeholder of placeholders) {
    finalHtml = finalHtml.replaceAll(placeholder.key, placeholder.html);
  }

  return finalHtml;
}


