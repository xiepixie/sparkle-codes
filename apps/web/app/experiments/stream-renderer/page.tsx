"use client";

import { cn } from "@repo/ui";
import { Beaker, Code, Eye, FlaskConical, Terminal } from "lucide-react";
import React, { useState } from "react";
import { ComponentWorkbench } from "./_components/component-workbench";
import { SimulationLab } from "./_components/simulation-lab";
import { StreamControls } from "./_components/stream-controls";
import { StreamRenderer } from "./_components/stream-renderer";
import { useSimulationStream } from "./_hooks/use-simulation-stream";
import type { Segment } from "./_hooks/use-stream-parser";

export default function StreamRendererExperimentPage() {
  const [streamText, setStreamText] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeTab, setActiveTab] = useState<"stream" | "workbench" | "simulation">("stream");

  const streamEngine = useSimulationStream(setStreamText);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-primary/30">
      {/* 1. Header with Tabs */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <FlaskConical size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest">Lab: Stream V2</h1>
              <p className="text-[10px] text-muted-foreground font-mono">X-PROTOCOL // RENDERER_EXPERIMENT</p>
            </div>
          </div>

          <nav className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab("stream")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === "stream" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
              )}
            >
              <Eye size={14} />
              Stream Flow
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("simulation")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === "simulation" ? "bg-white/10 text-white shadow-glow-sm" : "text-white/40 hover:text-white/60"
              )}
            >
              <Terminal size={14} />
              Simulation Lab
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("workbench")}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                activeTab === "workbench" ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
              )}
            >
              <Beaker size={14} />
              Workbench
            </button>
          </nav>
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="container mx-auto p-6 lg:p-12">
        {activeTab === "stream" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <aside className="lg:col-span-4 lg:sticky lg:top-24 gap-6 flex flex-col">
              <StreamControls 
                onUpdate={setStreamText} 
                engine={streamEngine}
              />
              
              <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40">
                  <Code size={14} />
                  Parser Analytics
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Total" value={segments.length} color="primary" />
                  <StatCard label="Streaming" value={segments.filter(s => s.state === "streaming").length} color="amber" />
                  <StatCard label="Text" value={segments.filter(s => s.type === "text").length} color="zinc" />
                  <StatCard label="React" value={segments.filter(s => s.type === "react").length} color="indigo" />
                </div>
              </div>
            </aside>

            <div className="lg:col-span-8 min-h-[800px] rounded-3xl border border-white/10 bg-black/40 p-4 md:p-12 shadow-[0_32px_128px_rgba(0,0,0,1)]">
              <StreamRenderer 
                text={streamText} 
                onSegmentsUpdate={setSegments}
              />
            </div>
          </div>
        )}

        {activeTab === "simulation" && (
          <SimulationLab 
            onStart={streamEngine.startStream}
            onReset={streamEngine.resetStream}
            isPlaying={streamEngine.isPlaying}
          />
        )}

        {activeTab === "workbench" && (
          <ComponentWorkbench />
        )}
      </main>

      <footer className="border-t border-white/5 py-12">
        <div className="container mx-auto px-6 flex justify-between items-center opacity-30 text-[10px] uppercase tracking-widest font-bold">
          <span>&copy; 2026 Advanced Agentic Coding</span>
          <span>Sparkle V2 Core // Live Hydration Ready</span>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    primary: "text-primary",
    amber: "text-amber-500",
    zinc: "text-zinc-400",
    indigo: "text-indigo-400"
  };

  return (
    <div className="p-3 rounded-xl bg-black/40 border border-white/5">
      <div className="text-[9px] font-bold text-white/30 mb-1">{label}</div>
      <div className={cn("text-xl font-mono font-black", colors[color])}>{value}</div>
    </div>
  );
}
