"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Brackets from "./Brackets";
import "./cursor.css";

export interface StarCursorProps {
	pathname?: string;
}

type CursorMode =
	| "hidden"
	| "tracking"
	| "hover-link"
	| "hover-button"
	| "hover-card"
	| "text"
	| "disabled";

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

export function StarCursor({ pathname }: StarCursorProps) {
	const coreRef = useRef<HTMLDivElement>(null);
	const ringRef = useRef<HTMLDivElement>(null);
	const auraRef = useRef<HTMLDivElement>(null);

	const [isEnabled, setIsEnabled] = useState(false);

	// Pure Data State for the RAF loop
	const state = useRef({
		mode: "hidden" as CursorMode,
		isContrast: false,
		pointer: { x: -100, y: -100 },
		ring: { x: -100, y: -100 },
		ringSize: { w: 32, h: 32 },
		isPressing: false,
		started: false,
	});

	// Magnetic Bounds Cache (Avoiding Layout Thrashing)
	const activeTarget = useRef<HTMLElement | null>(null);
	const bounds = useRef({
		w: 32,
		h: 32,
		cx: 0,
		cy: 0,
		isActive: false,
	});

	const rafId = useRef<number>(0);
	const isAnimating = useRef(false);

	// Method to update bounds from activeTarget safely
	const updateTargetBounds = () => {
		if (activeTarget.current && bounds.current.isActive) {
			const rect = activeTarget.current.getBoundingClientRect();
			bounds.current = {
				w: rect.width,
				h: rect.height,
				cx: rect.left + rect.width / 2,
				cy: rect.top + rect.height / 2,
				isActive: true, // Maintain active flag
			};
		}
	};

	useEffect(() => {
		const syncCapability = () => {
			const nextEnabled = canUseCustomCursor();
			setIsEnabled(nextEnabled);
			if (!nextEnabled) {
				state.current.mode = "hidden";
				isAnimating.current = false;
				document.body.classList.remove("custom-cursor-active");
			}
		};

		syncCapability();

		// Responsive Resize Observer to track dynamic element size changes
		const resizeObserver = new ResizeObserver(() => {
			updateTargetBounds();
		});

		// The Single Source of Truth Animation Loop
		const update = () => {
			/**
			 * THEME TRANSITION LOCK (决策型注释)
			 * 为什么：在 View Transition API 运行期间，浏览器会捕捉当前页面的快照并与新状态进行混合。
			 * 如果此时动画循环继续运行，会导致：
			 * 1. CPU 争用：快照捕获与动画重绘竞争主线程。
			 * 2. 视觉幽灵：快照中包含旧位置，而实时渲染层跳转到新位置，造成“双影”现象。
			 * 在 transition 期间静默循环直到锁释放，确保了工业级的交互丝滑感。
			 */
			if (!isAnimating.current || (window as any).__SPARKLE_THEME_TRANSITION__) {
				if (isAnimating.current) {
					rafId.current = requestAnimationFrame(update);
				}
				return;
			}

			const s = state.current;
			const b = bounds.current;

			// Base Target Definitions
			let targetX = s.pointer.x;
			let targetY = s.pointer.y;
			let targetW = 32;
			let targetH = 32;

			let ringLerp = 0.25;
			let magneticCorePull = 0; // 0 = follow mouse true, 1 = snapped to center

			// --- Removed Magnetism & Refined Framing ---
			switch (s.mode) {
				case "hover-button":
					ringLerp = 0.35;
					if (b.isActive) {
						targetW = b.w + 12;
						targetH = b.h + 12;
						// No forced displacement: ring follows pointer but snaps bounds
                        targetX = b.cx;
                        targetY = b.cy;
						magneticCorePull = 0; // Principle: No forced movement of the core
					}
					break;
				case "hover-link":
					ringLerp = 0.4;
					if (b.isActive) {
						targetW = b.w + 6;
						targetH = b.h + 6;
						targetX = b.cx;
						targetY = b.cy;
						magneticCorePull = 0;
					}
					break;
				case "hover-card":
					ringLerp = 0.15;
					if (b.isActive) {
						targetW = b.w + 24;
						targetH = b.h + 24;
						targetX = s.pointer.x;
						targetY = s.pointer.y;
					}
					break;
				case "text":
				case "hidden":
				case "disabled":
					targetW = 0;
					targetH = 0;
					break;
				// Default tracking behavior
				default:
					ringLerp = 0.3;
					targetW = 28; // Slightly smaller for precision
					targetH = 28;
					break;
			}

			// Apply Click Pulse
			if (s.isPressing) {
				// We ONLY shrink the ring sizes if it's freely tracking! 
				// If it's framing a button/link, the boundaries ARE the source of truth, 
				// shrinking it would detach the frame from the button's edges, causing UX jitter.
				if (!b.isActive) {
					targetW *= 0.85;
					targetH *= 0.85;
				}
			}

			// Kinematics: Lerp the ring towards expected targets
			s.ring.x += (targetX - s.ring.x) * ringLerp;
			s.ring.y += (targetY - s.ring.y) * ringLerp;
			
			// Morph ring size smoothly
			s.ringSize.w += (targetW - s.ringSize.w) * 0.3;
			s.ringSize.h += (targetH - s.ringSize.h) * 0.3;

			// -- DOM Writes --
			// -- DOM Writes --
			if (coreRef.current) {
				const coreX = s.pointer.x;
				const coreY = s.pointer.y;
				let coreScale = s.isPressing ? 1.5 : 1;
				if (s.mode === "text" || s.mode === "hidden" || s.mode === "disabled") {
					coreScale = 0;
				}
				coreRef.current.style.transform = `translate3d(${coreX}px, ${coreY}px, 0) scale(${coreScale})`;
				
				if (coreRef.current.dataset.contrast !== String(s.isContrast)) {
					coreRef.current.dataset.contrast = String(s.isContrast);
					coreRef.current.className = `cursor-core ${s.isContrast ? "contrast" : ""}`;
				}
			}

			if (ringRef.current) {
				ringRef.current.style.transform = `translate3d(${s.ring.x}px, ${s.ring.y}px, 0)`;
				ringRef.current.style.width = `${s.ringSize.w}px`;
				ringRef.current.style.height = `${s.ringSize.h}px`;
				ringRef.current.style.marginLeft = `${-s.ringSize.w / 2}px`;
				ringRef.current.style.marginTop = `${-s.ringSize.h / 2}px`;
				
				if (ringRef.current.dataset.mode !== s.mode) {
					ringRef.current.dataset.mode = s.mode;
					ringRef.current.className = `cursor-ring mode-${s.mode} ${s.isContrast ? "contrast" : ""}`;
				}
			}

			if (auraRef.current) {
				const isAuraActive = s.mode !== "hidden" && s.mode !== "text" && s.mode !== "disabled";
				const aScale = isAuraActive ? (s.isPressing ? 1.4 : 1) : 0;
				// Aura follows the core (true pointer) for most natural 'glow'
				auraRef.current.style.transform = `translate3d(${s.pointer.x}px, ${s.pointer.y}px, 0) scale(${aScale})`;
				
				if (auraRef.current.dataset.mode !== s.mode) {
					auraRef.current.dataset.mode = s.mode;
					auraRef.current.className = `cursor-aura mode-${s.mode}`;
				}
			}

			rafId.current = requestAnimationFrame(update);
		};

		// Event-Driven Logic
		const handleMouseMove = (e: MouseEvent) => {
			if (!canUseCustomCursor()) {
				return;
			}

			if (!state.current.started) {
				state.current.started = true;
				state.current.ring.x = e.clientX;
				state.current.ring.y = e.clientY;
				document.body.classList.add("custom-cursor-active");
				if (!isAnimating.current) {
					isAnimating.current = true;
					rafId.current = requestAnimationFrame(update);
				}
			}

			state.current.pointer.x = e.clientX;
			state.current.pointer.y = e.clientY;

			if (state.current.mode === "hidden") {
				state.current.mode = "tracking";
			}
		};

		const getInteractiveMode = (target: HTMLElement | null): CursorMode => {
			if (!target) {
				return "tracking";
			}

            // 1. High-Priority Interactive Elements (Linked/Buttons)
			if (target.closest('button, [role="button"], .interactive, .tag-badge, .premium-tag')) {
				return "hover-button";
			}
			if (target.closest("a, .premium-link, .wiki-link")) {
				return "hover-link";
			}

            // 2. High-Priority Display Elements (Mermaid/Math) - Must stay visible
            if (target.closest('.mermaid, .mermaid-render-container, svg, .math-inline, .math-block, .katex')) {
                const parentLink = target.closest('a');
                return parentLink ? "hover-link" : "tracking";
            }

			// 3. Fallback: Text editing / Code selection zones - Native Priority Hide
			if (
				target.closest(
					'pre, code, textarea, input[type="text"], iframe, .no-custom-cursor',
				)
			) {
				return "text";
			}

			return "tracking";
		};

		const checkContrast = (target: HTMLElement | null) => {
			if (!target) {
				return false;
			}
			return (
				target.classList.contains("bg-primary") ||
				target.getAttribute("data-variant") === "primary" ||
				target.closest(".bg-primary") !== null
			);
		};

		const handleMouseOver = (e: MouseEvent) => {
			if (!state.current.started) {
				return;
			}
			const target = e.target as HTMLElement;
			const newMode = getInteractiveMode(target);
			state.current.mode = newMode;
			state.current.isContrast = checkContrast(target);

			// Activate Intelligence Bounds Cache when hovering specialized targets
			if (newMode !== "tracking" && newMode !== "text") {
				// Find exactly the semantic element, not its inner child
				const semanticTarget = target.closest('button, [role="button"], a, .interactive-card, .premium-link, .wiki-link, .interactive');
				if (semanticTarget !== activeTarget.current) {
					if (activeTarget.current) {
						resizeObserver.unobserve(activeTarget.current);
					}
					
					activeTarget.current = semanticTarget as HTMLElement;
					if (activeTarget.current) {
						bounds.current.isActive = true;
						updateTargetBounds(); // Initial cache
						resizeObserver.observe(activeTarget.current); // Watch dynamically
					}
				}
			} else {
				if (activeTarget.current) {
					resizeObserver.unobserve(activeTarget.current);
					activeTarget.current = null;
				}
				bounds.current.isActive = false;
			}
		};

		const handleMouseDown = (e: MouseEvent) => {
			if (e.button === 0) {
				state.current.isPressing = true;
			} else if (e.button === 2) {
				state.current.mode = "hidden";
			}
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (e.button === 0) {
				state.current.isPressing = false;
			}
		};

		const handleMouseOut = (e: MouseEvent) => {
			if (!e.relatedTarget) {
				state.current.mode = "hidden";
			}
		};

		const handleScroll = () => {
			if (!state.current.started) {
				return;
			}
			// During scroll, manually sync the active target bounds immediately 
			// because the element literally moves across the screen.
			updateTargetBounds();
			
			// Also softly check if a new element slipped under our static pointer
			const hovered = document.elementFromPoint(
				state.current.pointer.x,
				state.current.pointer.y
			) as HTMLElement | null;
			
			const newMode = getInteractiveMode(hovered);
			// Only update if it broke out of the target
			if (newMode === "tracking" || newMode === "text") {
				state.current.mode = newMode;
				state.current.isContrast = checkContrast(hovered);
				bounds.current.isActive = false;
			}
		};

		window.addEventListener("mousemove", handleMouseMove, { passive: true });
		document.addEventListener("mouseover", handleMouseOver, { passive: true });
		document.addEventListener("mouseout", handleMouseOut, { passive: true });
		window.addEventListener("mousedown", handleMouseDown, { passive: true });
		window.addEventListener("mouseup", handleMouseUp, { passive: true });

		// Capture scroll to update bounds and fallback targeting
		window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
        
		const pointerQuery = window.matchMedia("(pointer: fine)");
		pointerQuery.addEventListener("change", syncCapability);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseover", handleMouseOver);
			document.removeEventListener("mouseout", handleMouseOut);
			window.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("scroll", handleScroll, { capture: true });
			pointerQuery.removeEventListener("change", syncCapability);
            resizeObserver.disconnect();

			document.body.classList.remove("custom-cursor-active");
			isAnimating.current = false;
			if (rafId.current) {
				cancelAnimationFrame(rafId.current);
			}
		};
	}, []);

	useLayoutEffect(() => {
		if (typeof window !== "undefined" && state.current.started) {
			state.current.mode = "tracking";
			state.current.isPressing = false;
			bounds.current.isActive = false;
		}
	}, [pathname]);

	if (!isEnabled) {
		return null;
	}

	return (
		<div
			style={{
				pointerEvents: "none",
				position: "fixed",
				top: 0,
				left: 0,
				zIndex: 999999,
			}}
		>
			<div ref={auraRef} className="cursor-aura mode-hidden" />
			<div ref={ringRef} className="cursor-ring mode-hidden">
				<Brackets />
			</div>
			<div ref={coreRef} className="cursor-core mode-hidden" />
		</div>
	);
}

export default StarCursor;
