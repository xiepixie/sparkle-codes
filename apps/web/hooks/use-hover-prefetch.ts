"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { prefetchPost } from "@/lib/client-prefetch";

export function useHoverPrefetch(path: string, delayMs = 350) {
	const router = useRouter();
	const [prefetchState, setPrefetchState] = React.useState<
		"idle" | "loading" | "ready"
	>("idle");
	const [hasBeenPrefetched, setHasBeenPrefetched] = React.useState(false);
	const prefetchTimerRef = React.useRef<NodeJS.Timeout | null>(null);

	const handleMouseEnter = React.useCallback(() => {
		if (prefetchState === "idle") {
			if (hasBeenPrefetched) {
				setPrefetchState("ready");
			} else {
				prefetchTimerRef.current = setTimeout(() => {
					setPrefetchState("loading");
					const startTime = Date.now();

					// Actual Next.js Route Prefetch
					router.prefetch(`/blog/${path}`);

					// Truthful Data Prefetch
					prefetchPost(path).then((success) => {
						const elapsed = Date.now() - startTime;
						const minDelay = 180; // Sensory buffer to ensure the drawing phase is visible
						const remaining = Math.max(0, minDelay - elapsed);

						setTimeout(() => {
							if (success !== false) {
								setPrefetchState("ready");
								setHasBeenPrefetched(true);
							} else {
								setPrefetchState("idle");
							}
						}, remaining);
					});
				}, delayMs);
			}
		}
	}, [path, prefetchState, hasBeenPrefetched, router, delayMs]);

	const handleMouseLeave = React.useCallback(() => {
		if (prefetchTimerRef.current) {
			clearTimeout(prefetchTimerRef.current);
			prefetchTimerRef.current = null;
		}
		setPrefetchState("idle");
	}, []);

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			if (prefetchTimerRef.current) {
				clearTimeout(prefetchTimerRef.current);
			}
		};
	}, []);

	return {
		prefetchState,
		hasBeenPrefetched,
		handleMouseEnter,
		handleMouseLeave,
	};
}
