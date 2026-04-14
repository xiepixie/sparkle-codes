import Image from "next/image";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
	return {
		...defaultMdxComponents,
		img: (props) => {
			const { src, alt, width, height, ...rest } = props;
			// If it's a string src and missing dimensions, use Image with unoptimized if necessary
			if (typeof src === "string" && (!width || !height)) {
				// Special check for the known problematic Privacy Policy URL if it somehow persists
				if (src.toLowerCase().includes("privacy%20policy")) {
					return <a href={src} className="text-primary underline">{alt || "Privacy Policy"}</a>;
				}
				
				return (
					<Image 
						src={src}
						alt={alt || ""}
						{...rest}
						width={800}
						height={600}
						className="rounded-lg border border-border/50 max-w-full h-auto"
						loading="lazy"
						unoptimized={true}
					/>
				);
			}
			
			return (
				<Image 
					src={src as string}
					alt={alt || ""}
					width={width as number}
					height={height as number}
					{...rest}
					className="rounded-lg border border-border/50" 
				/>
			);
		},
		...components,
	};
}
