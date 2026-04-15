"use client";

import { cn } from "@repo/ui";
import { CheckCircle2, Lightbulb } from "lucide-react";
import { motion } from "framer-motion";

interface SummaryCardProps {
  title?: string;
  points?: string; // 逗号分隔或换行分隔
  className?: string;
}

export default function SummaryCard({ title = "TL;DR", points = "", className }: SummaryCardProps) {
  const pointList = points.split(/[,\n]/).filter(p => p.trim() !== "");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "my-6 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md",
        "shadow-[0_8px_32px_rgba(0,0,0,0.3)]",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-2">
        <Lightbulb className="h-4 w-4 text-yellow-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-white/60">{title}</span>
      </div>
      <div className="p-4">
        <ul className="space-y-3">
          {pointList.map((point, i) => (
            <motion.li 
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-3 text-sm text-white/80"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>{point.trim()}</span>
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="bg-gradient-to-r from-transparent via-white/5 to-transparent h-[1px] w-full" />
    </motion.div>
  );
}
