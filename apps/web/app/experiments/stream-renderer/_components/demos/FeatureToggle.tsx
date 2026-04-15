"use client";

import { Shield, ShieldCheck } from "lucide-react";
import React, { useState } from "react";
import { cn } from "@repo/ui";

interface FeatureToggleProps {
  feature?: string;
  initialEnabled?: string;
}

export function FeatureToggle({ feature = "Security Shield", initialEnabled = "false" }: FeatureToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled === "true");

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/30 backdrop-blur-sm transition-all hover:border-primary/30">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
          enabled ? "bg-primary/20 text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]" : "bg-muted text-muted-foreground"
        )}>
          {enabled ? <ShieldCheck size={20} /> : <Shield size={20} />}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold">{feature}</span>
          <span className="text-[10px] opacity-50 uppercase tracking-tighter">
            {enabled ? "Active Protected Mode" : "System Standby"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "relative w-12 h-6 rounded-full transition-all duration-300 outline-none",
          enabled ? "bg-primary" : "bg-zinc-700"
        )}
      >
        <div className={cn(
          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm",
          enabled ? "left-7" : "left-1"
        )} />
      </button>
    </div>
  );
}
