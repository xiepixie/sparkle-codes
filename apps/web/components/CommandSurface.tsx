"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn, Dialog, DialogContent, DialogDescription, DialogTitle } from "@repo/ui";

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
          "command-menu-container overflow-hidden border border-border/40 bg-glass/80 p-0 shadow-2xl ring-1 ring-white/10 backdrop-blur-3xl transition-[background-color,border-color,transform,opacity,box-shadow] duration-500 dark:border-border/20 dark:ring-white/5",
          "before:absolute before:-inset-[100px] before:-z-10 before:bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_70%)] before:opacity-15 dark:before:opacity-10",
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
  return <div className={cn("relative flex items-center gap-4 px-6 py-4.5 border-b border-border/10 dark:border-white/5", className)}>{children}</div>;
}

export function CommandSurfaceBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("relative", className)}>{children}</div>;
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
        "flex h-14 items-center justify-between border-t border-border/10 bg-muted/20 px-6 py-2 transition-colors dark:border-white/5 dark:bg-black/10",
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
      <span className="rounded border border-border/30 bg-background px-1.5 py-0.5 font-mono shadow-sm dark:border-border/10">TAB</span>
      <ArrowRight className="h-2 w-2 opacity-30" />
      <span className={cn("transition-colors", activeMode === "left" ? "text-primary" : "text-muted-foreground/60 dark:text-muted-foreground")}>
        {leftLabel}
      </span>
      <span className="h-1 w-1 rounded-full bg-border" />
      <span className={cn("transition-colors", activeMode === "right" ? "text-primary" : "text-muted-foreground/60 dark:text-muted-foreground")}>
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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-6 opacity-30">{icon}</div>
      <h3 className="mb-1 text-lg font-medium text-foreground">{title}</h3>
      <p className="mb-8 max-w-sm text-xs text-muted-foreground">{description}</p>
      {actions}
    </div>
  );
}
