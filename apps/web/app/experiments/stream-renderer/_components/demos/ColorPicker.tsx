"use client";

import React, { useState } from "react";

const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface ColorPickerProps {
  label?: string;
}

export function ColorPicker({ label = "Pick a Color" }: ColorPickerProps) {
  const [selected, setSelected] = useState(PALETTE[5]);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(selected);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-5 rounded-2xl border border-border bg-card/50 backdrop-blur-sm space-y-4">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>

      <div
        className="h-20 rounded-xl transition-colors duration-300 flex items-center justify-center"
        style={{ backgroundColor: selected }}
      >
        <span className="text-sm font-mono font-bold text-white/90 drop-shadow-md">
          {selected}
        </span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => setSelected(color)}
            className={`w-8 h-8 rounded-lg transition-all active:scale-90 ${
              selected === color
                ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                : "hover:scale-105"
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={copy}
        className="w-full py-1.5 rounded-lg bg-muted/50 border border-border text-xs font-bold hover:bg-muted transition-all active:scale-[0.98]"
      >
        {copied ? "Copied!" : "Copy Hex"}
      </button>
    </div>
  );
}
