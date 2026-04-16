"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "../../lib";

interface TiltWrapperProps {
  children: React.ReactNode;
  className?: string;
  tiltAngle?: number;
  variant?: "industrial" | "nebula";
}

/**
 * TiltWrapper - Enterprise Grade "Sky to Stars" Industrial Design.
 * * ADVANCED OPTICS & GLASS PHYSICS:
 * 1. Adaptive Material Variables: Injects exact light/dark physics parameters.
 * 2. Dual Material Engine: Industrial (Physical) and Nebula (Atmospheric).
 */
export function TiltWrapper({ 
  children, 
  className, 
  tiltAngle = 10, 
  variant = "industrial" 
}: TiltWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const [isTouchPressed, setIsTouchPressed] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Optical Configs Mapping
  const configs = {
    industrial: {
      glareIntensity: "25%",
      shadowDepth: 24,
      motionRatio: -0.3,
      blur: "backdrop-blur-2xl"
    },
    nebula: {
      glareIntensity: "15%",
      shadowDepth: 45,
      motionRatio: -0.2,
      blur: "backdrop-blur-3xl"
    }
  }[variant];

  // PERFORMANCE-CRITICAL: State persistence to avoid React Re-renders
  const state = useRef({
    x: 0,
    y: 0,
    rx: 0,
    ry: 0,
    currX: 0,
    currY: 0,
    currRx: 0,
    currRy: 0,
    active: false,
    rect: null as DOMRect | null,
    rafId: 0
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const pointerQuery = window.matchMedia("(pointer: fine)");
    const hoverQuery = window.matchMedia("(hover: none)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncCapabilities = () => {
      const canHover = pointerQuery.matches && !hoverQuery.matches;
      const reduceMotion = reducedMotionQuery.matches;
      setPrefersReducedMotion(reduceMotion);
      setIsInteractive(canHover && !reduceMotion);
      if (!canHover || reduceMotion) {
        setIsHovered(false);
      }
    };

    // HIGH-PERFORMANCE ANIMATION LOOP
    const update = () => {
      const s = state.current;
      if (!s.active && 
          Math.abs(s.rx - s.currRx) < 0.001 && 
          Math.abs(s.ry - s.currRy) < 0.001) {
          // Hibernate when idle
          container.style.setProperty("--r-x", "0");
          container.style.setProperty("--r-y", "0");
          return;
      }

      // Smooth kinetic smoothing (Lerp)
      const lerp = s.active ? 0.12 : 0.06;
      s.currX += (s.x - s.currX) * lerp;
      s.currY += (s.y - s.currY) * lerp;
      s.currRx += (s.rx - s.currRx) * lerp;
      s.currRy += (s.ry - s.currRy) * lerp;

      // Update CSS Variables via Direct DOM access (bypassing React state)
      container.style.setProperty("--x", `${s.currX.toFixed(2)}px`);
      container.style.setProperty("--y", `${s.currY.toFixed(2)}px`);
      container.style.setProperty("--r-x", s.currRx.toFixed(4));
      container.style.setProperty("--r-y", s.currRy.toFixed(4));

      s.rafId = requestAnimationFrame(update);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (reducedMotionQuery.matches || (window as any).__SPARKLE_THEME_TRANSITION__) {
        return;
      }

      // OPTIMIZATION: Use cached rect to avoid Layout Thrashing
      const rect = state.current.rect || container.getBoundingClientRect();
      if (!state.current.rect) {
        state.current.rect = rect;
      }

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      state.current.x = x;
      state.current.y = y;
      state.current.rx = (x / rect.width) * 2 - 1;
      state.current.ry = (y / rect.height) * 2 - 1;
    };

    const handleMouseEnter = () => {
      state.current.active = true;
      state.current.rect = container.getBoundingClientRect(); // Refresh cache
      cancelAnimationFrame(state.current.rafId);
      state.current.rafId = requestAnimationFrame(update);
      setIsHovered(true);
    };

    const handleMouseLeave = () => {
      state.current.active = false;
      state.current.rx = 0;
      state.current.ry = 0;
      setIsHovered(false);
      // Let the update loop handle the 'settle' animation before hibernating
    };

    syncCapabilities();

    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    container.addEventListener("mouseenter", handleMouseEnter, { passive: true });
    container.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    
    pointerQuery.addEventListener("change", syncCapabilities);
    hoverQuery.addEventListener("change", syncCapabilities);
    reducedMotionQuery.addEventListener("change", syncCapabilities);

    const resizeObserver = new ResizeObserver(() => {
       state.current.rect = container.getBoundingClientRect();
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      pointerQuery.removeEventListener("change", syncCapabilities);
      hoverQuery.removeEventListener("change", syncCapabilities);
      reducedMotionQuery.removeEventListener("change", syncCapabilities);
      resizeObserver.disconnect();
      cancelAnimationFrame(state.current.rafId);
    };
  }, []);

  const isEngaged = isHovered || isFocused;

  return (
    <div
      ref={containerRef} 
      data-cursor="explore"
      className={cn(
        "group relative isolate w-full interactive-card rounded-2xl touch-manipulation focus-within:outline-none md:cursor-none",
        prefersReducedMotion ? "perspective-none" : "perspective-[1200px]",
        className
      )}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocused(false);
        }
      }}
      onPointerDown={() => {
        if (!isInteractive) {
          setIsTouchPressed(true);
        }
      }}
      onPointerUp={() => setIsTouchPressed(false)}
      onPointerCancel={() => setIsTouchPressed(false)}
      onPointerLeave={() => setIsTouchPressed(false)}
      style={{
        "--x": "50%",
        "--y": "50%",
        "--r-x": "0",
        "--r-y": "0",
      } as React.CSSProperties}
    >
      <div
        className={cn(
          "relative h-full w-full rounded-[inherit] p-[1.5px] [transform-style:preserve-3d]",
          // INDUSTRIAL OPTIMIZATION: Disable CSS transition when JS kinetic loop is active
          // This avoids 'transition-fighting' where the browser tries to transition 
          // between values already being smoothed by our Lerp engine.
          !isInteractive && "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        )}
        data-state={isEngaged ? "engaged" : "idle"}
        style={{
          transform: isInteractive
            ? (isEngaged
                ? `rotateX(calc(var(--r-y) * -${tiltAngle}deg)) rotateY(calc(var(--r-x) * ${tiltAngle}deg))`
                : "none")
            : isTouchPressed
              ? "scale(0.985)"
              : "none",
          willChange: isInteractive ? "transform" : undefined,
        }}
      >
        {/* Layer 2: Laser Border (Crosshair Projection System) */}
        <div 
          className={cn(
            "absolute inset-0 z-0 rounded-[inherit] transition-opacity duration-300 pointer-events-none",
            isInteractive ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-0"
          )}
          style={{
            background: `
                radial-gradient(
                    150px circle at var(--x) var(--y), 
                    color-mix(in oklab, white 95% , var(--color-primary, #513bb2)) 0%, 
                    color-mix(in oklab, var(--color-primary, #513bb2) 60%, white) 35%, 
                    var(--color-primary, #513bb2) 70%, 
                    transparent 100%
                ),
                radial-gradient(
                    100px 100% at var(--x) 50%,
                    color-mix(in oklab, var(--color-primary, #513bb2) 30%, transparent) 0%,
                    transparent 100%
                ),
                radial-gradient(
                    100% 100px at 50% var(--y),
                    color-mix(in oklab, var(--color-primary, #513bb2) 30%, transparent) 0%,
                    transparent 100%
                )
            `
          }}
        />

        <div 
            className={cn(
                "relative z-10 h-full w-full rounded-[inherit] overflow-hidden",
                "bg-card/90 transition-[border-color,box-shadow,background-color] duration-500 border border-primary/5 dark:border-white/5",
                "group-focus-within:border-primary/20 group-focus-within:bg-card/95",
                !isInteractive && isTouchPressed && "border-primary/20 shadow-glow-sm",
                configs.blur,
                
                "[--glass-edge:var(--glass-edge-light)]",
                "[--glass-rim:var(--glass-rim-light)]",
                "[--glass-shadow:rgba(0,0,0,0.06)]",
                "[--glass-glare:rgba(255,255,255,0.3)]",
                
                "dark:[--glass-edge:var(--glass-edge-light)]",
                "dark:[--glass-rim:var(--glass-rim-light)]",
                "dark:[--glass-shadow:rgba(0,0,0,0.7)]",
                "dark:[--glass-glare:rgba(255,255,255,0.4)]"
            )}
            style={{
                boxShadow: isInteractive && isEngaged
                    ? `
                        inset 0 0 0 1px var(--glass-edge),
                        inset 0 1px 1px var(--glass-rim),
                        inset calc(var(--r-x) * ${configs.shadowDepth}px) calc(var(--r-y) * ${configs.shadowDepth}px) 40px var(--glass-shadow),
                        inset calc(var(--r-x) * -8px) calc(var(--r-y) * -8px) 24px ${
                          variant === 'nebula' 
                            ? 'color-mix(in oklab, var(--color-primary, #513bb2) 20%, transparent)' 
                            : 'color-mix(in oklab, var(--color-primary, #513bb2) 12%, transparent)'
                        }
                      `
                    : !isInteractive && isTouchPressed
                    ? `
                        inset 0 0 0 1px var(--glass-edge),
                        inset 0 1px 1px var(--glass-rim),
                        0 8px 24px color-mix(in oklab, var(--color-primary, #513bb2) 12%, transparent)
                      `
                    : `
                        inset 0 0 0 1px var(--glass-edge), 
                        inset 0 1px 1px var(--glass-rim)
                      `
            } as React.CSSProperties}
        >
            
            <div 
              className={cn(
                "absolute inset-0 z-0 transition-opacity duration-500 pointer-events-none",
                isInteractive ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-0"
              )}
              style={{
                background: "radial-gradient(500px circle at var(--x) var(--y), color-mix(in oklab, var(--color-primary, #513bb2) 5%, transparent) 0%, transparent 100%)",
                backgroundImage: `
                  linear-gradient(to right, color-mix(in oklab, var(--color-primary, #513bb2) 18%, transparent) 1px, transparent 1px), 
                  linear-gradient(to bottom, color-mix(in oklab, var(--color-primary, #513bb2) 18%, transparent) 1px, transparent 1px)
                `,
                backgroundSize: "24px 24px",
                WebkitMaskImage: "radial-gradient(300px circle at var(--x) var(--y), black 10%, transparent 100%)",
                maskImage: "radial-gradient(300px circle at var(--x) var(--y), black 10% , transparent 100%)",
              }}
            />

            <div 
              className={cn(
                "absolute -inset-[100%] z-0 pointer-events-none transition-opacity duration-1000 mix-blend-screen",
                isInteractive ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" : "opacity-0"
              )}
              style={{
                background: `radial-gradient(
                    800px circle at calc(50% + var(--r-x) * ${configs.motionRatio * 100 * 0.7}%) calc(50% + var(--r-y) * ${configs.motionRatio * 100 * 0.7}%), 
                    color-mix(in oklab, ${variant === 'nebula' ? 'var(--color-primary)' : 'white'} 4%, transparent) 0%, 
                    transparent 100%
                )`
              }}
            />

            <div
              className={cn(
                "relative z-20 h-full w-full p-5 sm:p-6 lg:p-8",
                isInteractive && !prefersReducedMotion && "[transform:translateZ(30px)]"
              )}
            >
                {children}
            </div>
        </div>
      </div>
    </div>
  );
}
