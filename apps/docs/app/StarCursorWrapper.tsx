"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { StarCursor } from "@repo/ui";

export function StarCursorWrapper() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  return <StarCursor pathname={pathname} theme={resolvedTheme} />;
}
