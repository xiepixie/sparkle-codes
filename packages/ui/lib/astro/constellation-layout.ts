import type { Constellation } from "./constellation-data";
import { LAYOUT_SLOTS, type LayoutSlotId } from "./layout-slots";

export interface PlacedConstellationPoint {
  x: number;
  y: number;
  size: number;
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

  // Define available slots to avoid the center (already done by LAYOUT_SLOTS design)
  const availableSlots: LayoutSlotId[] = [
    "topRight",
    "topLeft",
    "midRight",
    "midLeft",
    "bottomRight",
    "bottomLeft",
  ];

  if (!secondary) {
    // Pick a stable slot for the primary star based on its name hash or something similar
    // to preserve layout across refreshes but not across constellation types.
    // Or just pick one from the top clusters to keep center clear.
    const slotIdx = Math.abs(primary.length) % availableSlots.length;
    return {
      primarySlot: availableSlots[slotIdx],
      secondarySlot: null,
    };
  }

  // Specific rule for Scorpio + BigDipper (Easter Egg)
  if (
    (primary === "Scorpio" && secondary === "BigDipper") ||
    (primary === "BigDipper" && secondary === "Scorpio")
  ) {
    return {
      primarySlot: "bottomRight" as const, // Scorpio bottom right
      secondarySlot: "topLeft" as const,    // Big Dipper top left (classic look)
    };
  }

  // Default fallback for dual stars: spread them out
  return {
    primarySlot: "topRight" as const,
    secondarySlot: "bottomLeft" as const,
  };
}
