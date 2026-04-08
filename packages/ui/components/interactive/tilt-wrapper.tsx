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
        container.style.setProperty("--r-x", "0");
        container.style.setProperty("--r-y", "0");
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (reducedMotionQuery.matches) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const ratioX = (x / rect.width) * 2 - 1;
      const ratioY = (y / rect.height) * 2 - 1;

      container.style.setProperty("--x", `${x}px`);
      container.style.setProperty("--y", `${y}px`);
      container.style.setProperty("--r-x", ratioX.toString());
      container.style.setProperty("--r-y", ratioY.toString());
    };

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => {
      setIsHovered(false);
      container.style.setProperty("--r-x", "0");
      container.style.setProperty("--r-y", "0");
    };

    syncCapabilities();

    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    container.addEventListener("mouseenter", handleMouseEnter, { passive: true });
    container.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    pointerQuery.addEventListener("change", syncCapabilities);
    hoverQuery.addEventListener("change", syncCapabilities);
    reducedMotionQuery.addEventListener("change", syncCapabilities);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      pointerQuery.removeEventListener("change", syncCapabilities);
      hoverQuery.removeEventListener("change", syncCapabilities);
      reducedMotionQuery.removeEventListener("change", syncCapabilities);
    };
  }, []);

  const isEngaged = isHovered || isFocused;

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "group relative isolate w-full interactive-card touch-manipulation focus-within:outline-none md:cursor-none",
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
          "relative h-full w-full rounded-2xl p-[1.5px] [transform-style:preserve-3d]",
          "transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          !isInteractive && "duration-300"
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
                "relative z-10 h-full w-full rounded-[calc(1rem-1.5px)] overflow-hidden",
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
