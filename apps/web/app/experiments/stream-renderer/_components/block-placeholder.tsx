"use client";

import React from "react";
import styles from "../stream-renderer.module.css";
import { cn } from "@repo/ui";
import { Terminal, Sigma, Cpu } from "lucide-react";

interface BlockPlaceholderProps {
  type: "code" | "math" | "react";
  language?: string;
  componentName?: string;
  streaming?: boolean;
}

export function BlockPlaceholder({ type, language, componentName, streaming }: BlockPlaceholderProps) {
  return (
    <div 
      className={cn(
        styles.placeholder,
        type === "code" ? styles.placeholderCode : type === "math" ? styles.placeholderMath : styles.placeholderReact
      )}
    >
      <div className={styles.header}>
        <div className="flex items-center gap-2">
          {type === "code" ? (
            <Terminal size={12} className="text-zinc-500" />
          ) : type === "math" ? (
            <Sigma size={12} className="text-primary/50" />
          ) : (
            <Cpu size={12} className="text-violet-400" />
          )}
          <span className={styles.badge}>
            {type === "code" ? (language || "source") : type === "math" ? "calculation" : (componentName || "component")}
          </span>
        </div>
        {streaming && (
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full bg-primary/40 animate-bounce" />
            <div className="w-1 h-1 rounded-full bg-primary/40 animate-bounce [animation-delay:0.2s]" />
            <div className="w-1 h-1 rounded-full bg-primary/40 animate-bounce [animation-delay:0.4s]" />
          </div>
        )}
      </div>
      
      <div className={styles.shimmerContent}>
        <div className={styles.line} style={{ width: "90%" }} />
        <div className={styles.line} style={{ width: "70%" }} />
        <div className={styles.line} style={{ width: "85%" }} />
      </div>

      <div className={styles.statusText}>
        {streaming ? `Streaming ${type === "react" ? "react" : type} block...` : `Preparing ${type === "react" ? "component" : type} render...`}
      </div>
    </div>
  );
}
