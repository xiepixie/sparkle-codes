"use client";

import { useMemo } from "react";

export type SegmentType = "text" | "code" | "math" | "react";
export type SegmentState = "streaming" | "closed";

export interface Segment {
  id: string;
  type: SegmentType;
  content: string;
  state: SegmentState;
  language?: string;
  componentName?: string;
  props?: Record<string, string>;
}

/**
 * 鲁棒性流式解析器 (V3: 绝对索引与属性增强型)
 */
export function useStreamParser(text: string) {
  return useMemo(() => {
    if (!text) {
      return [];
    }

    const segments: Segment[] = [];
    let i = 0;

    const createId = (type: string, idx: number) => `seg-${type}-${idx}`;

    while (i < text.length) {
      const remaining = text.slice(i);
      const isLineStart = i === 0 || text[i - 1] === "\n";

      // 只有在行首才尝试匹配块
      if (isLineStart) {
        // 1. React Block (改进属性捕获：支持带空格的属性值)
        const reactMatch = remaining.match(/^```react:(\w+)([^\n]*)/);
        if (reactMatch) {
          const componentName = reactMatch[1];
          const propsRaw = reactMatch[2] || "";
          const props: Record<string, string> = {};
          
          // 使用正则提取 key=value，支持 value 中包含非空格字符
          // 这里的正则改进：匹配 [key]=[所有非空格字符] 或者 [key] (默认为true)
          const propPairs = propsRaw.match(/(\w+)=([^\s]+)|(\w+)/g) || [];
          propPairs.forEach((pair) => {
            if (pair.includes("=")) {
              const [k, v] = pair.split("=");
              if (k) {
                props[k] = v;
              }
            } else if (pair) {
              props[pair] = "true";
            }
          });

          const blockStart = i + reactMatch[0].length;
          const contentStart = text[blockStart] === "\n" ? blockStart + 1 : blockStart;
          const remainingAfterOpening = text.slice(contentStart);
          
          // 闭合检测：兼容空内容块
          const blockEndMatch = remainingAfterOpening.match(/^(?:```)/) || remainingAfterOpening.match(/\n```/);

          if (blockEndMatch) {
            const content = remainingAfterOpening.slice(0, blockEndMatch.index);
            segments.push({
              id: createId("react", segments.length),
              type: "react",
              content,
              state: "closed",
              componentName,
              props
            });
            i = contentStart + (blockEndMatch.index || 0) + blockEndMatch[0].length;
            continue;
          }

          // 未闭合，吞噬剩余内容
          segments.push({
            id: createId("react", segments.length),
            type: "react",
            content: remainingAfterOpening,
            state: "streaming",
            componentName,
            props
          });
          i = text.length;
          continue;
        }

        // 2. Code Block
        const codeMatch = remaining.match(/^```(\w*)/);
        if (codeMatch) {
          const language = codeMatch[1] || "text";
          const blockStart = i + codeMatch[0].length;
          const contentStart = text[blockStart] === "\n" ? blockStart + 1 : blockStart;
          const remainingAfterOpening = text.slice(contentStart);
          const blockEndMatch = remainingAfterOpening.match(/^(?:```)/) || remainingAfterOpening.match(/\n```/);

          if (blockEndMatch) {
            segments.push({
              id: createId("code", segments.length),
              type: "code",
              content: remainingAfterOpening.slice(0, blockEndMatch.index),
              state: "closed",
              language
            });
            i = contentStart + (blockEndMatch.index || 0) + blockEndMatch[0].length;
            continue;
          }

          segments.push({
            id: createId("code", segments.length),
            type: "code",
            content: remainingAfterOpening,
            state: "streaming",
            language
          });
          i = text.length;
          continue;
        }

        // 3. Math Block
        const mathMatch = remaining.match(/^\$\$/);
        if (mathMatch) {
          const blockStart = i + 2;
          const contentStart = text[blockStart] === "\n" ? blockStart + 1 : blockStart;
          const remainingAfterOpening = text.slice(contentStart);
          const blockEndMatch = remainingAfterOpening.match(/^(?:\$\$)/) || remainingAfterOpening.match(/\n\$\$/);

          if (blockEndMatch) {
            segments.push({
              id: createId("math", segments.length),
              type: "math",
              content: remainingAfterOpening.slice(0, blockEndMatch.index).trim(),
              state: "closed"
            });
            i = contentStart + (blockEndMatch.index || 0) + blockEndMatch[0].length;
            continue;
          }

          segments.push({
            id: createId("math", segments.length),
            type: "math",
            content: remainingAfterOpening,
            state: "streaming"
          });
          i = text.length;
          continue;
        }
      }

      // 4. Fallback（严格逐字移动索引，确保不漏掉任何文本段）
      const last = segments[segments.length - 1];
      if (!last || last.type !== "text" || last.state === "closed") {
        segments.push({
          id: createId("text", segments.length),
          type: "text",
          content: text[i],
          state: "streaming"
        });
      } else {
        last.content += text[i];
      }
      i++;
    }

    // 更新非末尾段的状态
    for (let idx = 0; idx < segments.length - 1; idx++) {
      segments[idx].state = "closed";
    }

    return segments;
  }, [text]);
}
