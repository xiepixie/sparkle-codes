"use client";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { readSharedJson, writeSharedJson } from "../../lib/shared-ui-state";
import Brackets from "./Brackets";
import "./cursor.css";

export interface StarCursorProps {
	pathname?: string;
}

const CURSOR_STATE_KEY = "cursor-state";
const CURSOR_PERSIST_INTERVAL_MS = 120;

interface CursorPersistedState {
	pos: { x: number; y: number };
	hasMoved: boolean;
}

const getInitialState = () => {
	if (typeof window === "undefined") {
		return {
			pos: { x: -200, y: -200 },
			hasMoved: false,
		};
	}

	try {
		const sharedState = readSharedJson<CursorPersistedState>(CURSOR_STATE_KEY);
		if (sharedState) {
			return sharedState;
		}

		const savedPos = JSON.parse(
			sessionStorage.getItem("sparkle-cursor-pos") || "null",
		);
		const savedMoved =
			sessionStorage.getItem("sparkle-cursor-has-moved") === "true";
		return {
			pos: savedPos || { x: -200, y: -200 },
			hasMoved: savedMoved,
		};
	} catch {
		return { pos: { x: -200, y: -200 }, hasMoved: false };
	}
};

const INITIAL_CONTEXT = getInitialState();
let GLOBAL_POINTER_POS = INITIAL_CONTEXT.pos;
let GLOBAL_HAS_MOVED = INITIAL_CONTEXT.hasMoved;

function canUseCustomCursor() {
	if (typeof window === "undefined") {
		return false;
	}
	return (
		window.matchMedia("(pointer: fine)").matches &&
		!window.matchMedia("(hover: none)").matches &&
		!window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/**
 * Modern Custom Cursor - High precision dot + intelligent framing
 */
export function StarCursor({ pathname }: StarCursorProps) {
	const dotRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const rafId = useRef<number>(0);
	const releaseTimerRef = useRef<number | null>(null);
	const syncTargetRafRef = useRef<number | null>(null);
	const persistTimerRef = useRef<number | null>(null);
	const viewportShiftTimerRef = useRef<number | null>(null);
	const isCursorEnabled = useRef(false);

	const [isEnabled, setIsEnabled] = useState(false);
	const [hasMoved, setHasMoved] = useState(GLOBAL_HAS_MOVED);

	// High-frequency UI states managed via Refs to avoid React Re-renders
	const modeRef = useRef<"default" | "hidden" | "framing" | "card">("default");
	const isContrastRef = useRef(false);

	// Physics Refs
	const pointerPos = useRef({ ...GLOBAL_POINTER_POS });
	const frameTargetPos = useRef({ ...GLOBAL_POINTER_POS });

	const dotDisplayPos = useRef({ ...GLOBAL_POINTER_POS });
	const frameDisplayPos = useRef({ ...GLOBAL_POINTER_POS });

	const frameSize = useRef({ w: 32, h: 32 });
	const displayFrameSize = useRef({ w: 32, h: 32 });

	const activeTarget = useRef<HTMLElement | null>(null);
	const targetRect = useRef<DOMRect | null>(null);
	const isAnimating = useRef(false);
	const frameCount = useRef(0);

	const flushPersistedPos = useCallback((pos: { x: number; y: number }) => {
		GLOBAL_POINTER_POS = pos;
		GLOBAL_HAS_MOVED = true;
		if (typeof window !== "undefined") {
			sessionStorage.setItem("sparkle-cursor-pos", JSON.stringify(pos));
			sessionStorage.setItem("sparkle-cursor-has-moved", "true");
			writeSharedJson(CURSOR_STATE_KEY, { pos, hasMoved: true });
		}
	}, []);

	const schedulePersistPos = useCallback(
		(pos: { x: number; y: number }) => {
			if (persistTimerRef.current !== null) {
				window.clearTimeout(persistTimerRef.current);
			}

			persistTimerRef.current = window.setTimeout(() => {
				flushPersistedPos(pos);
				persistTimerRef.current = null;
			}, CURSOR_PERSIST_INTERVAL_MS);
		},
		[flushPersistedPos],
	);

	const roRef = useRef<ResizeObserver | null>(null);

	// Cleanup observer on unmount
	useEffect(() => {
		return () => roRef.current?.disconnect();
	}, []);

	const evaluateTarget = useCallback((target: HTMLElement | null) => {
		if (!target || !isCursorEnabled.current) {
			modeRef.current = "default";
			activeTarget.current = null;
			targetRect.current = null;
			isContrastRef.current = false;
			if (roRef.current) roRef.current.disconnect();
			return;
		}

		// Find the true interactive target or container
		// Added [data-tex] to support framing of math blocks (for double-click source view)
		const interactive = target.closest(
			'a, button, [role="button"], input, .interactive, .tag-badge, .premium-link, .premium-tag, .wiki-link, label, [data-tex]',
		) as HTMLElement | null;
		const card = target.closest(".interactive-card");

		// TARGET HYSTERESIS: Prevent jittering between tiny buttons and large containers
		const nextTarget = (interactive || card || null) as HTMLElement | null;
		if (activeTarget.current === nextTarget) {
			return;
		}

		// If we are currently framing a small element and move to its large container parent,
		// we ignore the jump if it's within a tiny movement window.
		if (
			activeTarget.current &&
			nextTarget &&
			nextTarget.contains(activeTarget.current)
		) {
			const currentIsSmall = activeTarget.current.offsetWidth < 120;
			const nextIsContainer =
				nextTarget.hasAttribute("data-tex") ||
				nextTarget.classList.contains("interactive-card") ||
				nextTarget.classList.contains("code-fence-container");

			if (currentIsSmall && nextIsContainer) {
				// We tentatively ignore this move to avoid jitter in tiny gaps
				return;
			}
		}

		if (interactive?.isConnected) {
			modeRef.current = "framing";
			activeTarget.current = interactive;
			
			// DO NOT call getBoundingClientRect() here! 
			// We defer reading layout to RAF, and use a ResizeObserver to catch mutations!
			targetRect.current = null;

			if (!roRef.current) {
				roRef.current = new ResizeObserver(() => {
					// Extremely cheap because it runs post-layout!
					if (activeTarget.current?.isConnected) {
						targetRect.current = activeTarget.current.getBoundingClientRect();
					}
				});
			}
			roRef.current.disconnect();
			roRef.current.observe(interactive);

			isContrastRef.current =
				interactive.classList.contains("bg-primary") ||
				interactive.getAttribute("data-variant") === "primary" ||
				interactive.closest(".bg-primary") !== null;
		} else if (card) {
			modeRef.current = "card";
			activeTarget.current = card as HTMLElement;
			isContrastRef.current = false;
			if (roRef.current) roRef.current.disconnect();
		} else {
			modeRef.current = "default";
			activeTarget.current = null;
			isContrastRef.current = false;
			if (roRef.current) roRef.current.disconnect();
		}
	}, []);

	const syncTargetFromPointer = useCallback(() => {
		if (
			!isCursorEnabled.current ||
			!GLOBAL_HAS_MOVED ||
			typeof document === "undefined"
		) {
			return;
		}

		const { x, y } = pointerPos.current;
		const isPointerInsideViewport =
			x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;

		if (!isPointerInsideViewport) {
			evaluateTarget(null);
			return;
		}

		const hovered = document.elementFromPoint(x, y);
		evaluateTarget(hovered instanceof HTMLElement ? hovered : null);
	}, [evaluateTarget]);

	const scheduleTargetSync = useCallback(() => {
		if (syncTargetRafRef.current !== null) {
			return;
		}

		syncTargetRafRef.current = window.requestAnimationFrame(() => {
			syncTargetRafRef.current = null;
			syncTargetFromPointer();
		});
	}, [syncTargetFromPointer]);

	const update = useCallback(() => {
		if (!isAnimating.current || !isCursorEnabled.current) {
			return;
		}

		const isThemeTransitioning =
			typeof window !== "undefined" &&
			!!(window as any).__SPARKLE_THEME_TRANSITION__;

		// 1. FRAME TARGETING LOGIC
		if (modeRef.current === "framing" && activeTarget.current) {
			const el = activeTarget.current;
			if (!el.isConnected) {
				evaluateTarget(null);
				frameTargetPos.current = pointerPos.current;
				frameSize.current = { w: 32, h: 32 };
			} else {
				// Pure Cache architecture: we ONLY fetch layout metrics if explicitly invalidated
				// by mousemove, scroll, or the ResizeObserver. NO MORE 30FPS POLLING!
				if (!isThemeTransitioning) {
					if (!targetRect.current) {
						targetRect.current = el.getBoundingClientRect();
					}
				}
				
				const rect = targetRect.current;

				if (!rect || rect.width === 0 || rect.height === 0) {
					// Fallback if measurement failed or isn't ready
					frameTargetPos.current = pointerPos.current;
					frameSize.current = { w: 32, h: 32 };
				} else {
					// Perfectly lock to the dynamic center of the moving/resizing element.
					const centerX = rect.left + rect.width / 2;
					const centerY = rect.top + rect.height / 2;

					frameTargetPos.current = { x: centerX, y: centerY };
					frameSize.current = {
						w: Math.max(rect.width + 12, 32),
						h: Math.max(rect.height + 12, 32),
					};
				}
			}
		} else {
			frameTargetPos.current = pointerPos.current;
			frameSize.current = { w: 32, h: 32 };
		}

		// 2. HIGHSPEED KINEMATICS (PHYSICS)
		const dx = pointerPos.current.x - dotDisplayPos.current.x;
		const dy = pointerPos.current.y - dotDisplayPos.current.y;
		const fdx = frameTargetPos.current.x - frameDisplayPos.current.x;
		const fdy = frameTargetPos.current.y - frameDisplayPos.current.y;
		const dw = frameSize.current.w - displayFrameSize.current.w;
		const dh = frameSize.current.h - displayFrameSize.current.h;

		// Skip DOM updates if movement is negligible to save CPU
		const isMoving =
			Math.abs(dx) > 0.1 ||
			Math.abs(dy) > 0.1 ||
			Math.abs(fdx) > 0.1 ||
			Math.abs(fdy) > 0.1 ||
			Math.abs(dw) > 0.1 ||
			Math.abs(dh) > 0.1;

		if (isMoving) {
			// Dot Tracking: Exactly 1:1 removes all perceived lag ("跟手")
			dotDisplayPos.current.x = pointerPos.current.x;
			dotDisplayPos.current.y = pointerPos.current.y;

			// Frame Tracking: Spring-based easing
			const isFraming = modeRef.current === "framing";
			const isCard = modeRef.current === "card";

			// High-performance kinematics: Faster snap on high-precision targets
			const frameLerp = isFraming ? 0.45 : isCard ? 0.18 : 0.28;
			frameDisplayPos.current.x += fdx * frameLerp;
			frameDisplayPos.current.y += fdy * frameLerp;

			// Dimensional scaling animation
			const sizeLerp = isFraming ? 0.4 : 0.25;
			displayFrameSize.current.w += dw * sizeLerp;
			displayFrameSize.current.h += dh * sizeLerp;

			// 3. APPLY DOM UPDATES
			if (dotRef.current) {
				const s = dotRef.current.style;
				const opacity = hasMoved ? 1 : 0;
				s.transform = `translate3d(${dotDisplayPos.current.x}px, ${dotDisplayPos.current.y}px, 0)`;
				s.opacity = opacity.toString();

				// Update classes directly to avoid React Re-render
				const dotDiv = dotRef.current.firstElementChild;
				if (dotDiv) {
					const className = `cursor-dot mode-${modeRef.current} ${isContrastRef.current ? "mode-contrast" : ""}`;
					if (dotDiv.className !== className) {
						dotDiv.className = className;
					}
				}
			}

			if (frameRef.current) {
				const s = frameRef.current.style;
				s.transform = `translate3d(${frameDisplayPos.current.x}px, ${frameDisplayPos.current.y}px, 0) translate(-50%, -50%)`;
				s.width = `${displayFrameSize.current.w}px`;
				s.height = `${displayFrameSize.current.h}px`;
				s.opacity = hasMoved ? "1" : "0";

				// Update classes directly to avoid React Re-render
				const frameDiv = frameRef.current.firstElementChild;
				if (frameDiv) {
					const className = `cursor-frame mode-${modeRef.current} ${isContrastRef.current ? "mode-contrast" : ""}`;
					if (frameDiv.className !== className) {
						frameDiv.className = className;
					}
				}
			}
		}

		rafId.current = requestAnimationFrame(update);
	}, [evaluateTarget]);

	const lastEvaluateTime = useRef(0);
	const handleMouseMove = useEffectEvent((e: MouseEvent) => {
		if (!isCursorEnabled.current) {
			return;
		}

		// Optimization: restart animation if it was stopped (e.g. after context menu)
		if (!isAnimating.current) {
			isAnimating.current = true;
			rafId.current = requestAnimationFrame(update);
		}

		pointerPos.current = { x: e.clientX, y: e.clientY };
		schedulePersistPos({ x: e.clientX, y: e.clientY });

		if (!hasMoved) {
			setHasMoved(true);
			GLOBAL_HAS_MOVED = true;
			dotDisplayPos.current = { x: e.clientX, y: e.clientY };
			frameDisplayPos.current = { x: e.clientX, y: e.clientY };
		}

		if (
			typeof window !== "undefined" &&
			!document.body.classList.contains("custom-cursor-active")
		) {
			document.body.classList.add("custom-cursor-active");
		}

		// Throttle target evaluation to ~60fps independently of mousemove frequency
		const now = performance.now();
		if (now - lastEvaluateTime.current > 16) {
			lastEvaluateTime.current = now;
			evaluateTarget(e.target as HTMLElement);
		}
	});

	const handleInteract = useEffectEvent(() => {
		if (frameRef.current) {
			frameRef.current.classList.add("magnetic-active");
		}
		if (dotRef.current) {
			dotRef.current.classList.add("magnetic-active");
		}
	});

	const handleRelease = useEffectEvent(() => {
		if (releaseTimerRef.current) {
			window.clearTimeout(releaseTimerRef.current);
		}

		if (frameRef.current) {
			frameRef.current.classList.remove("magnetic-active");
			frameRef.current.classList.add("magnetic-click-pulse");
			releaseTimerRef.current = window.setTimeout(() => {
				frameRef.current?.classList.remove("magnetic-click-pulse");
				releaseTimerRef.current = null;
			}, 280);
		}
		if (dotRef.current) {
			dotRef.current.classList.remove("magnetic-active");
		}
	});

	const handleVisibilityChange = useEffectEvent(() => {
		if (document.visibilityState === "visible") {
			// Sync position from other ports/tabs when this one becomes visible
			try {
				const sharedState =
					readSharedJson<CursorPersistedState>(CURSOR_STATE_KEY);
				if (sharedState?.hasMoved) {
					pointerPos.current = { ...sharedState.pos };
					if (!hasMoved) {
						setHasMoved(true);
						GLOBAL_HAS_MOVED = true;
						dotDisplayPos.current = { ...sharedState.pos };
						frameDisplayPos.current = { ...sharedState.pos };
					}
				}
			} catch {}

			scheduleTargetSync();

			if (isCursorEnabled.current && !isAnimating.current) {
				isAnimating.current = true;
				rafId.current = requestAnimationFrame(update);
			}
			return;
		}

		if (persistTimerRef.current !== null) {
			window.clearTimeout(persistTimerRef.current);
			persistTimerRef.current = null;
		}
		flushPersistedPos(pointerPos.current);
	});

	useEffect(() => {
		const syncCursorCapability = () => {
			const nextEnabled = canUseCustomCursor();
			isCursorEnabled.current = nextEnabled;
			setIsEnabled(nextEnabled);

			if (!nextEnabled) {
				document.body.classList.remove("custom-cursor-active");
				modeRef.current = "hidden";
				isContrastRef.current = false;
				activeTarget.current = null;
			} else if (GLOBAL_HAS_MOVED) {
				// We still don't add the class during a raw capability sync to avoid 
				// triggering a full document style recal during hydration.
				// It will be added on the first mousemove.
				modeRef.current = "default";
			}
		};

		const handlePageShow = (e: PageTransitionEvent) => {
			// Re-sync capability on BFCache restore
			syncCursorCapability();
			scheduleTargetSync();
			if (
				(e.persisted || document.visibilityState === "visible") &&
				isCursorEnabled.current
			) {
				// Force restart even if we think we are animating, as BFCache might have halted the loop
				isAnimating.current = false;
				if (!isAnimating.current) {
					isAnimating.current = true;
					rafId.current = requestAnimationFrame(update);
				}
			}
		};

		const handlePageHide = () => {
			if (persistTimerRef.current !== null) {
				window.clearTimeout(persistTimerRef.current);
				persistTimerRef.current = null;
			}
			flushPersistedPos(pointerPos.current);
			isAnimating.current = false;
			if (rafId.current) {
				cancelAnimationFrame(rafId.current);
			}
		};

		const handleContextMenu = () => {
			// When context menu (right click) opens, hide cursor to prevent lag
			modeRef.current = "hidden";
			isAnimating.current = false;
			if (rafId.current) {
				cancelAnimationFrame(rafId.current);
			}
			schedulePersistPos(pointerPos.current);
		};

		syncCursorCapability();

		const pointerQuery = window.matchMedia("(pointer: fine)");
		const hoverQuery = window.matchMedia("(hover: none)");

		const handleMouseDown = (event: MouseEvent) => {
			if (event.button === 0) {
				handleInteract();
			} else if (event.button === 2) {
				handleContextMenu();
			}
		};

		const handleMouseUp = (event: MouseEvent) => {
			if (event.button === 0) {
				handleRelease();
			}
		};

		const handleViewportShift = () => {
			if (viewportShiftTimerRef.current !== null) {
				window.clearTimeout(viewportShiftTimerRef.current);
			}

			// Invalidate cached rect during scroll/resize
			targetRect.current = null;

			viewportShiftTimerRef.current = window.setTimeout(() => {
				scheduleTargetSync();
				viewportShiftTimerRef.current = null;
			}, 150);
		};

		window.addEventListener("mousemove", handleMouseMove, { passive: true });
		window.addEventListener("mousedown", handleMouseDown);
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("contextmenu", handleContextMenu);
		window.addEventListener("resize", syncCursorCapability);
		window.addEventListener("resize", handleViewportShift, { passive: true });
		window.addEventListener("scroll", handleViewportShift, {
			passive: true,
			capture: true,
		});
		window.addEventListener("wheel", handleViewportShift, { passive: true });
		window.addEventListener("pageshow", handlePageShow);
		window.addEventListener("pagehide", handlePageHide);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("blur", handlePageHide);
		pointerQuery.addEventListener("change", syncCursorCapability);
		hoverQuery.addEventListener("change", syncCursorCapability);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("contextmenu", handleContextMenu);
			window.removeEventListener("resize", syncCursorCapability);
			window.removeEventListener("resize", handleViewportShift);
			window.removeEventListener("scroll", handleViewportShift, true);
			window.removeEventListener("wheel", handleViewportShift);
			window.removeEventListener("pageshow", handlePageShow);
			window.removeEventListener("pagehide", handlePageHide);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("blur", handlePageHide);
			pointerQuery.removeEventListener("change", syncCursorCapability);
			hoverQuery.removeEventListener("change", syncCursorCapability);
			document.body.classList.remove("custom-cursor-active");
			isAnimating.current = false;
			if (viewportShiftTimerRef.current !== null) {
				window.clearTimeout(viewportShiftTimerRef.current);
				viewportShiftTimerRef.current = null;
			}
			if (persistTimerRef.current !== null) {
				window.clearTimeout(persistTimerRef.current);
				persistTimerRef.current = null;
			}
			if (syncTargetRafRef.current !== null) {
				window.cancelAnimationFrame(syncTargetRafRef.current);
				syncTargetRafRef.current = null;
			}
			if (releaseTimerRef.current) {
				window.clearTimeout(releaseTimerRef.current);
				releaseTimerRef.current = null;
			}
			if (rafId.current) {
				cancelAnimationFrame(rafId.current);
			}
		};
	}, [update]);

	useLayoutEffect(() => {
		if (typeof window !== "undefined") {
			const canUse = canUseCustomCursor();
			if (GLOBAL_HAS_MOVED && canUse) {
				// We intentionally avoid adding 'custom-cursor-active' here to prevent
				// layout thrashing during the Page Transition/Layout phase.
				// It will be lazily added by handleMouseMove.
			} else if (!canUse) {
				document.body.classList.remove("custom-cursor-active");
			}
			
			// Reset mode on pathname change to prevent "sticking" to ghost elements
			modeRef.current = "default";
			activeTarget.current = null;
			targetRect.current = null;
			isContrastRef.current = false;
		}
	}, [pathname]);

	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted || !isEnabled) {
		return null;
	}

	return (
		<>
			<div
				ref={dotRef}
				className="cursor-dot-wrapper"
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					zIndex: 999999,
					pointerEvents: "none",
					transform: `translate3d(${GLOBAL_POINTER_POS.x}px, ${GLOBAL_POINTER_POS.y}px, 0)`,
					opacity: 0,
				}}
			>
				<div className="cursor-dot mode-default" />
			</div>
			<div
				ref={frameRef}
				className="cursor-frame-wrapper"
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					zIndex: 999998,
					pointerEvents: "none",
					transform: `translate3d(${GLOBAL_POINTER_POS.x}px, ${GLOBAL_POINTER_POS.y}px, 0) translate(-50%, -50%)`,
					width: "36px",
					height: "36px",
					opacity: 0,
				}}
			>
				<div className="cursor-frame mode-default">
					<Brackets />
				</div>
			</div>
		</>
	);
}

export default StarCursor;
