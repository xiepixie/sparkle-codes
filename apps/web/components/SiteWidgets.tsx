"use client";

import React, { useState } from "react";

const MOCK_WEEKS = [
	[1, 2, 1, 0, 0, 0, 0],
	[0, 0, 1, 2, 1, 0, 0],
	[0, 1, 0, 0, 0, 1, 2],
	[1, 3, 2, 1, 0, 0, 1],
	[0, 0, 1, 0, 2, 1, 0],
	[0, 1, 2, 1, 0, 0, 0],
	[1, 2, 4, 3, 2, 1, 0],
	[0, 1, 0, 1, 2, 1, 0],
	[0, 0, 1, 2, 1, 0, 1],
	[1, 3, 2, 1, 0, 1, 2],
	[0, 1, 0, 1, 0, 0, 1],
	[1, 2, 1, 3, 2, 1, 2],
	[0, 1, 2, 1, 1, 0, 1],
	[2, 4, 3, 1, 2, 3, 1],
];

export function GithubActivity() {
	const [weeks] = useState<number[][]>(MOCK_WEEKS);

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
