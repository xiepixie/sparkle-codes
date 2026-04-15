"use client";

import { cn } from "@repo/ui";
import { Play, RotateCcw, Save, Trash2 } from "lucide-react";
import React, { useState } from "react";

interface SimulationLabProps {
  onStart: (text: string) => void;
  onReset: () => void;
  isPlaying: boolean;
}

const INITIAL_TEMPLATE = `Hello! This is a custom simulation.

\`\`\`react:SummaryCard title=My Project points=Custom implementation,Streaming works!,Zero-ETL enabled
\`\`\`

You can try adding math as well:
$$
\\nabla \\times \\mathbf{B} = \\mu_0 \\left( \\mathbf{J} + \\epsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial \\t} \\right)
$$

Try your own markdown here!`;

export function SimulationLab({ onStart, onReset, isPlaying }: SimulationLabProps) {
  const [customText, setCustomText] = useState(INITIAL_TEMPLATE);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full min-h-[600px]">
      {/* 1. Editor Panel */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/60">
            <Save size={12} />
            AI Output Simulator
          </div>
          <button 
            type="button"
            onClick={() => setCustomText("")}
            className="text-[10px] font-bold text-rose-500/60 hover:text-rose-500 flex items-center gap-1 transition-colors"
          >
            <Trash2 size={12} />
            CLEAR
          </button>
        </div>

        <div className="relative flex-1 group">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Paste your markdown document here..."
            className={cn(
              "w-full h-full min-h-[400px] p-6 rounded-2xl border border-white/10 bg-black/40",
              "text-sm font-mono leading-relaxed text-emerald-400/80 outline-none transition-all",
              "focus:border-primary/40 focus:bg-black/60 scrollbar-thin scrollbar-thumb-white/10"
            )}
          />
          <div className="absolute top-4 right-4 text-[10px] font-mono opacity-20 pointer-events-none group-focus-within:opacity-40">
            MARKDOWN EDITOR
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={isPlaying || !customText.trim()}
            onClick={() => onStart(customText)}
            className={cn(
              "flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all",
              isPlaying 
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:shadow-glow active:scale-[0.98]"
            )}
          >
            <Play size={16} fill="currentColor" />
            {isPlaying ? "SIMULATING..." : "Start Simulation"}
          </button>
          
          <button
            type="button"
            onClick={onReset}
            className="px-6 rounded-xl border border-white/10 text-white/40 hover:text-white hover:bg-white/5 transition-all"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* 2. Insight Panel */}
      <div className="flex flex-col gap-4">
        <div className="px-2 text-[10px] font-black uppercase tracking-widest text-primary/60">
          Simulation Advice
        </div>
        <div className="flex-1 p-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] flex flex-col justify-center gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white/90">How to use:</h3>
            <ul className="space-y-3 text-xs text-white/60 list-disc list-inside">
              <li>Use <code className="text-emerald-400 font-mono">```react:ComponentName props... ```</code> for blocks.</li>
              <li>Use <code className="text-emerald-400 font-mono">$$</code> for math equations.</li>
              <li>Use <code className="text-emerald-400 font-mono">```lang</code> for standard code highlights.</li>
              <li>Verify that blocks close properly without "swallowing" text.</li>
            </ul>
          </div>
          
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-500/80 leading-relaxed italic">
            Tip: You can simulate "slow connection" by adjusting the Speed slider in the main Controls panel before starting.
          </div>
        </div>
      </div>
    </div>
  );
}
