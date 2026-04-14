"use client";

import {
	cn,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@repo/ui";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export function CommandSurface({
	open,
	onOpenChange,
	title,
	description = "Search content, jump between sections, or access command actions.",
	className,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					"command-menu-container overflow-hidden w-[95vw] sm:max-w-3xl lg:max-w-4xl border border-border/40 bg-background/88 p-0 shadow-[0_28px_90px_rgba(0,0,0,0.18)] ring-1 ring-white/10 backdrop-blur-3xl transition-[background-color,border-color,transform,opacity,box-shadow] duration-500 dark:border-border/20 dark:bg-background/82 dark:ring-white/5",
					"before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-[radial-gradient(circle_at_top,rgba(var(--primary-rgb),0.16),transparent_72%)] before:opacity-100 before:content-['']",
					"after:absolute after:inset-x-0 after:bottom-0 after:h-24 after:bg-[linear-gradient(to_top,rgba(255,255,255,0.035),transparent)] after:content-[''] dark:after:bg-[linear-gradient(to_top,rgba(255,255,255,0.025),transparent)]",
					className,
				)}
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">{description}</DialogDescription>
				{children}
			</DialogContent>
		</Dialog>
	);
}

export function CommandSurfaceHeader({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative flex items-center gap-4 border-b border-border/10 px-6 py-5 dark:border-white/5",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function CommandSurfaceBody({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={cn("relative z-10", className)}>{children}</div>;
}

export function CommandSurfaceFooter({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex min-h-16 items-center justify-between border-t border-border/10 bg-muted/10 px-6 py-3 transition-colors dark:border-white/5 dark:bg-white/[0.03]",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function CommandModeRail({
	leftLabel,
	rightLabel,
	activeMode,
}: {
	leftLabel: string;
	rightLabel: string;
	activeMode: "left" | "right";
}) {
	return (
		<div className="flex items-center gap-2">
			<span className="rounded border border-border/30 bg-background px-1.5 py-0.5 font-mono shadow-sm dark:border-border/10">
				TAB
			</span>
			<ArrowRight className="h-2 w-2 opacity-30" />
			<span
				className={cn(
					"transition-colors",
					activeMode === "left"
						? "text-primary"
						: "text-muted-foreground/60 dark:text-muted-foreground",
				)}
			>
				{leftLabel}
			</span>
			<span className="h-1 w-1 rounded-full bg-border" />
			<span
				className={cn(
					"transition-colors",
					activeMode === "right"
						? "text-primary"
						: "text-muted-foreground/60 dark:text-muted-foreground",
				)}
			>
				{rightLabel}
			</span>
		</div>
	);
}

export function CommandEmptyState({
	icon,
	title,
	description,
	actions,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center px-6 py-16 text-center sm:px-10">
			<div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-background/70 shadow-sm">
				<div className="opacity-50">{icon}</div>
			</div>
			<h3 className="mb-2 text-base font-semibold tracking-tight text-foreground">{title}</h3>
			<p className="mb-8 max-w-sm text-sm leading-6 text-muted-foreground">
				{description}
			</p>
			{actions}
		</div>
	);
}
