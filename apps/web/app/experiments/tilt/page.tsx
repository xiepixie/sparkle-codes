"use client";

import { ThemeToggle, TiltWrapper } from "@repo/ui";

export default function TiltExperimentPage() {
	return (
		<div className="min-h-screen bg-background p-12 transition-colors duration-500">
			{/* Floating Control Center */}
			<div className="fixed top-8 right-8 z-50 flex items-center gap-4 bg-muted/20 backdrop-blur-xl border border-white/5 p-2 rounded-2xl">
				<div className="px-3 text-xs font-mono text-muted-foreground uppercase tracking-widest border-r border-white/10 mr-1">
					Optical Control Panel
				</div>
				<ThemeToggle />
			</div>

			<header className="space-y-4 mb-20 max-w-2xl">
				<h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">
					Optical Lab <span className="text-primary italic">v2.0</span>
				</h1>
				<p className="text-muted-foreground leading-relaxed text-lg">
					Benchmarking the finalized "Starry Night" Dual-Preset system. Focusing
					on the balance between physical stability and atmospheric depth.
				</p>
			</header>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
				{/* VARIANT A: Industrial */}
				<div className="space-y-8">
					<div className="flex items-center justify-between px-2">
						<h2 className="text-sm font-mono text-primary/80 uppercase tracking-[0.2em] font-bold">
							Industrial Physics
						</h2>
						<code className="px-2 py-1 rounded bg-secondary text-[10px] font-mono">
							industrial
						</code>
					</div>
					<TiltWrapper variant="industrial" className="h-[500px]">
						<div className="h-full flex flex-col justify-end space-y-6">
							<h3 className="text-3xl font-bold tracking-tight">
								Industrial Material
							</h3>
							<div className="space-y-3">
								<div className="flex gap-2 items-center text-xs text-muted-foreground">
									<div className="w-2 h-2 rounded-full bg-primary" />
									<span>24px Volumetric Shadow Depth</span>
								</div>
								<div className="flex gap-2 items-center text-xs text-muted-foreground">
									<div className="w-2 h-2 rounded-full bg-primary" />
									<span>2xl Frosted Backdrop Blur</span>
								</div>
								<div className="flex gap-2 items-center text-xs text-muted-foreground">
									<div className="w-2 h-2 rounded-full bg-primary" />
									<span>Balanced Refractive Response (-0.3)</span>
								</div>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								The standard for high-end technical interfaces. Provides a
								heavy, physical feel resembling precision-cut glass with
								moderate translucency.
							</p>
							<div className="pt-6 border-t border-white/5 text-[10px] uppercase font-mono tracking-widest opacity-40">
								Primary Logic: Physical Accuracy
							</div>
						</div>
					</TiltWrapper>
				</div>

				{/* VARIANT B: Nebula */}
				<div className="space-y-8">
					<div className="flex items-center justify-between px-2">
						<h2 className="text-sm font-mono text-primary uppercase tracking-[0.2em] font-bold">
							Atmospheric Depth
						</h2>
						<code className="px-2 py-1 rounded bg-primary/10 text-primary text-[10px] font-mono border border-primary/20">
							nebula
						</code>
					</div>
					<TiltWrapper variant="nebula" className="h-[500px]">
						<div className="h-full flex flex-col justify-end space-y-6">
							<h3 className="text-3xl font-bold tracking-tight">
								Nebula Surface
							</h3>
							<div className="space-y-3 text-primary/80">
								<div className="flex gap-2 items-center text-xs">
									<div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
									<span>45px Extreme Parallax Void</span>
								</div>
								<div className="flex gap-2 items-center text-xs">
									<div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
									<span>3xl Heavy Smoke Backdrop Blur</span>
								</div>
								<div className="flex gap-2 items-center text-xs">
									<div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
									<span>Colored Specular Subsurface Scatter</span>
								</div>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed">
								Designed for immersive hero sections and storytelling. Creates
								an optical illusion of vast internal depth, drawing the user
								into the interface.
							</p>
							<div className="pt-6 border-t border-white/5 text-[10px] uppercase font-mono tracking-widest text-primary/60">
								Primary Logic: Visual Immersion
							</div>
						</div>
					</TiltWrapper>
				</div>
			</div>

			<footer className="pt-32 mt-32 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground font-mono">
				<div className="flex gap-6">
					<div className="flex items-center gap-2">
						<span className="w-1.5 h-1.5 rounded-full bg-green-500" />
						STABLE OPTICS ENGINE
					</div>
					<div className="flex items-center gap-2">
						<span className="w-1.5 h-1.5 rounded-full bg-primary" />
						DUAL_MATERIAL_V2
					</div>
				</div>
				<div>{"STAR-ENGINE // FINAL_OPTICS_REVIEW // 2026"}</div>
			</footer>
		</div>
	);
}
