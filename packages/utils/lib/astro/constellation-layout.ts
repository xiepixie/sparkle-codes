import type { Constellation } from "./constellation-data";
import { LAYOUT_SLOTS, type LayoutSlotId } from "./layout-slots";

export interface PlacedConstellationPoint {
  x: number;
  y: number;
  size: number;
  color?: string;
  hasSpike?: boolean;
}

export interface PlacedConstellation {
  name: string;
  points: PlacedConstellationPoint[];
  links: [number, number][];
  slotId: LayoutSlotId;
}

/**
 * Transforms local constellation points to absolute canvas coordinates based on a layout slot.
 */
export function placeConstellation(
  constellation: Constellation,
  slotId: LayoutSlotId,
  canvasWidth: number,
  canvasHeight: number
): PlacedConstellation {
  const slot = LAYOUT_SLOTS[slotId];
  if (!slot) {
    throw new Error(`Invalid Slot ID: ${slotId}`);
  }

  const scale = constellation.defaultScale ?? 1.0;
  
  // Box dimensions based on slot and global scaling
  const boxWidth = slot.width * canvasWidth * scale;
  const boxHeight = slot.height * canvasHeight * scale;
  
  // Center of the slot in pixels
  const centerX = slot.anchorX * canvasWidth;
  const centerY = slot.anchorY * canvasHeight;
  
  // Top-left of the placement box
  const boxLeft = centerX - boxWidth / 2;
  const boxTop = centerY - boxHeight / 2;

  return {
    name: constellation.name,
    slotId,
    links: constellation.links,
    points: constellation.points.map((p) => ({
      x: boxLeft + p.x * boxWidth,
      y: boxTop + p.y * boxHeight,
      size: p.size,
      color: p.color,
      hasSpike: p.hasSpike,
    })),
  };
}


/**
 * Strategy to resolve slots for primary and secondary constellations.
 * If a seed is provided, it use a weighted random approach to select slots.
 */
export function resolveSlots(primary: string | null, secondary: string | null, seed?: number) {
  if (!primary) {
    return { primarySlot: null, secondarySlot: null };
  }

  const availableSlots: LayoutSlotId[] = [
    "topRight",
    "topLeft",
    "midRight",
    "midLeft",
    "bottomRight",
    "bottomLeft",
  ];

  let pIdx: number;
  
  if (seed !== undefined) {
    // Generate a secondary stable seed from the first one
    const s1 = Math.abs(Math.sin(seed * 1234.567));
    pIdx = Math.floor(s1 * availableSlots.length);
  } else {
    // Deterministic fallback based on names
    pIdx = Math.abs(primary.length) % availableSlots.length;
  }
  
  const primarySlot = availableSlots[pIdx];

  if (!secondary) {
    return { primarySlot, secondarySlot: null };
  }

  let sIdx: number;
  if (seed !== undefined) {
    // Pick an offset that is not 0 (must be different slot)
    const s2 = Math.abs(Math.cos(seed * 789.012));
    const offset = 1 + Math.floor(s2 * (availableSlots.length - 1));
    sIdx = (pIdx + offset) % availableSlots.length;
  } else {
    // Fallback pick secondary slot: must be different from primary 
    sIdx = (pIdx + 3) % availableSlots.length;
  }
  
  const secondarySlot = availableSlots[sIdx];

  // Special rule for Scorpio + BigDipper (Easter Egg)
  if (
    (primary === "Scorpio" && secondary === "BigDipper") ||
    (primary === "BigDipper" && secondary === "Scorpio")
  ) {
    return {
      primarySlot: "bottomRight" as const,
      secondarySlot: "topLeft" as const,
    };
  }

  return { primarySlot, secondarySlot };
}
