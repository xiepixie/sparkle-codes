"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./cursor.css";
import Brackets from "./Brackets";

export interface StarCursorProps {
	pathname?: string;
}

export type CursorKind =
	| "none"
	| "navigate"
	| "action"
	| "explore"
	| "text"
	| "tag"
	| "disabled";

export type CursorStrategy =
	| "free"
	| "frame-soft"
	| "frame-tight"
	| "suppress";

export const getStrategy = (kind: CursorKind): CursorStrategy => {
	switch (kind) {
		// 取消 navigate (链接) 的框选策略，因为跨行链接的 getBoundingClientRect 会包含大片空白
		// 统一使用 free 策略，配合底部的虚线流动动画提供反馈
		case "navigate": return "free";
		case "action": return "frame-tight";
		case "explore": return "frame-soft";
		case "text": return "suppress";
		case "tag": return "frame-tight";
		case "disabled": return "suppress";
		default: return "free";
	}
};

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
		kind: "none" as CursorKind,
		isHidden: true,
		isContrast: false,
		pointer: { x: -100, y: -100 },
		ring: { x: -100, y: -100 },
		ringSize: { w: 32, h: 32 },
		isPressing: false,
		started: false,
		prevKind: "none" as CursorKind,
		prevHidden: true,
		lastMoveTime: 0,
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
	const lastProcessedTarget = useRef<HTMLElement | null>(null);

	// Memoization Caches (Industrial Performance Rule)
	// Why: Deeply nested structures like KaTeX or Shiki cause hundreds of mouseover events.
	// Redundant .closest() walks on every tiny span would eventually drop frames.
	const kindCache = useRef(new WeakMap<HTMLElement, CursorKind>());
	const contrastCache = useRef(new WeakMap<HTMLElement, boolean>());

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
				state.current.isHidden = true;
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
			const strategy = getStrategy(s.kind);

			// Base Target Definitions
			let targetX = s.pointer.x;
			let targetY = s.pointer.y;
			let targetW = 32;
			let targetH = 32;
			let ringLerp = 0.35;

			// TEXT ZONE OPTIMIZATION: Hide the ring but keep the StarCore active 
			// and Native pointer suppressed.
			if (s.kind === "text") {
				targetW = 0;
				targetH = 0;
			}

			// --- Refined Semantic-driven kinematics ---
			if (s.isHidden) {
				targetW = 0;
				targetH = 0;
				ringLerp = 1.0;
			} else {
				switch (strategy) {
					case "frame-tight":
						ringLerp = 0.45;
						if (b.isActive) {
							targetW = b.w + 12;
							targetH = b.h + 12;
							targetX = b.cx;
							targetY = b.cy;
						} else {
							targetW = 28;
							targetH = 28;
						}
						break;
					case "frame-soft":
						if (s.kind === "explore") {
							// AMBIENT EXPLORATION: For large display blocks (Math/Mermaid), 
							// we stay pointer-centered but expand the ring to indicate the active zone. 
							// This avoids the 'floating loose frame' feeling on oversized elements.
							targetW = 64;
							targetH = 64;
							targetX = s.pointer.x;
							targetY = s.pointer.y;
							ringLerp = 0.35;
						} else {
							// NAVIGATE (Links): Soft snap to the text element
							ringLerp = 0.5;
							if (b.isActive) {
								targetW = b.w + 6;
								targetH = b.h + 6;
								targetX = b.cx;
								targetY = b.cy;
							} else {
								targetW = 32;
								targetH = 32;
							}
						}
						break;
					case "suppress":
						targetW = 0;
						targetH = 0;
						ringLerp = 1.0;
						break;
					default:
						ringLerp = 0.4;
						targetW = 28;
						targetH = 28;
						break;
				}
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

			// Snap-on-Reveal: If we just came from a hidden state, jump to pointer 
			// to avoid the 'gliding' effect from previous stale coordinates.
			const wasHidden = s.prevHidden || getStrategy(s.prevKind) === "suppress";
			const isVisible = !s.isHidden && strategy !== "suppress";
			if (wasHidden && isVisible && !b.isActive) {
				s.ring.x = s.pointer.x;
				s.ring.y = s.pointer.y;
			}

			// Kinematics: Lerp the ring towards expected targets
			s.ring.x += (targetX - s.ring.x) * ringLerp;
			s.ring.y += (targetY - s.ring.y) * ringLerp;
			
			// Morph ring size smoothly
			s.ringSize.w += (targetW - s.ringSize.w) * 0.45;
			s.ringSize.h += (targetH - s.ringSize.h) * 0.45;

			s.prevKind = s.kind;
			s.prevHidden = s.isHidden;

			// -- DOM Writes --
			if (coreRef.current) {
				// DECOUPLED SNAPPING: The star core remains free even when the frame is snapped.
				// This allows the user to feel 'loose' and in control within the interaction zone.
				const coreX = s.pointer.x;
				const coreY = s.pointer.y;
				
				// INDUSTRIAL REFINEMENT: Keep core scale stable on press to maintain 'Starfire' precision
				let coreScale = 1;
				if (s.isHidden || strategy === "suppress") {
					coreScale = 0;
				}
				
				// Final Coordinate Delivery
				coreRef.current.style.transform = `translate3d(${coreX}px, ${coreY}px, 0) scale(${coreScale})`;
				
				if (coreRef.current.dataset.contrast !== String(s.isContrast) || coreRef.current.dataset.pressing !== String(s.isPressing)) {
					coreRef.current.dataset.contrast = String(s.isContrast);
					coreRef.current.dataset.pressing = String(s.isPressing);
					// Preserve base identity while syncing semantic state
					coreRef.current.className = `cursor-core ${s.isContrast ? "contrast" : ""} ${s.isPressing ? "is-pressing" : ""}`;
				}
			}

			if (ringRef.current) {
				ringRef.current.style.transform = `translate3d(${s.ring.x}px, ${s.ring.y}px, 0)`;
				ringRef.current.style.width = `${s.ringSize.w}px`;
				ringRef.current.style.height = `${s.ringSize.h}px`;
				ringRef.current.style.marginLeft = `${-s.ringSize.w / 2}px`;
				ringRef.current.style.marginTop = `${-s.ringSize.h / 2}px`;
				
				if (ringRef.current.dataset.kind !== s.kind || ringRef.current.dataset.strategy !== strategy || ringRef.current.dataset.snapped !== String(b.isActive) || ringRef.current.dataset.hidden !== String(s.isHidden) || ringRef.current.dataset.pressing !== String(s.isPressing)) {
					ringRef.current.dataset.kind = s.kind;
					ringRef.current.dataset.strategy = strategy;
					ringRef.current.dataset.snapped = String(b.isActive);
					ringRef.current.dataset.hidden = String(s.isHidden);
					ringRef.current.dataset.pressing = String(s.isPressing);

					let ringClassName = `cursor-ring kind-${s.kind} strategy-${strategy} ${s.isContrast ? "contrast" : ""} ${b.isActive ? "is-snapped" : ""} ${s.isPressing ? "is-pressing" : ""}`;
					if (s.isHidden) {
						ringClassName += " is-hidden";
					}
					ringRef.current.className = ringClassName;
					
					// INDUSTRIAL SYNC: Link JS state to DOM for CSS-level orchestration
					document.body.dataset.cursorKind = s.kind;
					document.body.dataset.cursorStrategy = strategy;
					document.body.dataset.cursorPressing = String(s.isPressing);
				}
			}

			if (auraRef.current) {
				// INDUSTRIAL FIX: Hide aura when locked/snapped to avoid messy visuals or misalignments
				const isAuraActive = !s.isHidden && strategy !== "suppress" && !b.isActive; 
				
				// INDUSTRIAL FIX: Idle Fading
				// Why: If the browser stops sending mousemove events (e.g. during native scrollbar drag),
				// the custom cursor "freezes". We detect this idle state and fade it out.
				const timeSinceMove = Date.now() - s.lastMoveTime;
				const isIdle = timeSinceMove > 1500;
				
				// Aura Physics (Implosion Protocol)
				// Scaled down from 200px to 100px base in CSS. 
				// We now implode to 0.7x for a 'suction' feel.
				const aScale = isAuraActive && !isIdle ? (s.isPressing ? 0.7 : 1) : 0;
				const aOpacity = isAuraActive && !isIdle ? (s.isPressing ? 1 : 0.8) : 0;
				
				// Aura Physics (Atmospheric Persistence)
				// We allow the aura to follow the pointer directly to maintain the 'flashlight' feel,
				// while the interaction frame (ring) handles the snapping.
				const auraX = s.pointer.x;
				const auraY = s.pointer.y;
				
				auraRef.current.style.transform = `translate3d(${auraX}px, ${auraY}px, 0) scale(${aScale})`;
				auraRef.current.style.opacity = String(aOpacity);
				
				if (auraRef.current.dataset.kind !== s.kind || auraRef.current.dataset.strategy !== strategy || auraRef.current.dataset.snapped !== String(b.isActive) || auraRef.current.dataset.hidden !== String(s.isHidden) || auraRef.current.dataset.pressing !== String(s.isPressing)) {
					auraRef.current.dataset.kind = s.kind;
					auraRef.current.dataset.strategy = strategy;
					auraRef.current.dataset.snapped = String(b.isActive);
					auraRef.current.dataset.hidden = String(s.isHidden);
					auraRef.current.dataset.pressing = String(s.isPressing);

					let auraClassName = `cursor-aura kind-${s.kind} strategy-${strategy} ${b.isActive ? "is-snapped" : ""} ${s.isPressing ? "is-pressing" : ""}`;
					if (s.isHidden) {
						auraClassName += " is-hidden";
					}
					auraRef.current.className = auraClassName;
				}

				// Apply idle opacity to ring and core as well
				if (ringRef.current) {
					ringRef.current.style.opacity = isIdle ? "0" : "1";
				}
				if (coreRef.current) {
					coreRef.current.style.opacity = isIdle ? "0" : "1";
				}

				// INDUSTRIAL SYNC: Signal the current interaction state to the document body
				// This enables CSS to perfectly orchestrate native cursor suppression/restoration.
				if (document.body.dataset.cursorStrategy !== strategy) {
					document.body.dataset.cursorStrategy = strategy;
				}
				if (document.body.dataset.cursorPressing !== String(s.isPressing)) {
					document.body.dataset.cursorPressing = String(s.isPressing);
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
			state.current.lastMoveTime = Date.now();

			if (state.current.isHidden) {
				state.current.isHidden = false;
			}
		};

		const getSemanticKind = (target: HTMLElement | null): CursorKind => {
			if (!target) { return "none"; }
			
			const cached = kindCache.current.get(target);
			if (cached) { return cached; }

			let result: CursorKind = "none";

			// Protocol 1: Explicit Data Attribute (Highest Priority)
			const protocolTarget = target.closest('[data-cursor]');
			if (protocolTarget) {
				const protocolKind = protocolTarget.getAttribute('data-cursor') as CursorKind;
				if (protocolKind && ["navigate", "action", "explore", "text", "tag", "disabled", "none"].includes(protocolKind)) {
					kindCache.current.set(target, protocolKind);
					return protocolKind;
				}
			}

			// Protocol 2: Fallback Inference (Smooth Migration)
			const semanticTarget = target.closest('button, [role="button"], a, .interactive-card, .premium-link, .wiki-link, .interactive, .premium-tag, .tag-badge, [data-button="true"], [data-action="true"]');
			
			if (semanticTarget) {
				const isLink = semanticTarget.tagName === "A" || 
							 semanticTarget.classList.contains("premium-link") || 
							 semanticTarget.classList.contains("wiki-link");
				
				// Identify large UI-level routing blocks (e.g. NavBar elements, Drawer entries)
				// These shouldn't act like inline text links; they behave physically like buttons.
				const isStructuralLink = isLink && semanticTarget.classList.contains("no-dash");

				if (target.closest('.mermaid, .mermaid-render-container, svg, .math-inline, .math-block, .katex, .sparkle-math-rendered')) {
					// Inside display zones, we only lock onto true actions.
					if (semanticTarget !== target.closest('.math-block, .math-display, .math-inline')) {
						result = (isLink && !isStructuralLink) ? "navigate" : "action";
					} else {
						result = (isLink && !isStructuralLink) ? "navigate" : "none";
					}
				}
				else if (target.closest('pre, code, textarea, input[type="text"], iframe, .no-custom-cursor, [contenteditable], .mockup-code, .code-fence')) {
					result = (semanticTarget.classList.contains('code-copy-btn') || semanticTarget.classList.contains('math-copy-option')) 
						? "action" 
						: "text";
				}
				else {
					if (semanticTarget.classList.contains('interactive-card')) {
						result = "explore";
					} else {
						result = (isLink && !isStructuralLink) ? "navigate" : "action";
					}
				}
			}
			
			// Protocol 3: Background Zone Definitions (Priority 1: Rendered Zones)
			// Only apply internal zone logic if we haven't already identified a specific action/link target.
			if (result === "none" && target.closest('.mermaid, .mermaid-render-container, svg, .math-inline, .math-block, .katex, .sparkle-math-rendered')) {
				// In display zones, we prefer 'explore' (vibrant pointer-ring)
				result = "explore";
			}
			// Priority 2: Text/Source Zones
			else if (result === "none" && target.closest('pre, code, textarea, input[type="text"], iframe, .no-custom-cursor, [contenteditable], .mockup-code, .code-fence')) {
				result = "text";
			}

			kindCache.current.set(target, result);
			return result;
		};

		const checkContrast = (target: HTMLElement | null): boolean => {
			if (!target) { return false; }
			
			const cached = contrastCache.current.get(target);
			if (cached !== undefined) { return cached; }

			const result = !!(
				target.classList.contains("bg-primary") ||
				target.getAttribute("data-variant") === "primary" ||
				target.closest(".bg-primary")
			);

			contrastCache.current.set(target, result);
			return result;
		};

		const handleMouseOver = (e: MouseEvent) => {
			if (!state.current.started) { return; }
			const target = e.target as HTMLElement;
			if (!target || target === lastProcessedTarget.current) { return; }
			lastProcessedTarget.current = target;

			const newKind = getSemanticKind(target);
			state.current.kind = newKind;
			state.current.isContrast = checkContrast(target);

			const strategy = getStrategy(newKind);

			// Activate Intelligence Bounds Cache for things we frame
			if (strategy === "frame-tight" || strategy === "frame-soft") {
				// We try to snap to the protocol target first, otherwise fallback to the semantic target
				let frameTarget = target.closest('[data-cursor="navigate"], [data-cursor="action"], [data-cursor="explore"], [data-cursor="tag"]');
				if (!frameTarget) {
					frameTarget = target.closest('button, [role="button"], a, .interactive-card, .premium-link, .wiki-link, .interactive, .premium-tag, .tag-badge, [data-button="true"], [data-action="true"]');
				}

				if (frameTarget !== activeTarget.current) {
					if (activeTarget.current) {
						resizeObserver.unobserve(activeTarget.current);
					}
					
					activeTarget.current = frameTarget as HTMLElement;
					if (activeTarget.current) {
						bounds.current.isActive = true;
						updateTargetBounds();
						resizeObserver.observe(activeTarget.current);
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
				state.current.isHidden = true;
			}
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (e.button === 0) {
				state.current.isPressing = false;
			}
		};

		const handleMouseOut = (e: MouseEvent) => {
			if (!e.relatedTarget) {
				state.current.isHidden = true;
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
			
			const newKind = getSemanticKind(hovered);
			const strategy = getStrategy(newKind);

			// Only update if it broke out of the target
			if (strategy === "free" || strategy === "suppress") {
				state.current.kind = newKind;
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
			state.current.kind = "none";
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
			<div ref={auraRef} className="cursor-aura is-hidden" />
			<div ref={ringRef} className="cursor-ring is-hidden">
				<Brackets />
			</div>
			<div ref={coreRef} className="cursor-core is-hidden" />
		</div>
	);
}

export default StarCursor;
