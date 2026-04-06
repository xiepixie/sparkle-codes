import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Logo, StarryBackground, ThemeCookieSync } from "@repo/ui";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { Playfair_Display, Poppins, JetBrains_Mono } from "next/font/google";
import type { Metadata } from "next";
import { StarCursorWrapper } from "./StarCursorWrapper";
import { getAppUrl } from "@repo/utils";
import { source } from "@/lib/source";

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
	metadataBase: new URL("http://localhost:3001"),
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
						links={[
							{ 
								text: "Main Site", 
								url: getAppUrl('web'), 
								// @ts-ignore
								external: true,
							},
						]}
					>
						{children}
					</DocsLayout>
				</RootProvider>
			</body>
		</html>
	);
}
