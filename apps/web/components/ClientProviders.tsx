"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Toaster, toast } from "sonner";
import { type ReactNode, useEffect } from "react";
import { config } from "@/config";

// Suppress React 19 "Encountered a script tag" warning from next-themes
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) {
      return;
    }
    originalError.call(console, ...args);
  };
}

interface ClientProvidersProps {
  children: ReactNode;
  initialTheme?: string;
}

import { usePathname } from "next/navigation";
import { StarCursor, ThemeCookieSync, StarryBackground } from "@repo/ui";

/**
 * ClientProviders - Final Hardened Version.
 * 
 * FIX: 'enableColorScheme={false}' is critical for React 19 / Next.js 16 
 * to prevent the 'Encountered a script tag' console error.
 */
export function ClientProviders({ children, initialTheme }: ClientProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={initialTheme || config.defaultTheme}
      enableSystem={false}
      enableColorScheme={false} 
      disableTransitionOnChange
    >
      <InternalProviders>{children}</InternalProviders>
    </ThemeProvider>
  );
}

/**
 * InternalProviders - Nested under ThemeProvider to access theme context correctly.
 */
function InternalProviders({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();

  // ✅ P0: Bridge MarkdownRenderer notifications to Sonner
  useEffect(() => {
    const handleNotify = (e: any) => {
      const { message, level, i18nKey, i18nParams } = e.detail || {};
      const displayMessage = message || i18nKey || "Notification";
      
      if (level === 'error') {
        toast.error(displayMessage, {
            description: i18nParams ? JSON.stringify(i18nParams) : undefined
        });
      } else {
        toast.success(displayMessage, {
            description: i18nParams ? JSON.stringify(i18nParams) : undefined
        });
      }
    };

    window.addEventListener('app-notify', handleNotify);
    return () => window.removeEventListener('app-notify', handleNotify);
  }, []);

  return (
    <>
      <ThemeCookieSync />
      <StarryBackground />
      <StarCursor theme={resolvedTheme} pathname={pathname} />
      {children}
      <Toaster 
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        position="top-right" 
        richColors 
        closeButton
        toastOptions={{
            duration: 4000,
            className: "starry-toast",
        }}
      />
    </>
  );
}
