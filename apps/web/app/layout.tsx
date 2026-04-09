import type { Metadata } from "next";
import { JetBrains_Mono, Poppins } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ClientProviders } from "@/components/ClientProviders";
import { CommandMenu } from "@/components/CommandMenu";
import { NavBar } from "@/components/Layout/NavBar";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "sparkle.codes | Xavier Pax",
  description:
    "The personal blog and product lab of Xavier Pax (xpx), focused on applied AI, workflow systems, and technical writing.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preload critical KaTeX font to prevent FOIT */}
        <link 
          rel="preload" 
          href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/fonts/KaTeX_Main-Regular.woff2" 
          as="font" 
          type="font/woff2" 
          crossOrigin="anonymous" 
        />
      </head>
      <body className={`${poppins.className} ${jetbrainsMono.variable} min-h-screen bg-background text-foreground antialiased selection:bg-primary/30`}>
        <ClientProviders>
          {/* Immersive Starry Layers (Client Components) */}
          
          <NavBar />
          
          {/* Primary Viewport Area */}
          <main className="relative z-0 min-h-screen">
            {children}
          </main>
          
          {/* Global Interaction Overlays */}
          <Suspense fallback={null}>
            <CommandMenu />
          </Suspense>
        </ClientProviders>
      </body>
    </html>
  );
}
