---
title: "Mermaid.js Diagram Styling Design"
description: "Analysis and implementation details of the high-contrast 'Starry Night' Mermaid theme."
date: "2026-04-06"
tags: ["design", "ui", "mermaid", "next-js"]
---

# Mermaid.js: The "Halo Text" Design Strategy

In our "Starry Night" theme, Mermaid diagrams presented a unique challenge: **Mixed-Background Readability**. Traditional styling assumes a uniform background (either light or dark), but Mermaid diagrams often mix both.

## 1. The Problem: Mixed Backgrounds

In dark mode, we have a deep universe-colored background (`oklch(0.13 0.015 265)`). However, Mermaid diagrams often render:
- **Dark Elements**: Connection lines, arrows, and dark-filled nodes.
- **Rogue White Blocks**: Many Mermaid syntax defaults render pure white rects for nodes or clusters, regardless of theme variables.

Using **Indigo 500** or **Gray** as a single text color failed because:
- If we use light text, it's invisible on white nodes.
- If we use dark text, it's invisible on our dark platform background.

## 2. The Solution: "Halo" Text Strategy

We implemented a design strategy called a **Text Halo** or **Inverted Glow**. Instead of finding a single color that works everywhere, we use **White Text** as the base and protect it with a **High-Contrast Shadow**.

### CSS Implementation

In our `globals.css`, we target both SVG `<text>` elements and HTML `<div>` labels inside `foreignObject`:

```css
.dark .mermaid-render-container .label div,
.dark .mermaid-render-container .label text {
    /* Base Color: Maximum Luminous (White) */
    color: #ffffff !important;
    fill: #ffffff !important;
    
    /* The Halo Effect: Multiple layers of shadows */
    text-shadow: 
        0 1px 2px rgba(0,0,0,0.8), /* Soft Depth */
        0 0 1px rgba(0,0,0,0.5) !important; /* Sharp Outline */
        
    font-weight: 500;
}
```

### Why this works:
1. **On Dark Backgrounds**: The white text naturally stands out due to its luminosity.
2. **On White Blocks**: The **dark text-shadow** acts as a sharp border behind the white letters, maintaining legibility even if the background color matches the text color. This is the same principle used in subtitles for movies.

## 3. Resolving Clipping Bugs

A common Mermaid bug is the side boundary of a node (SVG `rect` or `path`) clipping the text label. We solved this with two specific overrides:

1. **Overflow Relief**:
   ```css
   .mermaid-render-container svg .label foreignObject {
       overflow: visible !important;
   }
   ```
2. **Breathing Room**:
   We injected horizontal padding into the label wrappers to ensure the text never touches the hard SVG boundary:
   ```css
   .mermaid-render-container svg .label foreignObject > div {
       padding: 4px 12px !important;
       white-space: nowrap !important;
   }
   ```

## 4. Visual Refinement: "Floating Premium"

To align with the "Starry Night" aesthetic, we removed the rigid borders from the Mermaid container.

- **Container Styling**: 
  - `bg-muted/5`: Subtly separates the diagram from the page.
  - `backdrop-blur-sm`: Adds a premium sense of material depth.
  - `shadow-premium-sm`: Lifts the diagram off the background without a hard border line.
  - **No Border**: Achieves a more modern, integrated look where the diagram feels part of the page content rather than a sandboxed image.

## 5. Theme Reactivity

The styling is fully reactive. When `resolvedTheme` switches:
- The `MarkdownInteractivity` component re-calculates the theme palette.
- A `requestAnimationFrame` micro-delay ensures CSS variables have synchronized.
- Mermaid is re-initialized and the diagram is re-rendered to ensure even intrinsic SVG styles match the current environment.
