"use client";

import React, { useState } from "react";
import { Button, cn } from "@repo/ui";
import { Sparkles, Check, Send } from "lucide-react";

interface SmartButtonProps {
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
}

export function SmartButton({ 
  label = "Click Me", 
  variant = "primary" 
}: SmartButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const handleClick = () => {
    if (status !== "idle") return;
    
    setStatus("loading");
    
    // Simulate an action
    setTimeout(() => {
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2000);
    }, 1500);
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-sm transition-all hover:shadow-glow">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
        Interactive Button Test
      </span>
      
      <Button
        onClick={handleClick}
        variant={variant as any}
        className={cn(
          "min-w-[140px] gap-2 transition-all duration-300",
          status === "success" && "bg-green-500 hover:bg-green-600 border-green-600 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
        )}
        disabled={status === "loading"}
      >
        {status === "idle" && (
          <>
            <Send size={14} />
            {label}
          </>
        )}
        {status === "loading" && (
          <>
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Sending...
          </>
        )}
        {status === "success" && (
          <>
            <Check size={14} />
            Sent!
          </>
        )}
      </Button>

      {status === "success" && (
        <div className="flex items-center gap-2 text-[10px] text-green-500 font-bold animate-in fade-in slide-in-from-bottom-1 capitalize">
          <Sparkles size={10} />
          Protocol Synchronized
        </div>
      )}
    </div>
  );
}
