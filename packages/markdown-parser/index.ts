// Main exports for @v2/markdown-parser

// React component
export { MarkdownRenderer, LatexRenderer } from './src/MarkdownRenderer';
export type { MarkdownRendererProps } from './src/MarkdownRenderer';
export { sanitizeLatex } from './src/MarkdownRenderer';

// Note: Server-side parsing is now handled by the Rust sentinel daemon.
// The MarkdownRenderer consumes pre-rendered HTML from the database.
