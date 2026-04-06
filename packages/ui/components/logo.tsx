import { cn } from "../lib";

export function Logo({
	withLabel = true,
	className,
}: {
	className?: string;
	withLabel?: boolean;
}) {
	return (
		<span
			className={cn(
				"flex items-center font-semibold text-foreground leading-none",
				className,
			)}
		>
			<svg className="size-10 text-primary drop-shadow-[0_2px_10px_rgba(var(--primary),0.3)]" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
				<title>Sparkle Codes</title>
				{/* Large Central Star */}
				<path 
					d="M16 2C16 2 16.6 11 22 16C27.4 21 30 21.5 30 21.5C30 21.5 24 22 16 29C8 22 2 21.5 2 21.5C2 21.5 4.6 21 10 16C15.4 11 16 2 16 2Z" 
					fill="currentColor"
				/>
				{/* Top Right Small Star */}
				<path 
					d="M26 4C26 4 26.3 7 28.5 9C30.7 11 32 11.2 32 11.2C32 11.2 29.5 11.4 26 14C22.5 11.4 20 11.2 20 11.2C20 11.2 21.3 11 23.5 9C25.7 7 26 4 26 4Z" 
					fill="currentColor"
					opacity="0.6"
				/>
				{/* Bottom Left Tiny Star */}
				<path 
					d="M6 24C6 24 6.2 26 7.5 27.5C8.8 29 10 29.1 10 29.1C10 29.1 8 29.3 6.5 31C5 29.3 3 29.1 3 29.1C3 29.1 4.2 29 5.5 27.5C6.8 26 6 24 6 24Z" 
					fill="currentColor"
					opacity="0.4"
				/>
				{/* Center Core of Main Star */}
				<circle cx="16" cy="18" r="1.5" fill="white" fillOpacity="0.8" />
			</svg>
			{withLabel && (
				<span className="ml-3 hidden text-lg md:block">Sparkle</span>
			)}
		</span>
	);
}
