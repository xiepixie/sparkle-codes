"use client";
import "./cursor.css";

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import Brackets from "./Brackets";
import { readSharedJson, writeSharedJson } from "../../lib/shared-ui-state";

export interface StarCursorProps {
  pathname?: string;
  theme?: string;
}

const CURSOR_STATE_KEY = "cursor-state";

interface CursorPersistedState {
  pos: { x: number; y: number };
  hasMoved: boolean;
}

const getInitialState = () => {
    if (typeof window === 'undefined') return { 
        pos: { x: -200, y: -200 }, 
        hasMoved: false
    };
    
    try {
        const sharedState = readSharedJson<CursorPersistedState>(CURSOR_STATE_KEY);
        if (sharedState) {
          return sharedState;
        }

        const savedPos = JSON.parse(sessionStorage.getItem('sparkle-cursor-pos') || 'null');
        const savedMoved = sessionStorage.getItem('sparkle-cursor-has-moved') === 'true';
        return {
            pos: savedPos || { x: -200, y: -200 },
            hasMoved: savedMoved
        };
    } catch {
        return { pos: { x: -200, y: -200 }, hasMoved: false };
    }
};

const INITIAL_CONTEXT = getInitialState();
let GLOBAL_POINTER_POS = INITIAL_CONTEXT.pos;
let GLOBAL_HAS_MOVED = INITIAL_CONTEXT.hasMoved;

function canUseCustomCursor() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(hover: none)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Modern Custom Cursor - High precision dot + intelligent framing
 */
export function StarCursor({ pathname, theme }: StarCursorProps) {
  const dotRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);
  const releaseTimerRef = useRef<number | null>(null);
  const syncTargetRafRef = useRef<number | null>(null);
  const isCursorEnabled = useRef(false);
  
  const [mode, setMode] = useState<"default" | "hidden" | "framing" | "card">("default");
  const [isContrast, setIsContrast] = useState(false);
  const [hasMoved, setHasMoved] = useState(GLOBAL_HAS_MOVED);
  const [isEnabled, setIsEnabled] = useState(false);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Physics Refs
  const pointerPos = useRef({ ...GLOBAL_POINTER_POS });
  const frameTargetPos = useRef({ ...GLOBAL_POINTER_POS });
  
  const dotDisplayPos = useRef({ ...GLOBAL_POINTER_POS });
  const frameDisplayPos = useRef({ ...GLOBAL_POINTER_POS });
  
  const frameSize = useRef({ w: 32, h: 32 });
  const displayFrameSize = useRef({ w: 32, h: 32 });
  
  const activeTarget = useRef<HTMLElement | null>(null);
  const isAnimating = useRef(false);

  const persistPos = useCallback((pos: { x: number, y: number }) => {
    GLOBAL_POINTER_POS = pos;
    GLOBAL_HAS_MOVED = true;
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('sparkle-cursor-pos', JSON.stringify(pos));
        sessionStorage.setItem('sparkle-cursor-has-moved', 'true');
        writeSharedJson(CURSOR_STATE_KEY, { pos, hasMoved: true });
    }
  }, []);

  const evaluateTarget = useCallback((target: HTMLElement | null) => {
    if (!target) {
        if (modeRef.current !== 'default') setMode('default');
        activeTarget.current = null;
        setIsContrast(false);
        return;
    }

    const interactive = target.closest('a, button, [role="button"], input, .interactive, .tag-badge, .premium-link, .premium-tag, .wiki-link, label') as HTMLElement | null;
    const card = target.closest('.interactive-card');

    if (interactive && interactive.isConnected) {
        if (modeRef.current !== 'framing') setMode('framing');
        activeTarget.current = interactive;
        
        const isPrimary = interactive.classList.contains('bg-primary') || 
                          interactive.getAttribute('data-variant') === 'primary' ||
                          interactive.closest('.bg-primary') !== null;
        setIsContrast(isPrimary);
    } else if (card) {
        if (modeRef.current !== 'card') setMode('card');
        activeTarget.current = null;
        setIsContrast(false);
    } else {
        if (modeRef.current !== 'default') setMode('default');
        activeTarget.current = null;
        setIsContrast(false);
    }
  }, []);

  const syncTargetFromPointer = useCallback(() => {
    if (!isCursorEnabled.current || !GLOBAL_HAS_MOVED || typeof document === "undefined") {
      return;
    }

    const { x, y } = pointerPos.current;
    const isPointerInsideViewport =
      x >= 0 &&
      y >= 0 &&
      x <= window.innerWidth &&
      y <= window.innerHeight;

    if (!isPointerInsideViewport) {
      evaluateTarget(null);
      return;
    }

    const hovered = document.elementFromPoint(x, y);
    evaluateTarget(hovered instanceof HTMLElement ? hovered : null);
  }, [evaluateTarget]);

  const scheduleTargetSync = useCallback(() => {
    if (syncTargetRafRef.current !== null) return;

    syncTargetRafRef.current = window.requestAnimationFrame(() => {
      syncTargetRafRef.current = null;
      syncTargetFromPointer();
    });
  }, [syncTargetFromPointer]);

  const update = useCallback(() => {
    if (!isAnimating.current) return;
    
    // 1. FRAME TARGETING LOGIC
    if (modeRef.current === 'framing' && activeTarget.current) {
        const el = activeTarget.current;
        const rect = el.getBoundingClientRect();
        
        if (!el.isConnected || rect.width === 0 || rect.height === 0) {
            evaluateTarget(null);
            frameTargetPos.current = { ...pointerPos.current };
            frameSize.current = { w: 32, h: 32 };
        } else {
            // 严格锁定元素边界 (Strict lock to element center)
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            frameTargetPos.current = {
                x: centerX,
                y: centerY
            };
            frameSize.current = {
                w: rect.width + 12,
                h: rect.height + 12
            };
        }
    } else {
        frameTargetPos.current = { ...pointerPos.current };
        frameSize.current = { w: 32, h: 32 };
    }

    // 2. HIGHSPEED KINEMATICS (PHYSICS)
    
    // Dot Tracking: Exactly 1:1 removes all perceived lag ("跟手")
    dotDisplayPos.current.x = pointerPos.current.x;
    dotDisplayPos.current.y = pointerPos.current.y;

    // Frame Tracking: Spring-based easing
    const isFraming = modeRef.current === 'framing';
    const isCard = modeRef.current === 'card';
    
    // Fast snap on hover, elegant trailing on idle
    const frameLerp = isFraming ? 0.40 : (isCard ? 0.15 : 0.25);
    frameDisplayPos.current.x += (frameTargetPos.current.x - frameDisplayPos.current.x) * frameLerp;
    frameDisplayPos.current.y += (frameTargetPos.current.y - frameDisplayPos.current.y) * frameLerp;

    // Dimensional scaling animation
    const sizeLerp = isFraming ? 0.35 : 0.25;
    displayFrameSize.current.w += (frameSize.current.w - displayFrameSize.current.w) * sizeLerp;
    displayFrameSize.current.h += (frameSize.current.h - displayFrameSize.current.h) * sizeLerp;

    // 3. APPLY DOM UPDATES
    if (dotRef.current) {
        const s = dotRef.current.style;
        const opacity = hasMoved ? 1 : 0;
        
        // Dot tracking uses translate3d on the wrapper
        s.transform = `translate3d(${dotDisplayPos.current.x}px, ${dotDisplayPos.current.y}px, 0)`;
        s.opacity = opacity.toString();
    }

    if (frameRef.current) {
        const s = frameRef.current.style;
        s.transform = `translate3d(${frameDisplayPos.current.x}px, ${frameDisplayPos.current.y}px, 0) translate(-50%, -50%)`;
        s.width = `${displayFrameSize.current.w}px`;
        s.height = `${displayFrameSize.current.h}px`;
        s.opacity = hasMoved ? '1' : '0';
    }

    rafId.current = requestAnimationFrame(update);
  }, [hasMoved, evaluateTarget]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isCursorEnabled.current) return;

    pointerPos.current = { x: e.clientX, y: e.clientY };
    persistPos({ x: e.clientX, y: e.clientY });

    if (!hasMoved) {
        setHasMoved(true);
        GLOBAL_HAS_MOVED = true;
        dotDisplayPos.current = { x: e.clientX, y: e.clientY };
        frameDisplayPos.current = { x: e.clientX, y: e.clientY };
    }

    if (typeof window !== 'undefined' && !document.body.classList.contains('custom-cursor-active')) {
        document.body.classList.add('custom-cursor-active');
    }

    evaluateTarget(e.target as HTMLElement);
  }, [hasMoved, evaluateTarget, persistPos]);

  const handleInteract = useCallback(() => {
    if (frameRef.current) frameRef.current.classList.add('magnetic-active');
    if (dotRef.current) dotRef.current.classList.add('magnetic-active');
  }, []);

  const handleRelease = useCallback(() => {
    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
    }

    if (frameRef.current) {
        frameRef.current.classList.remove('magnetic-active');
        frameRef.current.classList.add('magnetic-click-pulse');
        releaseTimerRef.current = window.setTimeout(() => {
          frameRef.current?.classList.remove('magnetic-click-pulse');
          releaseTimerRef.current = null;
        }, 280);
    }
    if (dotRef.current) {
        dotRef.current.classList.remove('magnetic-active');
    }
  }, []);

  useEffect(() => {
    const syncCursorCapability = () => {
      const nextEnabled = canUseCustomCursor();
      isCursorEnabled.current = nextEnabled;
      setIsEnabled(nextEnabled);

      if (!nextEnabled) {
        document.body.classList.remove('custom-cursor-active');
        setMode('hidden');
        setIsContrast(false);
        activeTarget.current = null;
      } else if (GLOBAL_HAS_MOVED) {
        document.body.classList.add('custom-cursor-active');
        setMode('default');
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      // Re-sync capability on BFCache restore
      syncCursorCapability();
      scheduleTargetSync();
      if ((e.persisted || document.visibilityState === 'visible') && isCursorEnabled.current) {
        // Force restart even if we think we are animating, as BFCache might have halted the loop
        isAnimating.current = false;
        if (!isAnimating.current) {
          isAnimating.current = true;
          rafId.current = requestAnimationFrame(update);
        }
      }
    };

    const handlePageHide = () => {
      isAnimating.current = false;
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Sync position from other ports/tabs when this one becomes visible
        try {
          const sharedState = readSharedJson<CursorPersistedState>(CURSOR_STATE_KEY);
          if (sharedState && sharedState.hasMoved) {
            pointerPos.current = { ...sharedState.pos };
            if (!hasMoved) {
              setHasMoved(true);
              GLOBAL_HAS_MOVED = true;
              dotDisplayPos.current = { ...sharedState.pos };
              frameDisplayPos.current = { ...sharedState.pos };
            }
          }
        } catch (e) {}

        scheduleTargetSync();

        if (isCursorEnabled.current && !isAnimating.current) {
          isAnimating.current = true;
          rafId.current = requestAnimationFrame(update);
        }
      }
    };

    syncCursorCapability();

    const pointerQuery = window.matchMedia("(pointer: fine)");
    const hoverQuery = window.matchMedia("(hover: none)");

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0) handleInteract();
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 0) handleRelease();
    };

    const handleViewportShift = () => {
      scheduleTargetSync();
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', syncCursorCapability);
    window.addEventListener('resize', handleViewportShift, { passive: true });
    window.addEventListener('scroll', handleViewportShift, { passive: true, capture: true });
    window.addEventListener('wheel', handleViewportShift, { passive: true });
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    pointerQuery.addEventListener('change', syncCursorCapability);
    hoverQuery.addEventListener('change', syncCursorCapability);
    
    if (canUseCustomCursor() && isAnimating.current === false) {
      isAnimating.current = true;
      rafId.current = requestAnimationFrame(update);
    }
    
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('resize', syncCursorCapability);
        window.removeEventListener('resize', handleViewportShift);
        window.removeEventListener('scroll', handleViewportShift, true);
        window.removeEventListener('wheel', handleViewportShift);
        window.removeEventListener('pageshow', handlePageShow);
        window.removeEventListener('pagehide', handlePageHide);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        pointerQuery.removeEventListener('change', syncCursorCapability);
        hoverQuery.removeEventListener('change', syncCursorCapability);
        document.body.classList.remove('custom-cursor-active');
        isAnimating.current = false;
        if (syncTargetRafRef.current !== null) {
          window.cancelAnimationFrame(syncTargetRafRef.current);
          syncTargetRafRef.current = null;
        }
        if (releaseTimerRef.current) {
          window.clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = null;
        }
        if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [handleMouseMove, handleInteract, handleRelease, scheduleTargetSync, update]);

  useLayoutEffect(() => {
    if (typeof window !== 'undefined') {
        const canUse = canUseCustomCursor();
        if (GLOBAL_HAS_MOVED && canUse) {
            document.body.classList.add('custom-cursor-active');
        } else if (!canUse) {
            document.body.classList.remove('custom-cursor-active');
        }
    }
  }, [pathname]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !isEnabled) return null;

  return (
    <>
        <div 
            ref={dotRef}
            className="cursor-dot-wrapper"
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              zIndex: 999999, 
              pointerEvents: 'none', 
              transform: `translate3d(${GLOBAL_POINTER_POS.x}px, ${GLOBAL_POINTER_POS.y}px, 0)`, 
              opacity: 0 
            }}
        >
            <div 
                className={`cursor-dot mode-${mode} ${isContrast ? 'mode-contrast' : ''}`}
            />
        </div>
        <div 
            ref={frameRef} 
            className={`cursor-frame-wrapper`}
            style={{ 
              position: 'fixed', 
              top: 0, 
              left: 0, 
              zIndex: 999998, 
              pointerEvents: 'none', 
              transform: `translate3d(${GLOBAL_POINTER_POS.x}px, ${GLOBAL_POINTER_POS.y}px, 0) translate(-50%, -50%)`, 
              width: '36px', 
              height: '36px', 
              opacity: 0 
            }}
        >
            <div className={`cursor-frame mode-${mode} ${isContrast ? 'mode-contrast' : ''}`}>
                <Brackets />
            </div>
        </div>
    </>
  );
}

export default StarCursor;
