import React, { type ReactElement, type ReactNode } from "react";

/**
 * Slugify a string for heading IDs.
 * Converts "Hello World" -> "hello-world"
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-"); // Replace multiple - with single -
}

/**
 * Extract text content from React children for slugification
 */
export function extractText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return children.toString();
  if (Array.isArray(children)) return children.map(extractText).join("");
  
  if (React.isValidElement(children)) {
    const element = children as ReactElement<{ children?: ReactNode }>;
    if (element.props?.children) {
        return extractText(element.props.children);
    }
  }
  return "";
}
