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
 */
export function resolveSlots(primary: string | null, secondary: string | null) {
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

  // Deterministic seed based on names
  const pIdx = Math.abs(primary.length) % availableSlots.length;
  const primarySlot = availableSlots[pIdx];

  if (!secondary) {
    return { primarySlot, secondarySlot: null };
  }

  // Pick secondary slot: must be different from primary and ideally not adjacent
  // For simplicity, just pick the one most "opposite" or just different
  const sIdx = (pIdx + 3) % availableSlots.length;
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
