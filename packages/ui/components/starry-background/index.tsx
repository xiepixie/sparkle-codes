"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTheme } from "next-themes";
import {
  CONSTELLATIONS,
  LAYOUT_SLOTS,
  TIME_SLOT_CONFIG,
  buildSceneForDate,
  getTimeSlotByHour,
  placeConstellation,
  readSharedJson,
  resolveSlots,
  writeSharedJson,
  type LayoutSlotId,
  type PlacedConstellation,
  type PlacedConstellationPoint,
  type SelectedScene,
  type SpecialEffectState,
} from "@repo/utils";
import "./styles.css";

const SKY_SCENE_STATE_KEY = "sky-scene";
const GOLD_COLOR = "255, 215, 0";
const IS_DEV = process.env.NODE_ENV !== "production";

// Static theme colors to avoid heavy getComputedStyle calls on theme toggle
const THEME_COLORS = {
  light: {
    primary: "186, 230, 253",
    secondary: "205, 180, 255",
  },
  dark: {
    primary: "191, 123, 255",
    secondary: "126, 214, 255",
  }
};

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

interface SpriteConfig {
  canvas: HTMLCanvasElement;
  offsets: Record<string, number>; // Maps color_size_glow to x position
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
  colorRole: 0 | 1 | 2; // 0: primary, 1: secondary, 2: white
  customColor?: string;
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
  lastWidth: number;
  lastHeight: number;
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
  lastWidth: 0,
  lastHeight: 0,
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

function getSceneVisibilityProfile(timeSlot: SelectedScene["timeSlot"]) {
  const cfg = TIME_SLOT_CONFIG[timeSlot];
  
  // Drastically amplify the ambient stars so it looks lush and rich
  const nightCount = Math.floor(cfg.ambientCount * 1.6);
  
  return {
    ambientCount: nightCount,
    // Slightly boost the max opacity to make the faint stars pop out more
    ambientOpacityMax: Math.min(1.0, cfg.ambientOpacityMax + 0.15),
    renderConstellations: true,
    skyMode: timeSlot === "dawn" ? "faint-dawn" : timeSlot === "dusk" ? "cinematic-dusk" : "deep-night",
  } as const;
}

function getViewportProfile(width: number, height: number) {
  if (typeof window === "undefined") {
    return { densityMultiplier: 1, coarsePointer: false };
  }

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const isCompact = coarsePointer || width < 768;
  const area = width * height;
  
  // Area-aware density normalization:
  // We use 1440 * 900 as the reference "standard" area.
  // Smaller screens get fewer stars to reduce layout burden.
  const REFERENCE_AREA = 1440 * 900;
  const areaRatio = Math.sqrt(clamp(area / REFERENCE_AREA, 0.45, 1.25));

  return {
    densityMultiplier: (isCompact ? 1.0 : 1.35) * areaRatio, 
    coarsePointer,
  };
}

function isPointInSlot(xRel: number, yRel: number, slotId: LayoutSlotId): boolean {
  const slot = LAYOUT_SLOTS[slotId];
  if (!slot) {
    return false;
  }
  
  // A star is considered "in the slot area" if it's within a reasonable padding box 
  // around the slot anchor.
  const halfW = slot.width / 1.5; 
  const halfH = slot.height / 1.5;
  
  return (
    xRel >= (slot.anchorX - halfW) &&
    xRel <= (slot.anchorX + halfW) &&
    yRel >= (slot.anchorY - halfH) &&
    yRel <= (slot.anchorY + halfH)
  );
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

  // 银河带偏置算法 (Milky Way Biasing):
  // 我们模拟一条从左下到右上的斜贯银河带，增加带状区域附近的星星密度。
  // 这消除了“噪点感”，增加了宇宙的结构感。
  while (attempts < 15) {
    const dx = xRel - 0.5;
    const dy = yRel - 0.5;
    const distToCenter = Math.sqrt(dx * dx + dy * dy);
    
    // 1. 避开中心点区域 (UI 保护)
    if (distToCenter < 0.18) {
      xRel = rng();
      yRel = rng();
      attempts++;
      continue;
    }

    // 2. 银河带逻辑: 距离 y = x 线的距离
    // 我们允许银河带随种子有一定的倾斜和偏移
    const bandOffset = (rng() - 0.5) * 0.2;
    const distToMilkyWay = Math.abs(xRel - yRel + bandOffset) / Math.sqrt(2);
    
    // 如果点在“银河带”外，我们以一定概率丢弃并重抽（以此提高带内密度）
    // 概率公式：距离越远，被丢弃的可能性越高
    if (distToMilkyWay > 0.15 && rng() > 0.35) {
      xRel = rng();
      yRel = rng();
      attempts++;
      continue;
    }

    break;
  }

  const depth = rng() > 0.65 ? 1 : 0;
  
  // ALWAYS use high-quality Dark specifications for the persistent structural cache
  const size = depth === 0
    ? 0.85 + rng() * 1.25 // Increased base size for better visibility
    : 1.35 + rng() * 2.2;

  const paletteRoll = rng();
  const colorRole = paletteRoll > 0.78 ? 0 : paletteRoll > 0.52 ? 1 : 2;
  const color = colorRole === 0 ? colors.primary : colorRole === 1 ? colors.secondary : colors.white;

  const ceiling = clamp(ambientOpacityMax + (depth === 1 ? 0.15 : 0.05), 0.3, 0.95);
  const floor = clamp(ceiling * 0.45, 0.2, 0.4);
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
    drift: 0, // Static mode remains to prevent global sliding distraction
    twinkleSpeed: 0.0008 + rng() * (depth === 1 ? 0.002 : 0.0014),
    twinkleOffset: rng() * Math.PI * 2,
    excitement: 0,
    isHero: false,
    colorRole,
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
  const isCustomColor = Boolean(point.color);
  const customColor = point.color ? hexToRgb(point.color) : undefined;
  const paletteRoll = rng();
  const colorRole = paletteRoll > 0.45 ? 0 : 1;
  const starColor = customColor || (colorRole === 0 ? colors.primary : colors.secondary);

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
    drift: 0, // Zero drift prevents annoying global movement
    twinkleSpeed: 0.0012 + rng() * 0.002,
    twinkleOffset: rng() * Math.PI * 2,
    excitement: 0,
    isHero: true,
    isCustomColor,
    customColor,
    colorRole,
    hasSpike: point.hasSpike,
    constellationName,
    paletteRoll,
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

/**
 * STAR RESCALE LOGIC (决策型注释)
 * 为什么：当窗口尺寸变化时，如果销毁重建所有星星会导致视觉跳动（Jank）。
 * 通过保持相对位置 (xRel, yRel) 并线性缩放到新尺寸，实现了平滑的响应式设计，
 * 且避免了重新进行伪随机位置生成的开销。
 */
function rescaleStars(stars: StarNode[], width: number, height: number) {
  for (const star of stars) {
    star.x = star.xRel * width;
    star.y = star.yRel * height;
  }
}

function createSpritePool(colors: ThemeColors): SpriteConfig | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const offsets: Record<string, number> = {};
  
  const sizes = [16, 32, 48]; // Glow sizes (scaled)
  const roleColors = [colors.primary, colors.secondary, colors.white, GOLD_COLOR];
  const roleNames = ["p", "s", "w", "g"];
  
  canvas.width = 1000; // Enough space
  canvas.height = 100;
  
  let currentX = 0;
  
  roleColors.forEach((color, i) => {
    const name = roleNames[i];
    sizes.forEach(radius => {
      const fullSize = radius * 2 + 10;
      
      const gradient = ctx.createRadialGradient(
        currentX + radius + 5, radius + 5, 0,
        currentX + radius + 5, radius + 5, radius
      );
      gradient.addColorStop(0, `rgba(${color}, 1)`);
      gradient.addColorStop(1, "transparent");
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(currentX + radius + 5, radius + 5, radius, 0, Math.PI * 2);
      ctx.fill();
      
      offsets[`${name}_${radius}`] = currentX + 5;
      currentX += fullSize;
    });
  });
  
  return { canvas, offsets };
}

function drawStar(
  ctx: CanvasRenderingContext2D, 
  star: StarNode, 
  isGoldEffect: boolean, 
  isSuppressed: boolean,
  globalOpacityMultiplier: number,
  pool: SpriteConfig | null,
  colorStrings: string[],
  now: number
) {
  if (globalOpacityMultiplier < 0.001 || isSuppressed) {
    return;
  }
  const shimmerFactor = isGoldEffect ? (Math.sin(now * 0.008 + star.x) * 0.25 + 0.75) : 1;
  const twinkleShimmer = Math.sin(now * star.twinkleSpeed + star.twinkleOffset);
  
  const effectiveOpacity = clamp(
    (star.baseOpacity + twinkleShimmer * (star.isHero ? 0.18 : 0.1) + star.excitement * 0.65) * shimmerFactor * globalOpacityMultiplier,
    0, 1
  );

  if (effectiveOpacity < 0.005) {
    return;
  }

  const roleName = isGoldEffect ? "g" : (star.colorRole === 0 ? "p" : star.colorRole === 1 ? "s" : "w");
  const effectiveSize = star.size * (isGoldEffect ? 1.08 : 1);

  // OPTIMIZATION: Use pre-rendered Glow sprites instead of radial gradients
  if ((star.depth >= 1 || star.isHero) && pool) {
    const excitementGlow = star.isHero ? (star.excitement * 4) : 0;
    const baseGlowRadius = star.isHero ? (isGoldEffect ? 12 : 8 + excitementGlow) : 4.5;
    const glowRadius = effectiveSize * baseGlowRadius;
    
    // Choose closest pool size (16, 32, 48)
    const poolRadius = glowRadius < 11 ? 16 : glowRadius < 24 ? 32 : 48;
    const offsetX = pool.offsets[`${roleName}_${poolRadius}`];
    
    if (offsetX !== undefined) {
      const baseGlowOpacity = isGoldEffect ? 0.35 * shimmerFactor : star.isHero ? star.excitement * 0.45 : 0.08;
      ctx.globalAlpha = baseGlowOpacity * globalOpacityMultiplier;
      
      const drawSize = poolRadius * 2;
      ctx.drawImage(
        pool.canvas,
        offsetX, 0, drawSize, drawSize,
        star.x - poolRadius, star.y - poolRadius, drawSize, drawSize
      );
    }
  }

  // Draw the star core
  ctx.globalAlpha = effectiveOpacity;
  const activeColorIndex = isGoldEffect ? 3 : star.colorRole;
  ctx.fillStyle = colorStrings[activeColorIndex]; 
  
  ctx.beginPath();
  ctx.arc(star.x, star.y, effectiveSize, 0, Math.PI * 2);
  ctx.fill();
  
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
        ctx.globalAlpha = spikeAlpha;
        ctx.strokeStyle = colorStrings[activeColorIndex];
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
        ctx.globalAlpha = flareOpacity;
        ctx.strokeStyle = colorStrings[activeColorIndex];
        ctx.lineWidth = 0.35;
        const flareLen = star.isHero ? effectiveSize * 2.8 : effectiveSize * 1.2;
        ctx.beginPath();
        ctx.moveTo(-flareLen, 0); ctx.lineTo(flareLen, 0);
        ctx.moveTo(0, -flareLen); ctx.lineTo(0, flareLen);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1.0;
  }
}



export function StarryBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritePool = useRef<SpriteConfig | null>(null);
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
    const { densityMultiplier } = getViewportProfile(width, height);
    const visibility = getSceneVisibilityProfile(scene.timeSlot);
    const rng = createSeededRandom(scene.seed || 0.5);
    
    debugLog("scene:init", { key: scene.sceneKey, timeSlot: scene.timeSlot });

    // (Type 3) AMBIENT: Background stars for depth and atmosphere
    const ambientCount = Math.max(0, Math.round(visibility.ambientCount * densityMultiplier));
    const ambientStars: StarNode[] = [];
    const placed: PlacedConstellation[] = [];
    const heroMap = new Map<string, StarNode[]>();

    const { primarySlot, secondarySlot } = resolveSlots(scene.primary, scene.secondary, scene.seed);
    const shouldRenderConstellations = visibility.renderConstellations;

    for (let i = 0; i < ambientCount; i++) {
      const star = createAmbientStar(rng, colors, visibility.ambientOpacityMax);
      
      // 视觉削减 (Visual Culling): 如果随机星落在了星座槽位内，降低其基础亮度，确保星座英雄能脱颖而出
      if (shouldRenderConstellations) {
        const isInPrimary = primarySlot && isPointInSlot(star.xRel, star.yRel, primarySlot);
        const isInSecondary = secondarySlot && isPointInSlot(star.xRel, star.yRel, secondarySlot);
        if (isInPrimary || isInSecondary) {
          star.baseOpacity *= 0.65;
        }
      }
      
      ambientStars.push(star);
    }

    // (Type 1) PRIMARY: Main constellations fixed by PC Time rule
    if (shouldRenderConstellations && scene.primary && primarySlot) {
      const constellation = CONSTELLATIONS.find((item) => item.name === scene.primary);
      if (constellation) {
        placed.push(placeConstellation(constellation, primarySlot as LayoutSlotId, width, height));
      }
    }

    // (Type 2) SECONDARY: Random bonus constellations
    if (shouldRenderConstellations && scene.secondary && secondarySlot) {
      const constellation = CONSTELLATIONS.find((item) => item.name === scene.secondary);
      if (constellation) {
        placed.push(placeConstellation(constellation, secondarySlot as LayoutSlotId, width, height));
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

    const dimensionsChanged = GlobalSkyCache.lastWidth !== width || GlobalSkyCache.lastHeight !== height;
    
    if (dimensionsChanged) {
      resizeCanvas(width, height);
      GlobalSkyCache.lastWidth = width;
      GlobalSkyCache.lastHeight = height;
    } else {
      // FIX: Ensure transform persists if resize was skipped (prevents top-left shrinking)
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        const dpr = viewportRef.current.dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    // V2 Force Cache Bust to ensure users see the updated star densities immediately
    const currentStructureKey = `${GlobalSkyCache.scene.sceneKey}-V3`;
    const isKeyMatch = GlobalSkyCache.lastAppliedSceneKey === currentStructureKey;

    if (!isKeyMatch) {
      // ATOMIC CLEANUP for structural changes
      GlobalSkyCache.lastAppliedSceneKey = currentStructureKey;
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
      spritePool.current = createSpritePool(GlobalSkyCache.colors);
      debugLog("scene:initialized", { 
        isDark, 
        count: GlobalSkyCache.ambientStars.length,
        width,
        height 
      });
    } else if (dimensionsChanged) {
      // 性能优化：当尺寸变化时，如果已经有星星数组，只进行线性坐标重映射
      // 这避免了昂贵的随机数生成和对象创建操作。
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
    
    // CACHED COLOR STRINGS
    const colors = GlobalSkyCache.colors;
    const colorStrings = [
      `rgb(${colors.primary})`,
      `rgb(${colors.secondary})`,
      `rgb(${colors.white})`,
      `rgb(${GOLD_COLOR})`
    ];

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

    // UI/UX Deep Logic: React to user cursor intuitively, but keep background location structurally static
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
    }

    // GROUPED AMBIENT DRAWING
    for (let role = 0; role < 3; role++) {
      ctx.fillStyle = colorStrings[role];
      for (const star of GlobalSkyCache.ambientStars) {
        if (star.colorRole !== role) {
          continue;
        }
        drawStar(ctx, star, false, globalOpacity < 0.05, globalOpacity, spritePool.current, colorStrings, now);
      }
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

        // Deep UX logic: Constellation lines have a persistent base glow so they are never 'missing'
        // Hovering enhances the energy, but they always remain visible as the structural backdrop.
        const baseEnergy = 0.25;
        const energy = clamp((a.excitement + b.excitement) / 2 + baseEnergy, 0, 1);
        
        if (globalOpacity > 0.1 && (energy > 0.05 || isGoldTime)) {
          const lineAlpha = isGoldConstellation 
            ? 0.45 + Math.sin(now * 0.006 + a.x) * 0.2 
            : energy * 0.5;
          
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
        drawStar(ctx, star, isGoldConstellation, globalOpacity < 0.05, globalOpacity, spritePool.current, colorStrings, now);
      }
    }

    frameCountRef.current++;
  }, [isDark]); // Re-bind on theme change to ensure smooth transition trigger

  const animate = useCallback(() => {
    // CRITICAL: Stop animation loop during theme transitions or if disabled.
    // This prevents CPU contention during browser snapshots and blending.
    if (!isAnimating.current || (window as any).__SPARKLE_THEME_TRANSITION__) {
      if (isAnimating.current) {
        rafId.current = requestAnimationFrame(animate);
      }
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

    // Use static mapping instead of getComputedStyle to avoid forced synchronous layout
    const mode = themeRef.current === "dark" ? "dark" : "light";
    const colors = THEME_COLORS[mode];
    
    GlobalSkyCache.colors = {
      primary: colors.primary,
      secondary: colors.secondary,
      white: "255, 255, 255",
    };

    /**
     * PERFORMANCE POLICY (决策型注释)
     * 为什么：在 Light 模式下禁用所有 Canvas 计算及动画。
     * 1. 节省电力与 CPU：背景星星在浅色界面中对比度极低，视觉贡献小，禁掉它能显著提升页面响应性能。
     * 2. 避免冗余重绘：浅色模式下背景通常是不透明白色，Canvas 渲染层完全被遮挡。
     */
    if (themeRef.current !== "dark") {
      return;
    }

    rebuildScene(width, height);
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

  // Optimized Theme Switch: Defer the expensive background restart to an idle period.
  // This ensures the main UI (text, buttons, navigation) updates instantly 
  // without being blocked by the Canvas initialization.
  // SYNCHRONOUS PRE-WARM: Use useLayoutEffect to ensure the background re-calculates 
  // colors and visibility BEFORE the View Transition API captures its snapshot.
  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!isDark) {
      stop();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    
    // Check for transition lock or flag
    const isTransitioning = (window as any).__SPARKLE_THEME_TRANSITION__;

    if (isTransitioning) {
      // FORCED SYNC START: No delays during transitions.
      start();
    } else {
      // Standard Load: Defer to idle callback for background performance
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => start(), { timeout: 200 });
      } else {
        setTimeout(start, 50);
      }
    }
  }, [isDark, start, stop]);

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

    const { coarsePointer } = getViewportProfile(window.innerWidth, window.innerHeight);

    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY };
    };

    let resizeTimer: number | undefined;
    const handleResize = () => {
      // 节流处理：Resize 触发时，我们只重置 Canvas 尺寸，延迟重新布局星星。
      const canvas = canvasRef.current;
      if (canvas) {
        // 视觉上先拉伸，防止出现空白白边，真正的重算放在定时器里
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
      }

      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        rebuildScene(window.innerWidth, window.innerHeight);
        drawFrame();
      }, 180);
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
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
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
