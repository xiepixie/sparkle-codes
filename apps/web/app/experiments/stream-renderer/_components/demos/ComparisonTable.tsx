"use client";

import { cn } from "@repo/ui";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

interface ComparisonTableProps {
  data?: string; // 格式: "Header1|Header2;Row1C1|Row1C2;..."
  className?: string;
}

export default function ComparisonTable({ data = "", className }: ComparisonTableProps) {
  if (!data) {
    return null;
  }

  const parts = data.split(";");
  const headers = parts[0]?.split("|") || [];
  const rows = parts.slice(1).map((r) => {
    return r.split("|");
  });

  const renderValue = (val: string) => {
    const v = val.trim().toLowerCase();
    if (v === "yes" || v === "true") {
      return <Check className="h-4 w-4 text-emerald-500" />;
    }
    if (v === "no" || v === "false") {
      return <X className="h-4 w-4 text-rose-500" />;
    }
    return <span className="text-white/80">{val}</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("my-6 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40", className)}
    >
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-white/5">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 font-semibold text-white/60 border-b border-white/10 first:text-white/90">
                {h.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="group hover:bg-white/[0.02] transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-3 border-b border-white/[0.05] group-last:border-none">
                  <div className="flex items-center gap-2">
                    {renderValue(cell)}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
