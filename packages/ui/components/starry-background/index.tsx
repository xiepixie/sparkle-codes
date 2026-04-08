"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import "./styles.css";

import { useTheme } from "next-themes";
import {
  CONSTELLATIONS,
  TIME_SLOT_CONFIG,
  buildSceneForDate,
  getTimeSlotByHour,
  placeConstellation,
  resolveSlots,
  type PlacedConstellation,
  type PlacedConstellationPoint,
  type SelectedScene,
  type SpecialEffectState,
} from "@repo/utils";
import { readSharedJson, writeSharedJson } from "../../lib/shared-ui-state";

const SKY_SCENE_STATE_KEY = "sky-scene";
const GOLD_COLOR = "255, 215, 0";
const IS_DEV = process.env.NODE_ENV !== "production";

interface ThemeColors {
  primary: string;
  secondary: string;
  white: string;
}

interface ViewportState {
  width: number;
  height: number;
  dpr: number;
}

interface StarNode {
  xRel: number;
  yRel: number;
  x: number;
  y: number;
  size: number;
  baseOpacity: number;
  opacity: number;
  color: string;
  depth: number;
  drift: number;
  twinkleSpeed: number;
  twinkleOffset: number;
  excitement: number;
  isHero: boolean;
  isCustomColor?: boolean;
  hasSpike?: boolean;
  constellationName?: string;
  paletteRoll: number;
}

interface NebulaPatch {
  xRel: number;
  yRel: number;
  radiusRel: number;
  blurRel: number;
  alpha: number;
  color: string;
}

interface SkyCache {
  scene: SelectedScene | null;
  lastTimeSlot: string | null;
  lastTimeSlotHour: number | null;
  effect: SpecialEffectState;
  ambientStars: StarNode[];
  heroStars: Map<string, StarNode[]>;
  placedConstellations: PlacedConstellation[];
  nebulaPatches: NebulaPatch[];
  colors: ThemeColors;
  lastAppliedSceneKey: string | null;
  lastThemeMode: "light" | "dark" | null;
}

const GlobalSkyCache: SkyCache = {
  scene: null,
  lastTimeSlot: null,
  lastTimeSlotHour: null,
  effect: { type: null, active: false, startedAt: 0, durationMs: 0 },
  ambientStars: [],
  heroStars: new Map(),
  placedConstellations: [],
  nebulaPatches: [],
  colors: {
    primary: "191, 123, 255",
    secondary: "126, 214, 255",
    white: "255, 255, 255",
  },
  lastAppliedSceneKey: null,
  lastThemeMode: null,
};

function debugLog(event: string, details?: Record<string, unknown>) {
  if (!IS_DEV || typeof window === "undefined") {
    return;
  }
  console.log("[StarryBackground]", event, details ?? {});
}

function createSeededRandom(seed: number) {
  let s = Math.max(1, Math.floor(seed * 1000000));
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSceneVisibilityProfile(timeSlot: SelectedScene["timeSlot"], isCompact: boolean) {
  const cfg = TIME_SLOT_CONFIG[timeSlot];
  
  // High-performance star counts from config, reconciled for viewport
  const nightCount = isCompact ? Math.floor(cfg.ambientCount * 0.55) : cfg.ambientCount;
  
  return {
    ambientCount: nightCount,
    ambientOpacityMax: cfg.ambientOpacityMax,
    renderConstellations: true,
    skyMode: timeSlot === "dawn" ? "faint-dawn" : timeSlot === "dusk" ? "cinematic-dusk" : "deep-night",
  } as const;
}

function getViewportProfile() {
  if (typeof window === "undefined") {
    return {
      isCompact: false,
      densityMultiplier: 1,
      coarsePointer: false,
    };
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const isCompact = coarsePointer || window.innerWidth < 768;

  return {
    isCompact,
    densityMultiplier: isCompact ? 0.75 : 1,
    coarsePointer,
  };
}

function isValidScene(scene: unknown): scene is SelectedScene {
  if (!scene || typeof scene !== "object") {
    return false;
  }

  const candidate = scene as Partial<SelectedScene>;
  const validSlots = new Set(["dawn", "day", "dusk", "night"]);

  return (
    typeof candidate.sceneKey === "string" &&
    typeof candidate.seed === "number" &&
    Number.isFinite(candidate.seed) &&
    typeof candidate.effectDuration === "number" &&
    Number.isFinite(candidate.effectDuration) &&
    typeof candidate.timeSlot === "string" &&
    validSlots.has(candidate.timeSlot) &&
    (candidate.primary === null || typeof candidate.primary === "string") &&
    (candidate.secondary === null || typeof candidate.secondary === "string") &&
    (candidate.effect === null || typeof candidate.effect === "string")
  );
}

function createAmbientStar(
  rng: () => number,
  colors: ThemeColors,
  ambientOpacityMax: number
): StarNode {
  let xRel = rng();
  let yRel = rng();
  let attempts = 0;

  while (attempts < 10) {
    const dx = xRel - 0.5;
    const dy = yRel - 0.5;
    if (Math.sqrt(dx * dx + dy * dy) > 0.18) {
      break;
    }
    xRel = rng();
    yRel = rng();
    attempts++;
  }

  const depth = rng() > 0.65 ? 1 : 0;
  
  // ALWAYS use high-quality Dark specifications for the persistent structural cache
  const size = depth === 0
    ? 0.72 + rng() * 1.08
    : 1.15 + rng() * 1.95;

  const paletteRoll = rng();
  const color = paletteRoll > 0.78
    ? colors.primary
    : paletteRoll > 0.52
      ? colors.secondary
      : colors.white;

  const ceiling = clamp(ambientOpacityMax + (depth === 1 ? 0.12 : 0.04), 0.2, 0.95);
  const floor = clamp(ceiling * 0.35, 0.1, 0.32);
  const baseOpacity = floor + rng() * Math.max(0.01, ceiling - floor);

  return {
    xRel,
    yRel,
    x: 0,
    y: 0,
    size,
    baseOpacity,
    opacity: baseOpacity,
    color,
    depth,
    drift: (rng() - 0.5) * (depth === 1 ? 0.003 : 0.0018),
    twinkleSpeed: 0.0008 + rng() * (depth === 1 ? 0.002 : 0.0014),
    twinkleOffset: rng() * Math.PI * 2,
    excitement: 0,
    isHero: false,
    paletteRoll,
  };
}

function createHeroStar(
  point: PlacedConstellationPoint,
  width: number,
  height: number,
  rng: () => number,
  colors: ThemeColors,
  constellationName: string
): StarNode {
  const xRel = point.x / width;
  const yRel = point.y / height;
  const baseOpacity = 0.65 + rng() * 0.25;

  // Convert hex color to RGB string if present, otherwise fallback to theme colors
  const starColor = point.color ? hexToRgb(point.color) : (rng() > 0.45 ? colors.primary : colors.secondary);

  return {
    xRel,
    yRel,
    x: point.x,
    y: point.y,
    size: point.size + 0.45,
    baseOpacity,
    opacity: baseOpacity,
    color: starColor,
    depth: 2,
    drift: 0,
    twinkleSpeed: 0.0012 + rng() * 0.002,
    twinkleOffset: rng() * Math.PI * 2,
    excitement: 0,
    isHero: true,
    isCustomColor: Boolean(point.color),
    hasSpike: point.hasSpike,
    constellationName,
    paletteRoll: rng(),
  };
}

function hexToRgb(hex: string): string {
  // Simple hex to rgb converter
  const cleanHex = hex.replace("#", "");
  const r = Number.parseInt(cleanHex.substring(0, 2), 16);
  const g = Number.parseInt(cleanHex.substring(2, 4), 16);
  const b = Number.parseInt(cleanHex.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function rescaleStars(stars: StarNode[], width: number, height: number) {
  for (const star of stars) {
    star.x = star.xRel * width;
    star.y = star.yRel * height;
  }
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number
) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${color}, ${alpha})`);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(
  ctx: CanvasRenderingContext2D, 
  star: StarNode, 
  isGoldEffect: boolean, 
  isSuppressed: boolean,
  globalOpacityMultiplier = 1
) {
  // Hard-exit for invisibility to ensure 100% clean background in Light mode
  if (globalOpacityMultiplier < 0.001) {
    return;
  }

  const now = performance.now();
  const shimmerFactor = isGoldEffect ? (Math.sin(now * 0.008 + star.x) * 0.25 + 0.75) : 1;
  const twinkleShimmer = Math.sin(now * star.twinkleSpeed + star.twinkleOffset);
  
  const effectiveOpacity = isSuppressed 
    ? 0 
    : clamp(
        (star.baseOpacity + twinkleShimmer * (star.isHero ? 0.18 : 0.1) + star.excitement * 0.65) * shimmerFactor * globalOpacityMultiplier,
        0,
        1
      );
  
  const activeColor = isGoldEffect ? GOLD_COLOR : star.color;
  const effectiveSize = star.size * (isGoldEffect ? 1.08 : 1);

  if (star.depth >= 1 || star.isHero || (effectiveOpacity > 0.1 && !isSuppressed)) {
    const excitementGlow = star.isHero ? (star.excitement * 4) : 0;
    const glowScale = star.isHero ? (isGoldEffect ? 12 : 8 + excitementGlow) : 4.5;
    
    // CRITICAL: Glow opacity MUST be multiplied by globalOpacityMultiplier
    // to prevent "gray halos" on white background during theme switch.
    const baseGlowOpacity = isGoldEffect
      ? 0.35 * shimmerFactor
      : star.isHero
        ? star.excitement * 0.45
        : 0.08;
    
    const glowOpacity = isSuppressed ? 0 : baseGlowOpacity * globalOpacityMultiplier;

    if (glowOpacity > 0.005) {
      drawGlow(
        ctx,
        star.x,
        star.y,
        effectiveSize * glowScale,
        activeColor,
        glowOpacity
      );
    }
  }

  if (effectiveOpacity > 0.005) {
    ctx.beginPath();
    ctx.arc(star.x, star.y, effectiveSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${activeColor}, ${effectiveOpacity})`;
    ctx.fill();
  }

  // Hero stars with hasSpike property get a premium lens spike (十字星) as an Easter egg
  const shouldSpike = star.hasSpike && !isSuppressed && globalOpacityMultiplier > 0.1;
  const shouldFlare = (star.isHero && star.excitement > 0.85) || (!star.isHero && star.depth === 1) || (isGoldEffect && Math.sin(now * 0.005 + star.x) > 0.85);

  if ((shouldSpike || shouldFlare) && !isSuppressed && globalOpacityMultiplier > 0.1) {
    ctx.save();
    ctx.translate(star.x, star.y);
    
    if (shouldSpike) {
      // Flagship stars get a rotating subtle spike
      const spikeRot = now * 0.00012 + star.twinkleOffset;
      ctx.rotate(spikeRot);
      
      const spikeAlpha = clamp((star.baseOpacity * 0.45 + twinkleShimmer * 0.1) * globalOpacityMultiplier, 0, 0.55);
      if (spikeAlpha > 0.01) {
        ctx.strokeStyle = `rgba(${activeColor}, ${spikeAlpha})`;
        ctx.lineWidth = 0.4;
        
        // Horizontal/Vertical spikes (subtle and balanced)
        const longLen = effectiveSize * 1.5;
        const shortLen = effectiveSize * 0.8;
        
        ctx.beginPath();
        ctx.moveTo(-longLen, 0); ctx.lineTo(longLen, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -longLen); ctx.lineTo(0, longLen);
        ctx.stroke();
        
        if (star.excitement > 0.4) {
          ctx.lineWidth = 0.3;
          ctx.rotate(Math.PI / 4);
          ctx.beginPath();
          ctx.moveTo(-shortLen, 0); ctx.lineTo(shortLen, 0);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -shortLen); ctx.lineTo(0, shortLen);
          ctx.stroke();
        }
      }
    } else if (shouldFlare) {
      // Standard smaller cross flare for atmospheric depth
      ctx.rotate(now * (star.isHero ? 0.0004 : 0.00018) + star.twinkleOffset);
      const baseFlareOpacity = star.isHero ? (star.excitement - 0.25) * 0.55 : effectiveOpacity * 0.38;
      const flareOpacity = clamp(baseFlareOpacity * globalOpacityMultiplier, 0, 0.75);
      
      if (flareOpacity > 0.01) {
        ctx.strokeStyle = `rgba(${activeColor}, ${flareOpacity})`;
        ctx.lineWidth = 0.35;
        const flareLen = star.isHero ? effectiveSize * 2.8 : effectiveSize * 1.2;
        ctx.beginPath();
        ctx.moveTo(-flareLen, 0); ctx.lineTo(flareLen, 0);
        ctx.moveTo(0, -flareLen); ctx.lineTo(0, flareLen);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}


export function StarryBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportState>({ width: 0, height: 0, dpr: 1 });
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafId = useRef<number>(0);
  const isAnimating = useRef(false);
  const debugStateRef = useRef({
    loggedMount: false,
    loggedFirstFrame: false,
  });
  const frameCountRef = useRef(0);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  

  const refreshSceneSelection = useCallback(() => {
    const now = new Date();
    const currentSlot = getTimeSlotByHour(now.getHours());
    const generated = buildSceneForDate(now);
    if (!generated) {
      return;
    }

    let nextScene: SelectedScene | null = null;

    if (typeof window !== "undefined") {
      const stored = readSharedJson<SelectedScene>(SKY_SCENE_STATE_KEY);
      // Update if slot changed OR if scene key is different (e.g. hourly update)
      if (isValidScene(stored) && stored.sceneKey === generated.sceneKey) {
        nextScene = stored;
      }
    }

    if (!nextScene) {
      if (typeof window !== "undefined") {
        writeSharedJson(SKY_SCENE_STATE_KEY, generated);
      }
      debugLog("scene:updated", {
        sceneKey: generated.sceneKey,
        timeSlot: generated.timeSlot,
        primary: generated.primary,
        secondary: generated.secondary,
      });

      nextScene = generated;
    }

    GlobalSkyCache.scene = nextScene;
    GlobalSkyCache.lastTimeSlot = currentSlot;

    if (typeof window !== "undefined" && nextScene) {
      window.dispatchEvent(
        new CustomEvent("sky-scene-update", {
          detail: {
            timeSlot: nextScene.timeSlot,
            effect: nextScene.effect,
          },
        })
      );
    }
  }, []);

  const initSceneLayers = useCallback((width: number, height: number, scene: SelectedScene) => {
    const colors = GlobalSkyCache.colors;
    const { densityMultiplier, isCompact } = getViewportProfile();
    const visibility = getSceneVisibilityProfile(scene.timeSlot, isCompact);
    const rng = createSeededRandom(scene.seed || 0.5);
    
    debugLog("scene:init", { key: scene.sceneKey, timeSlot: scene.timeSlot });

    // (Type 3) AMBIENT: Background stars for depth and atmosphere
    const ambientCount = Math.max(0, Math.round(visibility.ambientCount * densityMultiplier));
    const ambientStars: StarNode[] = [];
    const placed: PlacedConstellation[] = [];
    const heroMap = new Map<string, StarNode[]>();

    for (let i = 0; i < ambientCount; i++) {
      ambientStars.push(createAmbientStar(rng, colors, visibility.ambientOpacityMax));
    }

    const { primarySlot, secondarySlot } = resolveSlots(scene.primary, scene.secondary, scene.seed);
    const shouldRenderConstellations = visibility.renderConstellations;

    // (Type 1) PRIMARY: Main constellations fixed by PC Time rule
    if (shouldRenderConstellations && scene.primary && primarySlot) {
      const constellation = CONSTELLATIONS.find((item) => item.name === scene.primary);
      if (constellation) {
        placed.push(placeConstellation(constellation, primarySlot, width, height));
      }
    }

    // (Type 2) SECONDARY: Random bonus constellations
    if (shouldRenderConstellations && scene.secondary && secondarySlot) {
      const constellation = CONSTELLATIONS.find((item) => item.name === scene.secondary);
      if (constellation) {
        placed.push(placeConstellation(constellation, secondarySlot, width, height));
      }
    }

    for (const placedConstellation of placed) {
      const stars = placedConstellation.points.map((point) =>
        createHeroStar(point, width, height, rng, colors, placedConstellation.name)
      );
      heroMap.set(placedConstellation.name, stars);
    }

    rescaleStars(ambientStars, width, height);
    for (const stars of heroMap.values()) {
      rescaleStars(stars, width, height);
    }

    GlobalSkyCache.ambientStars = ambientStars;
    GlobalSkyCache.heroStars = heroMap;
    GlobalSkyCache.placedConstellations = placed;
    GlobalSkyCache.nebulaPatches = []; // Ready for future expansion

    if (scene.effect) {
      GlobalSkyCache.effect = {
        type: scene.effect,
        active: true,
        startedAt: performance.now(),
        durationMs: scene.effectDuration,
      };
    } else {
      GlobalSkyCache.effect = { type: null, active: false, startedAt: 0, durationMs: 0 };
    }
  }, []);

  const resizeCanvas = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    viewportRef.current = { width, height, dpr };
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }, []);

  const ensureSceneReady = useCallback(() => {
    if (!GlobalSkyCache.scene) {
      refreshSceneSelection();
    }
  }, [refreshSceneSelection]);

  const rebuildScene = useCallback((width: number, height: number) => {
    ensureSceneReady();
    if (!GlobalSkyCache.scene || width <= 0 || height <= 0) {
      return;
    }

    resizeCanvas(width, height);

    const isKeyMatch = GlobalSkyCache.lastAppliedSceneKey === GlobalSkyCache.scene.sceneKey;
    const isThemeMatch = GlobalSkyCache.lastThemeMode === (isDark ? "dark" : "light");

    if (!isKeyMatch) {
      // ATOMIC CLEANUP for structural changes
      GlobalSkyCache.lastAppliedSceneKey = GlobalSkyCache.scene.sceneKey;
      GlobalSkyCache.ambientStars = [];
      GlobalSkyCache.heroStars = new Map();
      GlobalSkyCache.placedConstellations = [];
      GlobalSkyCache.nebulaPatches = [];
      GlobalSkyCache.effect = { type: null, active: false, startedAt: 0, durationMs: 0 };
      debugLog("scene:reset-applied", { key: GlobalSkyCache.lastAppliedSceneKey });
    }

    if (GlobalSkyCache.ambientStars.length === 0) {
      initSceneLayers(width, height, GlobalSkyCache.scene);
      GlobalSkyCache.lastThemeMode = isDark ? "dark" : "light";
    } else if (!isThemeMatch) {
      // Decoupled color reconcile without re-initializing positions
      const colors = GlobalSkyCache.colors;
      for (const star of GlobalSkyCache.ambientStars) {
        // Re-assign colors from new theme tokens with stable paletteRoll
        const roll = star.paletteRoll;
        star.color = roll > 0.78 ? colors.primary : roll > 0.52 ? colors.secondary : colors.white;
      }
      for (const stars of GlobalSkyCache.heroStars.values()) {
        for (const star of stars) {
          if (!star.isCustomColor) {
            star.color = star.paletteRoll > 0.45 ? colors.primary : colors.secondary;
          }
        }
      }
      GlobalSkyCache.lastThemeMode = isDark ? "dark" : "light";
      if (!isDark) {
        // Just clear excitation to prevent residual glows, but leave effect.active intact 
        // to allow it to resume if the user switches back during its duration.
        GlobalSkyCache.ambientStars.forEach(s => {
          s.excitement = 0;
        });
        GlobalSkyCache.heroStars.forEach(stars => {
          stars.forEach(s => {
            s.excitement = 0;
          });
        });
      }
      debugLog("scene:theme-reconciled", { isDark });
    } else {
      rescaleStars(GlobalSkyCache.ambientStars, width, height);
      for (const stars of GlobalSkyCache.heroStars.values()) {
        rescaleStars(stars, width, height);
      }
    }
  }, [ensureSceneReady, initSceneLayers, resizeCanvas, isDark]);

  const themeRef = useRef<string | undefined>(resolvedTheme);
  // Synchronize synchronously BEFORE the paint/capture flow of View Transitions.
  useLayoutEffect(() => {
    themeRef.current = resolvedTheme;
  }, [resolvedTheme]);

  // Redundant safety update in render body
  themeRef.current = resolvedTheme;

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !GlobalSkyCache.scene) {
      return;
    }

    const { width, height } = viewportRef.current;
    const fx = GlobalSkyCache.effect;
    const isGoldTime = fx.active && fx.type === "celestialGold";
    if (isGoldTime && performance.now() - fx.startedAt > fx.durationMs) {
      fx.active = false;
    }

    ctx.clearRect(0, 0, width, height);

    // 2. Binary switch for visibility: Instant disappearance and appearance
    // We use themeRef to bypass the closure trap of isDark to prevent light-mode residues.
    const currentTheme = themeRef.current;
    if (currentTheme !== "dark") {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isAnimating.current = false;
      // Do NOT set effect.active = false here, let it run its course silently.
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
      return;
    }

    // In dark mode, opacity is always 1 for maximum performance and clarity.
    const globalOpacity = 1;

    if (!debugStateRef.current.loggedFirstFrame) {
      debugStateRef.current.loggedFirstFrame = true;
      debugLog("draw:first-frame", {
        canvasWidth: width,
        canvasHeight: height,
        dpr: viewportRef.current.dpr,
        particleCount: GlobalSkyCache.ambientStars.length,
        constellationCount: GlobalSkyCache.placedConstellations.length,
        theme: "dark",
        skyMode: "standard",
      });
    }

    const now = performance.now();
    const mouseX = mouseRef.current.x;
    const mouseY = mouseRef.current.y;
    const heroOpacityBoost = TIME_SLOT_CONFIG[GlobalSkyCache.scene.timeSlot].heroOpacityBoost;

    // Periodically check for hour change to keep the scene fresh without manual refresh
    if (frameCountRef.current % 360 === 0) {
      const currentHour = new Date().getHours();
      if (currentHour !== GlobalSkyCache.lastTimeSlotHour) {
        GlobalSkyCache.lastTimeSlotHour = currentHour;
        refreshSceneSelection();
        rebuildScene(width, height);
      }
    }

    for (const star of GlobalSkyCache.ambientStars) {
      const dx = mouseX - star.x;
      const dy = mouseY - star.y;
      const distSq = dx * dx + dy * dy;
      const threshold = star.depth === 1 ? 150 : 95;
      
      if (distSq < threshold * threshold) {
        const dist = Math.sqrt(distSq);
        star.excitement = ((threshold - dist) / threshold) ** 1.6;
      } else {
        star.excitement *= 0.94;
      }

      // Optimization: No movement in main loop, keeping coordinates fixed as per user request.
      drawStar(ctx, star, false, globalOpacity < 0.05, globalOpacity);
    }

    for (const placedConstellation of GlobalSkyCache.placedConstellations) {
      const stars = GlobalSkyCache.heroStars.get(placedConstellation.name);
      if (!stars) {
        continue;
      }

      for (const star of stars) {
        const dx = mouseX - star.x;
        const dy = mouseY - star.y;
        const distSq = dx * dx + dy * dy;
        const threshold = 240;

        if (distSq < threshold * threshold) {
          const dist = Math.sqrt(distSq);
          star.excitement = ((threshold - dist) / threshold) ** 1.8;
        } else {
          star.excitement *= 0.92;
        }

        // Rescaling is handled outside the loop for performance.
      }

      const isGoldConstellation =
        isGoldTime &&
        (placedConstellation.name === GlobalSkyCache.scene.primary ||
          placedConstellation.name === GlobalSkyCache.scene.secondary);

      for (const [from, to] of placedConstellation.links) {
        const a = stars[from];
        const b = stars[to];
        if (!a || !b) {
          continue;
        }

        const energy = clamp((a.excitement + b.excitement) / 2, 0, 1);
        
        // Polished hover threshold and line aesthetics with theme transition mapping
        if (globalOpacity > 0.1 && (energy > 0.05 || isGoldTime)) {
          const lineAlpha = isGoldConstellation 
            ? 0.35 + Math.sin(now * 0.006 + a.x) * 0.15 
            : energy * 0.42;
          
          ctx.beginPath();
          ctx.strokeStyle = isGoldConstellation
            ? `rgba(${GOLD_COLOR}, ${lineAlpha * globalOpacity})`
            : `rgba(${GlobalSkyCache.colors.primary}, ${lineAlpha * globalOpacity})`;
          
          ctx.lineWidth = 0.8 + energy * 1.6;
          ctx.shadowBlur = isGoldConstellation ? 16 : 12 * energy;
          ctx.shadowColor = isGoldConstellation
            ? `rgb(${GOLD_COLOR})`
            : `rgb(${GlobalSkyCache.colors.primary})`;
          
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      for (const star of stars) {
        star.baseOpacity = clamp(star.baseOpacity + heroOpacityBoost * 0.08, 0, 0.96);
        drawStar(ctx, star, isGoldConstellation, globalOpacity < 0.05, globalOpacity);
      }
    }

    frameCountRef.current++;
  }, [isDark]); // Re-bind on theme change to ensure smooth transition trigger

  const animate = useCallback(() => {
    if (!isAnimating.current) {
      return;
    }
    drawFrame();
    rafId.current = requestAnimationFrame(animate);
  }, [drawFrame]);

  const start = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width <= 0 || height <= 0) {
      return;
    }

    const rootStyles = getComputedStyle(document.documentElement);
    GlobalSkyCache.colors = {
      primary: rootStyles.getPropertyValue("--cloud-primary").trim() || "191, 123, 255",
      secondary: rootStyles.getPropertyValue("--cloud-secondary").trim() || "126, 214, 255",
      white: "255, 255, 255",
    };

    rebuildScene(width, height);

    debugLog("start", {
      width,
      height,
      theme: themeRef.current ? "dark" : "light",
      hasScene: Boolean(GlobalSkyCache.scene),
      particleCount: GlobalSkyCache.ambientStars.length,
    });

    drawFrame();

    if (!isAnimating.current) {
      isAnimating.current = true;
      rafId.current = requestAnimationFrame(animate);
    }
  }, [animate, drawFrame, rebuildScene]);

  const stop = useCallback(() => {
    isAnimating.current = false;
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
  }, []);

  useLayoutEffect(() => {
    start();
  }, [isDark, start]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (!debugStateRef.current.loggedMount) {
      debugStateRef.current.loggedMount = true;
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const styles = container ? window.getComputedStyle(container) : null;
      debugLog("mount", {
        resolvedTheme,
        hasContainer: Boolean(container),
        hasCanvas: Boolean(canvas),
        containerZIndex: styles?.zIndex,
        containerOpacity: styles?.opacity,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    }

    const { coarsePointer } = getViewportProfile();

    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleResize = () => {
      rebuildScene(window.innerWidth, window.innerHeight);
      drawFrame();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshSceneSelection();
        start();
      }
    };

    const syncInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        const now = new Date();
        const currentSlot = getTimeSlotByHour(now.getHours());
        const stored = readSharedJson<SelectedScene>(SKY_SCENE_STATE_KEY);
        
        const hasSceneChanged = isValidScene(stored) && (
          stored.sceneKey !== GlobalSkyCache.scene?.sceneKey || 
          stored.timeSlot !== currentSlot
        );

        if (hasSceneChanged) {
          debugLog("sync:cross-port-detected");
          refreshSceneSelection();
          start();
        }
      }
    }, 5000); // 5s polling is plenty for structural sync

    const handleFocus = () => {
      refreshSceneSelection();
      start();
    };
    const handlePageShow = () => {
      refreshSceneSelection();
      start();
    };
    const handlePageHide = () => {
      stop();
    };

    if (!coarsePointer) {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
    }
    window.addEventListener("resize", handleResize);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);

    // Sync Clear for Light mode to handle the "Transition Frame" captured by View Transitions API.
    // If transitioning to light, we MUST clear immediately so the browser's transition-screenshot is clean.
    if (!isDark) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return () => {
      if (!coarsePointer) {
        window.removeEventListener("mousemove", handleMouseMove);
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(syncInterval);
      // NOTE: We don't call stop() here because this effect re-runs on theme switch.
      // Transitioning should NOT kill the animation loop.
    };
  }, [resolvedTheme, start, rebuildScene, drawFrame]);

  // Handle absolute unmount cleanup 
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);


  return (
    <div ref={containerRef} className="starry-background-layer" data-starry-mounted="true">
      <canvas ref={canvasRef} className="starry-canvas" />
    </div>
  );
}

export default StarryBackground;
