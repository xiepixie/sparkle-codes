"use client";

import { cn } from "@repo/ui";
import { Pause, Play, RotateCcw, Zap } from "lucide-react";
import React, { useState } from "react";

const PRESETS = {
  mixed: `Hello! Let me show you some high-performance Rust code.
  
\`\`\`rust
fn main() {
    let sparkle = Sparkle::new("Gemini 3");
    sparkle.ignite();
}
\`\`\`

As you can see, the syntax is clean. Now let's look at some math:

$$
E = mc^2 + \\int_{0}^{\\infty} e^{-x^2} dx
$$

Finally, another code block for good measure:

\`\`\`typescript
interface Config {
  mode: "shimmer" | "static";
  speed: number;
}
\`\`\`
`,
  heavy: `Let's deep dive into system architecture:

\`\`\`go
func startServer() {
    mux := http.NewServeMux()
    mux.HandleFunc("/", handleHome)
    log.Fatal(http.ListenAndServe(":8080", mux))
}
\`\`\`

And the Kubernetes config:

\`\`\`yaml
apiVersion: v1
kind: Pod
metadata:
  name: sparkle-app
spec:
  containers:
  - name: sparkle
    image: repo/sparkle:latest
\${"id": "container-01"}
\`\`\`
`,
  math: `Let's explore some advanced physics and mathematics.

The Einstein Field Equations describe the fundamental interaction of gravitation as a result of spacetime being curved by matter and energy:

$$
R_{\\mu\\nu} - \\frac{1}{2}R g_{\\mu\\nu} + \\Lambda g_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}
$$

Next, the Standard Model Lagrangian (simplified), which describes three of the four known fundamental forces:

$$
\\mathcal{L} = -\\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu} + i\\bar{\\psi}\\cancel{D}\\psi + |D_\\mu\\phi|^2 - V(\\phi)
$$
`,
  react: `I can render interactive React components inline! Watch this:

\`\`\`react:SmartButton label=Initialize Protocol variant=primary
\`\`\`

Here's a counter with a custom label:

\`\`\`react:Counter label=User Score initial=42
\`\`\`

And a complex todo list:

\`\`\`react:TodoList title=Dev Roadmap
\`\`\`

Finally, a stealthy variant of the smart button:

\`\`\`react:SmartButton label=Secondary Action variant=outline
\`\`\`

You can also toggle system features:

\`\`\`react:FeatureToggle feature=NeuralSync initialEnabled=true
\`\`\`
`,
  architecture: `Here is a technical analysis regarding your request to synchronize Obsidian with a Neon database.

### Tech Stack Comparison
We need to choose the right driver for high-performance Rust ingestion.

\`\`\`react:ComparisonTable data=Feature|Tokio_Postgres|SQLx;Perf|High|Medium;Type Safety|Low|High;Async|Yes|Yes;Ease of Use|No|Yes
\`\`\`

Based on the analysis, **SQLx** is recommended for its balance of safety and ergonomics.

### Implementation Blueprint
Here's how we define the core sync loop:

\`\`\`rust
pub async fn sync_vault(path: &Path) -> Result<()> {
    let files = scan_obsidian(path)?;
    for file in files {
        db::upsert_post(file).await?;
    }
    Ok(())
}
\`\`\`

\`\`\`react:SummaryCard title=Architect Notes points=Use pgvector for content search,Implement soft-delete for sync safety,Optimize R2 upload for images
\`\`\`
`
};

interface StreamControlsProps {
  onUpdate: (text: string) => void;
  engine: any;
}

export function StreamControls({ engine }: StreamControlsProps) {
  const [presetKey, setPresetKey] = useState<keyof typeof PRESETS>("mixed");

  const handlePresetChange = (key: keyof typeof PRESETS) => {
    setPresetKey(key);
    engine.resetStream();
  };

  return (
    <div className="flex flex-col gap-6 p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={16} className={cn(engine.isPlaying && "animate-pulse text-yellow-400")} />
          <h2 className="text-sm font-black uppercase tracking-widest">Presets</h2>
        </div>
        <div className="text-[10px] font-mono opacity-40">
          INDEX: {engine.index} / {engine.total}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.keys(PRESETS).map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => handlePresetChange(key as any)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase",
              presetKey === key 
                ? "bg-primary text-primary-foreground shadow-glow-sm" 
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <label htmlFor="speed-range" className="text-[10px] font-black uppercase tracking-widest opacity-40 flex justify-between">
          Speed (ms per chunk)
          <span className="text-primary">{engine.speed}ms</span>
        </label>
        <input 
          id="speed-range"
          type="range" 
          min="10" 
          max="100" 
          step="5"
          value={engine.speed}
          onChange={(e) => engine.setSpeed(Number(e.target.value))}
          className="w-full accent-primary bg-white/5 rounded-lg h-1 appearance-none cursor-pointer"
        />
      </div>

      <div className="flex gap-2">
        {engine.isPlaying ? (
          <button
            type="button"
            onClick={engine.pauseStream}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold text-xs"
          >
            <Pause size={14} fill="currentColor" />
            PAUSE
          </button>
        ) : (
          <button
            type="button"
            onClick={() => engine.startStream(PRESETS[presetKey])}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-glow-sm"
          >
            <Play size={14} fill="currentColor" />
            START
          </button>
        )}
        
        <button
          type="button"
          onClick={engine.resetStream}
          className="p-3 rounded-xl border border-white/10 hover:bg-white/5 transition-all"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}
