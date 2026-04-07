"use client";

import { getAppUrl } from "@repo/utils";
import { Logo, Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, cn, ThemeToggle } from "@repo/ui";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const menuItems = [
  { label: "Home", href: "/" },
  { label: "Blog", href: "/blog" },
  { label: "Docs", href: getAppUrl('docs') },
];

export function NavBar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Check if we are in a deep reading mode (blog posts)
  const isBlogPost = pathname.startsWith("/blog/") && pathname !== "/blog";

  if (isBlogPost) {
    return null;
  }

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (typeof document !== "undefined") {
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur();
    }
    setIsOpen(nextOpen);
  };

  return (
    <nav aria-label="Primary" className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-between p-3 sm:p-4 md:p-6 pointer-events-none">
      <div className="pointer-events-auto">
        <Link href="/" className="flex items-center gap-2 font-bold text-base sm:text-lg group/logo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg">
          <Logo withLabel={false} className="transition-all duration-300 group-hover/logo:scale-110 group-hover/logo:rotate-[15deg] group-hover/logo:brightness-125" />
          <span className="hidden sm:inline-block bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60 group-hover/logo:from-primary group-hover/logo:to-foreground transition-all duration-500">Sparkle</span>
        </Link>
      </div>

      {/* Desktop Navigation & Actions */}
      <div className="hidden md:flex items-center gap-4 pointer-events-auto">
        {!isBlogPost ? (
          /* Normal Desktop Nav */
          <div className={cn("flex items-center gap-6 rounded-full border border-border/50 bg-background/50 px-5 py-2 backdrop-blur-xl shadow-2xl shadow-primary/5 transition-opacity duration-300 lg:gap-8 lg:px-6", isOpen && "opacity-0 pointer-events-none")}>
            {menuItems.map((item) => {
              const isExternal = item.href.startsWith('http');
              const Comp = isExternal ? "a" : Link;
              const isActive = pathname === item.href;
              
              return (
                <Comp
                  key={item.href}
                  href={item.href}
                  {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  {...(!isExternal && isActive ? { "aria-current": "page" as const } : {})}
                  className={cn(
                    "rounded-md py-1 text-sm font-medium transition-all hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </Comp>
              );
            })}
            <div className="mx-2 h-4 w-[1px] bg-border/60" />
            <ThemeToggle />
          </div>
        ) : (
          /* Immersion Mode: Condensed Hamburger for Blog Posts */
          <div className="flex items-center gap-3">
             <div className={cn("flex items-center gap-3 transition-opacity duration-300", isOpen && "opacity-0 pointer-events-none")}>
                <ThemeToggle />
             </div>
             <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
                <SheetTrigger asChild>
                  <button type="button" aria-label="Open navigation menu" className={cn("rounded-full border border-border/50 bg-background/50 p-3 backdrop-blur-xl transition-all group/nav interactive hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background", isOpen && "opacity-0 pointer-events-none")}>
                    <Menu className="w-5 h-5 text-muted-foreground group-hover/nav:text-primary transition-transform duration-300 group-hover/nav:scale-110" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" hideClose className="w-[300px] border-l border-border/50 bg-background/88 p-12 backdrop-blur-3xl">
                  <SheetTitle className="text-xs font-bold tracking-widest mb-10 opacity-30 uppercase">Explorer</SheetTitle>
                  <SheetDescription className="sr-only">Deep navigation for technical content.</SheetDescription>
                  <div className="flex flex-col gap-6">
                    {menuItems.map((item, idx) => {
                      const isExternal = item.href.startsWith("http");
                      const Comp = isExternal ? "a" : (Link as any);
                      return (
                        <Comp
                          key={item.href}
                          href={item.href}
                          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          onClick={() => {
                            if (isExternal) {
                              // Use a small delay for external links to ensure the browser opens the tab first
                              setTimeout(() => handleSheetOpenChange(false), 10);
                            } else {
                              handleSheetOpenChange(false);
                            }
                          }}
                          style={{ transitionDelay: `${idx * 40}ms` }}
                          {...(!isExternal && pathname === item.href ? { "aria-current": "page" as const } : {})}
                          className={cn(
                            "rounded-md text-lg font-medium transition-all hover:translate-x-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            pathname === item.href ? "text-primary translate-x-2" : "text-muted-foreground"
                          )}
                        >
                          {item.label}
                        </Comp>
                      );
                    })}
                  </div>
                </SheetContent>
             </Sheet>
          </div>
        )}
      </div>

      {/* Mobile Menu (Always Hamburger) */}
      <div className="flex items-center gap-2 sm:gap-3 md:hidden pointer-events-auto">
        <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
          <div className={cn("flex items-center gap-3 transition-opacity duration-300", isOpen && "opacity-0 pointer-events-none")}>
            <ThemeToggle />
            <SheetTrigger asChild>
              <button type="button" aria-label="Open navigation menu" className="flex h-11 w-11 items-center justify-center rounded-full border border-border/50 bg-background/50 backdrop-blur-xl group/nav interactive hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <Menu className="w-5 h-5 text-muted-foreground group-hover/nav:text-primary transition-colors" />
              </button>
            </SheetTrigger>
          </div>
          <SheetContent side="right" hideClose className="flex w-full flex-col border-l border-border/50 bg-background/92 p-6 backdrop-blur-3xl sm:w-[340px] sm:p-10">
            <SheetTitle className="mb-10 text-xs font-bold uppercase tracking-widest opacity-30">Menu</SheetTitle>
            <SheetDescription className="sr-only">Mobile navigation menu.</SheetDescription>
            <div className="flex flex-col gap-6 sm:gap-8">
              {menuItems.map((item) => {
                const isExternal = item.href.startsWith("http");
                const Comp = isExternal ? "a" : (Link as any);
                
                return (
                  <Comp
                    key={item.href}
                    href={item.href}
                    {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    onClick={() => {
                      if (isExternal) {
                        setTimeout(() => handleSheetOpenChange(false), 10);
                      } else {
                        handleSheetOpenChange(false);
                      }
                    }}
                    {...(!isExternal && pathname === item.href ? { "aria-current": "page" as const } : {})}
                    className={cn(
                      "rounded-2xl px-2 py-2 text-lg font-semibold transition-all hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-xl",
                      pathname === item.href ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </Comp>
                );
              })}
            </div>
            
            {/* Bottom Actions in Mobile Menu */}
            <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-8 sm:pt-10">
               <span className="text-xs text-muted-foreground/50">Theme Mode</span>
               <ThemeToggle />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
