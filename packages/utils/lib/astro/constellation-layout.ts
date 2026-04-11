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
 *
 * 决策型注释：
 * - 为什么要特殊干预？因为自然排列可能导致星座重叠或无法形成神话对抗的张力。
 * - 保护了什么约束？强制宿敌/母子对处于空间中的特定方位对以符合神话逻辑。
 * - 改坏会怎样？会导致彩蛋出现时的视觉效果大幅降级。
 * - 删除条件？若不再需要特定星座彩蛋位置绑定即可移除。
 */
export function resolveSlots(
  primary: string | null,
  secondary: string | null,
  seed?: number
): { primarySlot: LayoutSlotId | null; secondarySlot: LayoutSlotId | null } {
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
    // 空间对垒算法 (Opposition Logic): 
    // 尝试寻找与主星座距离最远的槽位，以维持视觉平衡。
    // 计算逻辑：取主槽位在数组中的对角偏移 [p+3] 并通过种子进行微调偏移 [±1]。
    const s2 = Math.abs(Math.cos(seed * 789.012));
    const diagonalOffset = 3;
    const jitter = Math.round(s2 * 2) - 1; // -1, 0, 1
    sIdx = (pIdx + diagonalOffset + jitter + availableSlots.length) % availableSlots.length;
  } else {
    sIdx = (pIdx + 3) % availableSlots.length;
  }
  
  const secondarySlot = availableSlots[sIdx];

  // ===============================
  // 特殊排列规则 (Special Layout Rules)
  // ===============================
  const isMatch = (a: string, b: string) => 
    (primary === a && secondary === b) || (primary === b && secondary === a);

  // 1. 宿敌对决: 猎户与天蝎
  if (isMatch("Scorpio", "Orion")) {
    return {
      primarySlot: primary === "Scorpio" ? "bottomRight" : "topLeft",
      secondarySlot: secondary === "Scorpio" ? "bottomRight" : "topLeft",
    };
  }

  // 2. 英雄救美: 英仙与仙女
  if (isMatch("Andromeda", "Perseus")) {
    return {
      primarySlot: primary === "Andromeda" ? "topRight" : "midRight",
      secondarySlot: secondary === "Andromeda" ? "topRight" : "midRight",
    };
  }

  // 3. 母子寻星: 大熊(北斗)与小熊
  if (isMatch("BigDipper", "UrsaMinor")) {
    return {
      primarySlot: primary === "BigDipper" ? "topLeft" : "topRight",
      secondarySlot: secondary === "BigDipper" ? "topLeft" : "topRight",
    };
  }

  // 4. 母女天罚: 仙后与仙女
  if (isMatch("Andromeda", "Cassiopeia")) {
    return {
      primarySlot: primary === "Andromeda" ? "topRight" : "topLeft",
      secondarySlot: secondary === "Andromeda" ? "topRight" : "topLeft",
    };
  }

  return { primarySlot, secondarySlot };
}
