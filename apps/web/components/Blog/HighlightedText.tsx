import { useMemo } from "react";

interface HighlightedTextProps {
	html: string;
	className?: string;
}

/**
 * Safe Highlighted Text component that avoids dangerouslySetInnerHTML for search results.
 * It parses the limited subset of HTML produced by renderMarkdownSnippet and
 * converts it into React nodes.
 *
 * Supported tags: <mark>, <strong>, <em>, <del>, <a>, <h3>, <code>.
 */
export function HighlightedText({ html, className }: HighlightedTextProps) {
	const nodes = useMemo(() => {
		if (!html) {
			return null;
		}

		// This is a simple regex-based parser for the specific tags used in renderMarkdownSnippet.
		// We split by any of the supported tags, capturing the tag and its contents.
		// Pattern: (<tag[^>]*>.*?</tag>)
		const tagPattern = /(<(mark|strong|em|del|a|h3|code|span)[^>]*>.*?<\/\2>)/g;
		const segments = html.split(tagPattern);

		return segments.map((segment, index) => {
			if (!segment) {
				return null;
			}

			// If it's a tag we recognize
			if (segment.startsWith("<") && segment.includes("</")) {
				const tagMatch = segment.match(
					/^<([a-z0-9]+)([^>]*)>([\s\S]*?)<\/\1>$/,
				);
				if (tagMatch) {
					const [, tagName, attributes, content] = tagMatch;

					// Helper to extract class or other attributes if needed
					const props: any = { key: index };

					if (attributes.includes('class="')) {
						props.className = attributes.match(/class="([^"]*)"/)?.[1];
					}

					if (tagName === "a" && attributes.includes('href="')) {
						props.href = attributes.match(/href="([^"]*)"/)?.[1];
						props.target = "_blank";
						props.rel = "noopener noreferrer";
					}

					if (attributes.includes('data-hit-kind="')) {
						props["data-hit-kind"] = attributes.match(
							/data-hit-kind="([^"]*)"/,
						)?.[1];
					}

					// Recursively handle content if it contains more tags (like strong inside mark)
					// For simplicity and safety, we only recurse if the content looks like it has tags.
					// But markdown-utils doesn't usually nest tags in snippets except for simple cases.
					const children = content.includes("<") ? (
						<HighlightedText html={content} />
					) : (
						content
					);

					switch (tagName) {
						case "mark":
							return <mark {...props}>{children}</mark>;
						case "strong":
							return <strong {...props}>{children}</strong>;
						case "em":
							return <em {...props}>{children}</em>;
						case "del":
							return <del {...props}>{children}</del>;
						case "a":
							return <a {...props}>{children}</a>;
						case "h3":
							return <h3 {...props}>{children}</h3>;
						case "code":
							return <code {...props}>{children}</code>;
						case "span":
							return <span {...props}>{children}</span>;
						default:
							return segment;
					}
				}
			}

			// It's raw text or an unsupported tag: Escape the text by rendering as is (React handles escaping)
			// Note: If there are &amp;, &lt;, etc., they might need decoding if the input was already HTML-escaped.
			// But renderMarkdownSnippet returns a mix of HTML tags and escaped entities.
			// So we need to decode entities for the text parts.
			return decodeEntities(segment);
		});
	}, [html]);

	if (!html) {
		return null;
	}

	return <span className={className}>{nodes}</span>;
}

function decodeEntities(html: string) {
	if (!html) {
		return "";
	}
	return html
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");
}
