"use client";

import React, { useState } from "react";
import { Minus, Plus } from "lucide-react";

interface CounterProps {
  initial?: string;
  label?: string;
}

export function Counter({ initial = "0", label = "Counter" }: CounterProps) {
  const [count, setCount] = useState(Number(initial));

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-sm">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setCount((c) => c - 1)}
          className="w-10 h-10 rounded-xl bg-muted hover:bg-muted/80 flex items-center justify-center transition-all active:scale-95"
        >
          <Minus size={16} />
        </button>
        <span className="text-4xl font-black tabular-nums min-w-[80px] text-center">
          {count}
        </span>
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="w-10 h-10 rounded-xl bg-primary/20 hover:bg-primary/30 flex items-center justify-center transition-all active:scale-95"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
