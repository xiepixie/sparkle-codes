import React from "react";

export function GithubActivity() {
  // Mock GitHub contribution data for visualization
  const levels = [0, 1, 2, 3, 2, 1, 0, 3, 4, 2, 1, 3, 2, 1, 0, 0, 1, 2, 4, 2, 1];
  
  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex flex-wrap gap-1">
        {levels.map((level, i) => {
          let opacity = "opacity-20";
          if (level === 1) opacity = "opacity-40";
          if (level === 2) opacity = "opacity-60";
          if (level === 3) opacity = "opacity-80";
          if (level === 4) opacity = "opacity-100";

          return (
            <div
              key={i}
              className={`w-3 h-3 rounded-sm bg-primary ${opacity}`}
              title={`Level ${level}`}
            />
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-2">
        GitHub Activity
      </div>
    </div>
  );
}

export function DbStatus() {
  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex items-center gap-2">
        <div className="relative">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
        </div>
        <span className="text-xs font-mono font-bold text-emerald-500">12ms</span>
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
        Neon DB Latency
      </div>
    </div>
  );
}
