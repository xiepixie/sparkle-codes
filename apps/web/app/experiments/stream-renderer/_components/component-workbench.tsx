"use client";

import { cn } from "@repo/ui";
import { Beaker, Layers, Play, RefreshCw } from "lucide-react";
import React, { useState } from "react";
import { BlockPlaceholder } from "./block-placeholder";
import { AVAILABLE_COMPONENTS, LiveComponent } from "./demos/registry";

export function ComponentWorkbench() {
  const [selectedComponent, setSelectedComponent] = useState(AVAILABLE_COMPONENTS[0]);
  const [testStage, setTestStage] = useState<"cover" | "move">("move");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Sidebar: Component List */}
      <div className="lg:col-span-4 space-y-6">
        <div className="p-6 rounded-2xl border border-border bg-card/30 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Beaker size={14} className="text-primary" />
            <h2 className="text-[10px] font-black uppercase tracking-widest opacity-40">Component Registry</h2>
          </div>
          
          <div className="flex flex-col gap-1">
            {AVAILABLE_COMPONENTS.map((name) => (
              <button
                type="button"
                key={name}
                onClick={() => {
                  setSelectedComponent(name);
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left",
                  selectedComponent === name 
                    ? "bg-primary/10 border border-primary/20 text-primary shadow-glow-sm" 
                    : "hover:bg-muted/50 border border-transparent text-muted-foreground"
                )}
              >
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  selectedComponent === name ? "bg-primary animate-pulse" : "bg-zinc-600"
                )} />
                <span className="text-xs font-bold font-mono">{name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-border bg-card/30 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={14} className="text-primary" />
            <h2 className="text-[10px] font-black uppercase tracking-widest opacity-40">Protocol Stage</h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setTestStage("cover");
              }}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                testStage === "cover" 
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-500" 
                  : "border-border hover:bg-muted opacity-40"
              )}
            >
              Cover (Skeleton)
            </button>
            <button
              type="button"
              onClick={() => {
                setTestStage("move");
              }}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all",
                testStage === "move" 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                  : "border-border hover:bg-muted opacity-40"
              )}
            >
              Move (Final)
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 leading-relaxed px-1">
            Toggle stages to verify zero layout shift between the skeleton and the hydrated component.
          </p>
        </div>
      </div>

      {/* Main: Preview Area */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            <RefreshCw size={12} className={cn(testStage === "cover" && "animate-spin")} />
            Interactive Workbench
          </div>
          <div className="text-[10px] font-mono opacity-30">
            TESTING: {selectedComponent}
          </div>
        </div>

        <div className="min-h-[500px] rounded-3xl border border-border bg-card/40 backdrop-blur-sm p-8 md:p-12 flex items-center justify-center relative overflow-hidden">
          {/* Background Grid */}
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
          
          <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
            {testStage === "cover" ? (
              <BlockPlaceholder type="react" componentName={selectedComponent} streaming={true} />
            ) : (
              <LiveComponent componentName={selectedComponent} />
            )}
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-border bg-card/20 font-mono text-[11px] space-y-2">
          <div className="flex items-center gap-2 text-primary/60 mb-2">
            <Play size={10} />
            <span>SEGMENT DATA (SIMULATED)</span>
          </div>
          <div className="p-3 rounded-lg bg-black/40 text-emerald-400 opacity-80 overflow-x-auto">
            {JSON.stringify({
              id: "test-node",
              type: "react",
              state: testStage === "cover" ? "streaming" : "closed",
              componentName: selectedComponent,
              props: {}
            }, null, 2)}
          </div>
        </div>
      </div>
    </div>
  );
}
