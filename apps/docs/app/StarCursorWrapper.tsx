"use client";

import { usePathname } from "next/navigation";
import { StarCursor } from "@repo/ui";

export function StarCursorWrapper() {
  const pathname = usePathname();

  return <StarCursor pathname={pathname} />;
}
