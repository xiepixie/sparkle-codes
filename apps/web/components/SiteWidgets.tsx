"use client";

import React, { useEffect, useState } from "react";

export function GithubActivity() {
	const [weeks, setWeeks] = useState<number[][]>([]);

	useEffect(() => {
		// Generate mock GitHub contribution data on the client to avoid Next.js 15 pre-render errors
		const data = Array.from({ length: 14 }).map(() =>
			Array.from({ length: 7 }).map(() => Math.floor(Math.random() * 5)),
		);
		setWeeks(data);
	}, []);

	// Initial skeleton while generating random state
	if (weeks.length === 0) {
		return (
			<div className="flex flex-col h-full justify-between animate-pulse opacity-50">
				<div className="flex gap-1.5 overflow-hidden">
					{Array.from({ length: 14 }).map((_, i) => (
						<div key={i} className="flex flex-col gap-1.5 flex-1">
							{Array.from({ length: 7 }).map((_, j) => (
								<div
									key={j}
									className="w-full aspect-square rounded-[2px] bg-primary/10"
								/>
							))}
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full justify-between">
			<div className="flex gap-1.5 overflow-hidden">
				{weeks.map((week, weekIndex) => (
					<div key={weekIndex} className="flex flex-col gap-1.5 flex-1">
						{week.map((level, dayIndex) => {
							let color = "bg-primary/10";
							if (level === 1) {
								color = "bg-primary/30";
							}
							if (level === 2) {
								color = "bg-primary/50";
							}
							if (level === 3) {
								color = "bg-primary/80";
							}
							if (level === 4) {
								color =
									"bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]";
							}

							return (
								<div
									key={dayIndex}
									className={`w-full aspect-square rounded-[2px] transition-all hover:ring-2 hover:ring-primary/40 ${color}`}
									title={`Level ${level}`}
								/>
							);
						})}
					</div>
				))}
			</div>
			<div className="flex items-center justify-between mt-4">
				<div className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-medium">
					Last 90 Days
				</div>
				<div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
					<span>Less</span>
					<div className="w-2 h-2 rounded-[1px] bg-primary/10 border border-primary/5" />
					<div className="w-2 h-2 rounded-[1px] bg-primary/40 border border-primary/5" />
					<div className="w-2 h-2 rounded-[1px] bg-primary/70 border border-primary/5" />
					<div className="w-2 h-2 rounded-[1px] bg-primary border border-primary/5" />
					<span>More</span>
				</div>
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
				<span className="text-xs font-mono font-bold text-emerald-500">
					12ms
				</span>
			</div>
			<div className="text-[10px] text-muted-foreground uppercase tracking-widest">
				Neon DB Latency
			</div>
		</div>
	);
}
