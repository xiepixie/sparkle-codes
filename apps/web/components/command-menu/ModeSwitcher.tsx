import React from "react";
import { Compass, Folder, Search } from "lucide-react";
import { cn } from "@repo/ui";
import type { CommandMode } from "./types";

interface ModeSwitcherProps {
	mode: CommandMode;
	setMode: (mode: CommandMode) => void;
	setActiveIndex: (index: number) => void;
	readingContext: any;
}

export const ModeSwitcher = React.memo(({
	mode,
	setMode,
	setActiveIndex,
	readingContext,
}: ModeSwitcherProps) => {
	const modes = [
		{ id: "browse" as const, icon: Folder, label: "Explore" },
		{ id: "search" as const, icon: Search, label: "Global Search" },
		{ id: "jump" as const, icon: Compass, label: "Context Jump" },
	];

	return (
		<div className="flex w-full items-center justify-between gap-2 p-1 overflow-x-auto no-scrollbar scroll-smooth">
			{modes.map((m) => {
				const Icon = m.icon;
				const isActive = mode === m.id;
				const isDisabled = m.id === "jump" && !readingContext;
				
				return (
					<button
						key={m.id}
						type="button"
						disabled={isDisabled}
						onClick={() => {
							setMode(m.id);
							setActiveIndex(0);
						}}
						className={cn(
							"group relative flex flex-1 items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all duration-300",
							isActive 
								? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-2 ring-primary/20 ring-offset-2 ring-offset-background" 
								: isDisabled
									? "opacity-20 grayscale pointer-events-none cursor-not-allowed"
									: "bg-muted/20 text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground active:scale-95"
						)}
					>
						<Icon className={cn(
							"h-4 w-4 shrink-0 transition-transform duration-300",
							isActive ? "scale-110" : "scale-100 group-hover:scale-105"
						)} />
						<span className="text-[11px] font-bold tracking-widest uppercase whitespace-nowrap">
							{m.label}
						</span>
						
						{isActive && (
							<span className="absolute -top-1 -right-1 flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75" />
								<span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground" />
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
});

ModeSwitcher.displayName = "ModeSwitcher";