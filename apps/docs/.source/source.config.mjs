// source.config.ts
import {
  defineConfig,
  defineDocs,
  metaSchema
} from "fumadocs-mdx/config";
import { z } from "zod";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight
} from "@shikijs/transformers";
var docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: z.object({
      title: z.string(),
      description: z.string().optional(),
      slug: z.string().optional(),
      area: z.string().optional(),
      updatedAt: z.string().optional(),
      date: z.string().optional(),
      tags: z.array(z.string()).optional().default([]),
      published: z.boolean().optional().default(true),
      author: z.string().optional()
    }),
    postprocess: {
      includeProcessedMarkdown: true
    }
  },
  meta: {
    schema: metaSchema
  }
});
function rehypeStyleToObject() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === "element" && node.properties?.style && typeof node.properties.style === "string") {
        const styleString = node.properties.style;
        const styleObject = {};
        styleString.split(";").forEach((pair) => {
          const [key, value] = pair.split(":");
          if (key && value) {
            const camelKey = key.trim().replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            styleObject[camelKey] = value.trim();
          }
        });
        node.properties.style = styleObject;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
var source_config_default = defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkMath,
      // Custom plugin to escape { and } in standard text (avoid expression errors)
      () => (tree) => {
        const visit = (node) => {
          if (node.type === "text") {
            node.value = node.value.replace(/{/g, "\\{").replace(/}/g, "\\}");
          }
          node.children?.forEach(visit);
        };
        visit(tree);
      }
    ],
    rehypePlugins: (v) => [
      [rehypeKatex, { strict: false }],
      rehypeStyleToObject,
      // Force fix for Obsidian-specific or unsupported languages before they hit Shiki
      () => (tree) => {
        const visit = (node) => {
          if (node.type === "element" && node.tagName === "code") {
            const lang = node.properties?.className;
            if (lang) {
              node.properties.className = lang.map((c) => {
                if (c === "language-meta-bind-embed") return "language-markdown";
                if (c === "language-assembly") return "language-asm";
                if (c === "language-verilog") return "language-cpp";
                return c;
              });
            }
          }
          node.children?.forEach(visit);
        };
        visit(tree);
      },
      ...v
    ],
    rehypeCodeOptions: {
      themes: {
        light: "catppuccin-latte",
        dark: "catppuccin-mocha"
      },
      defaultColor: false,
      langAlias: {
        "meta-bind-embed": "markdown",
        "ad-note": "markdown",
        "ad-tip": "markdown",
        "ad-warning": "markdown",
        "ad-error": "markdown",
        assembly: "asm",
        verilog: "v"
      },
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight(),
        transformerNotationFocus()
      ]
    }
  }
});
export {
  source_config_default as default,
  docs
};
