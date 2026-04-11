"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { writeSharedString } from "@repo/utils";

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

    if (!nextTheme) {
      return;
    }
    writeSharedString(THEME_STATE_KEY, nextTheme);
  }, [resolvedTheme, theme]);

  return null;
}

export default ThemeCookieSync;
