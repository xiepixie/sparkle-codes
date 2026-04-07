import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Logo, StarryBackground, ThemeCookieSync } from "@repo/ui";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { Playfair_Display, Poppins, JetBrains_Mono } from "next/font/google";
import type { Metadata } from "next";
import { StarCursorWrapper } from "./StarCursorWrapper";
import { getAppUrl } from "@repo/utils";
import { source } from "@/lib/source";
import { ExternalLink } from "lucide-react";

const serif = Playfair_Display({
	subsets: ["latin"],
	variable: "--font-serif",
});

const sans = Poppins({
	subsets: ["latin"],
	weight: ["300", "400", "500", "600"],
	variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
});

export const metadata: Metadata = {
	metadataBase: new URL("https://docs.sparkle.codes"),
	title: "Sparkle Codes Docs",
	description: "Documentation for Sparkle Codes",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${sans.variable} ${serif.variable} ${jetbrainsMono.variable} ${sans.className}`} suppressHydrationWarning>
			<body className="flex flex-col min-h-screen">
				<RootProvider 
					search={{ enabled: true }}
					theme={{ enabled: true, defaultTheme: "light", enableSystem: false }}
				>
					<ThemeCookieSync />
					<StarryBackground />
					<StarCursorWrapper />
					<DocsLayout
						tree={source.getPageTree()}
						nav={{
							title: (
								<span className="inline-flex items-center gap-2.5 group/title">
									<Logo withLabel={false} className="size-8 transition-transform group-hover/title:rotate-[15deg] group-hover/title:scale-110" />
									<span className="font-semibold text-lg tracking-tight hidden sm:inline-block text-foreground transition-colors group-hover/title:text-primary">
										Sparkle <span className="text-muted-foreground/60 font-normal ml-0.5">Docs</span>
									</span>
								</span>
							),
						}}
						sidebar={{
							footer: (
								<div key="sidebar-footer-link" className="flex items-center justify-end">
									<a
										href={getAppUrl("web")}
										target="_blank"
										rel="noreferrer"
										className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:text-foreground bg-secondary/50 border border-border rounded-full hover:bg-secondary hover:border-border/80 group"
									>
										<ExternalLink className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 opacity-70 group-hover:opacity-100" />
										<span>Main Site</span>
									</a>
								</div>
							),
						}}
					>
						{children}
					</DocsLayout>
				</RootProvider>
			</body>
		</html>
	);
}
