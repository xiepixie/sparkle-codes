"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib";

const tagVariants = cva(
	"group/tag inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 backdrop-blur-sm",
	{
		variants: {
			variant: {
				default:
					"bg-primary/5 border-primary/20 text-primary/80 hover:border-primary/40 hover:bg-primary/10 hover:shadow-glow-xs hover:-translate-y-[1px]",
				active:
					"bg-primary/20 border-primary/50 text-primary shadow-glow-sm ring-1 ring-primary/20",
				outline:
					"bg-background/40 border-border/40 text-foreground/50 hover:border-primary/30 hover:bg-primary/5 hover:text-primary hover:-translate-y-[1px]",
			},
			interactive: {
				true: "cursor-pointer active:scale-95",
				false: "cursor-default",
			},
		},
		defaultVariants: {
			variant: "default",
			interactive: false,
		},
	},
);

export interface TagProps
	extends React.HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof tagVariants> {
	asChild?: boolean;
}

const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
	({ className, variant, interactive, children, ...props }, ref) => {
		return (
			<span
				ref={ref}
				className={cn(tagVariants({ variant, interactive, className }))}
				data-cursor={interactive ? "action" : undefined}
				{...props}
			>
				<span className="mr-1 font-mono text-primary/40 transition-colors duration-200 group-hover/tag:text-primary/70">
					#
				</span>
				<span className="relative">{children}</span>
			</span>
		);
	},
);

Tag.displayName = "Tag";

export { Tag, tagVariants };
