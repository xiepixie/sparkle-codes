import { CONSTELLATIONS, type TimeSlot } from "./constellation-data";
import { EASTER_EGG_RULES, type EasterEggEffectType } from "./constellation-easter-eggs";
import { TIME_SLOT_CONFIG } from "./constellation-schedule";

export interface SelectedScene {
  timeSlot: TimeSlot;
  primary: string | null;
  secondary: string | null;
  effect: EasterEggEffectType | null;
  effectDuration: number;
  sceneKey: string;
  seed: number;
}

export function getTimeSlotByHour(hour: number): TimeSlot {
  if (hour >= 5 && hour < 8) {
    return "dawn";
  }
  if (hour >= 8 && hour < 17) {
    return "day";
  }
  if (hour >= 17 && hour < 20) {
    return "dusk";
  }
  return "night";
}

function deterministicPick(names: string[], seed: number): string | null {
  if (!names.length) {
    return null;
  }

  // Create a local fast deterministic RNG for this pick
  let s = seed;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };

  const enriched = names.map((name) => {
    const c = CONSTELLATIONS.find((x) => x.name === name);
    return { name, weight: c?.weight ?? 1 };
  });

  const total = enriched.reduce((sum, item) => sum + item.weight, 0);
  let r = next() * total;

  for (const item of enriched) {
    r -= item.weight;
    if (r <= 0) {
      return item.name;
    }
  }
  return enriched[enriched.length - 1]?.name ?? null;
}

function findEffect(primary: string | null, secondary: string | null) {
  if (!primary || !secondary) {
    return { effect: null, duration: 0 };
  }

  const pairSorted = [primary, secondary].sort().join("|");

  for (const rule of EASTER_EGG_RULES) {
    const ruleSorted = [...rule.pair].sort().join("|");
    if (ruleSorted === pairSorted) {
      return { effect: rule.effect, duration: rule.durationMs };
    }
  }

  return { effect: null, duration: 0 };
}

export function buildSceneForDate(date = new Date()): SelectedScene {
  const hour = date.getHours();
  const timeSlot = getTimeSlotByHour(hour);
  const config = TIME_SLOT_CONFIG[timeSlot];
  const dateStr = date.toISOString().split("T")[0];

  /**
   * DETERMINISTIC SEEDING (决策型注释)
   * 为什么：通过日期和时段生成固定种子，实现“全站共享星空”。
   * 1. 减少计算：用户跨小时但处于同一个时段（如 Night 的 9 小时）时，场景完全复用，无需重算。
   * 2. 视觉一致：消除了 Math.random 导致的刷新跳动。
   */
  const slotSeed = Math.abs(
    (date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()) * 
    (timeSlot === "dawn" ? 1 : timeSlot === "day" ? 2 : timeSlot === "dusk" ? 3 : 4)
  );

  const primary = deterministicPick(config.primaryPool, slotSeed);

  let secondary: string | null = null;
  const secondaryRand = ((slotSeed * 9301 + 49297) % 233280) / 233280;
  
  if (
    primary &&
    config.secondaryPool.length > 0 &&
    secondaryRand < config.secondaryChance
  ) {
    const filtered = config.secondaryPool.filter((name) => name !== primary);
    secondary = deterministicPick(filtered, slotSeed + 1);
  }

  const { effect, duration } = findEffect(primary, secondary);

  return {
    timeSlot,
    primary,
    secondary,
    effect,
    effectDuration: duration,
    sceneKey: `${timeSlot}-${dateStr}`,
    seed: slotSeed / 2147483647,
  };
}
