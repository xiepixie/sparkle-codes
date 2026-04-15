"use client";

import React, { useEffect } from "react";
import styles from "../stream-renderer.module.css";
import { useStreamParser, Segment } from "../_hooks/use-stream-parser";
import { BlockPlaceholder } from "./block-placeholder";
import { ChatMarkdown } from "@/components/Chat/ChatMarkdown";
import { LiveComponent } from "./demos/registry";
import { cn } from "@repo/ui";

interface StreamRendererProps {
  text: string;
  className?: string;
  onSegmentsChange?: (segments: Segment[]) => void;
}

export function StreamRenderer({ text, className, onSegmentsChange }: StreamRendererProps) {
  const segments = useStreamParser(text);

  useEffect(() => {
    onSegmentsChange?.(segments);
  }, [segments, onSegmentsChange]);

  return (
    <div className={cn(styles.container, className)}>
      {segments.map((segment) => (
        <div key={segment.id} className={styles.segment}>
          <SegmentSwitch segment={segment} />
        </div>
      ))}
    </div>
  );
}

function SegmentSwitch({ segment }: { segment: Segment }) {
  if (segment.type === "text") {
    // 文本段落直接渲染，带上闪烁的光标效果（如果是最后一个且正在输入）
    return (
      <div className="prose dark:prose-invert max-w-none">
        <ChatMarkdown text={segment.content} className="!m-0" />
      </div>
    );
  }

  // Code, Math 或 React 块
  if (segment.state === "streaming") {
    // 遮 (Cover) 阶段：渲染骨架屏
    return (
      <BlockPlaceholder 
        type={segment.type as "code" | "math" | "react"} 
        language={segment.language} 
        componentName={segment.componentName}
        streaming={true} 
      />
    );
  }

  // React 组件：闭合后直接渲染真实组件
  if (segment.type === "react") {
    // 点 (Point) + 挪 (Move) 阶段：从注册表查找并渲染
    return (
      <div className="animate-in fade-in zoom-in-95 duration-500">
        <LiveComponent componentName={segment.componentName || ""} props={segment.props} />
      </div>
    );
  }

  // 挪 (Move) 阶段：闭合后，渲染最终效果
  // 此时我们将文本包裹回 Markdown 语法进行渲染
  if (segment.type === "code") {
    const markdownedContent = `\`\`\`${segment.language || ""}\n${segment.content}\n\`\``;
    return (
      <div className="animate-in fade-in zoom-in-95 duration-500">
        <ChatMarkdown text={markdownedContent} className={styles.renderedCode} />
      </div>
    );
  }

  if (segment.type === "math") {
    // 数学块：由于 content 只有 LaTeX，我们需要补齐 $$
    const mathContent = `$$\n${segment.content}\n$$`;
    return (
      <div className="animate-in fade-in zoom-in-95 duration-500">
        <ChatMarkdown text={mathContent} className={styles.renderedCode} />
      </div>
    );
  }

  return null;
}
