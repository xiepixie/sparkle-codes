"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { writeSharedString } from "../lib/shared-ui-state";

const THEME_STATE_KEY = "theme";

export function ThemeCookieSync() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const nextTheme =
      theme && theme !== "system"
        ? theme
        : resolvedTheme && resolvedTheme !== "system"
          ? resolvedTheme
          : null;

    if (!nextTheme) return;
    writeSharedString(THEME_STATE_KEY, nextTheme);
  }, [resolvedTheme, theme]);

  return null;
}

export default ThemeCookieSync;
