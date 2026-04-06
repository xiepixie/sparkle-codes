import { CONSTELLATIONS, type TimeSlot } from "./constellation-data";
import { TIME_SLOT_CONFIG } from "./constellation-schedule";
import { EASTER_EGG_RULES, type EasterEggEffectType } from "./constellation-easter-eggs";

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
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

function weightedPick(names: string[]): string | null {
  if (!names.length) return null;

  const enriched = names.map((name) => {
    const c = CONSTELLATIONS.find((x) => x.name === name);
    return { name, weight: c?.weight ?? 1 };
  });

  const total = enriched.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;

  for (const item of enriched) {
    r -= item.weight;
    if (r <= 0) return item.name;
  }
  return enriched[enriched.length - 1]?.name ?? null;
}

function findEffect(primary: string | null, secondary: string | null) {
  if (!primary || !secondary) return { effect: null, duration: 0 };

  const pairSorted = [primary, secondary].sort().join("|");

  for (const rule of EASTER_EGG_RULES) {
    const ruleSorted = [...rule.pair].sort().join("|");
    if (ruleSorted === pairSorted) return { effect: rule.effect, duration: rule.durationMs };
  }

  return { effect: null, duration: 0 };
}

export function buildSceneForDate(date = new Date()): SelectedScene {
  const hour = date.getHours();
  const timeSlot = getTimeSlotByHour(hour);
  const config = TIME_SLOT_CONFIG[timeSlot];

  const primary = weightedPick(config.primaryPool);

  let secondary: string | null = null;
  if (
    primary &&
    config.secondaryPool.length > 0 &&
    Math.random() < config.secondaryChance
  ) {
    const filtered = config.secondaryPool.filter((name) => name !== primary);
    secondary = weightedPick(filtered);
  }

  const { effect, duration } = findEffect(primary, secondary);
  const dateStr = date.toISOString().split('T')[0];

  return {
    timeSlot,
    primary,
    secondary,
    effect,
    effectDuration: duration,
    sceneKey: `${timeSlot}-${dateStr}-${primary ?? 'none'}-${secondary ?? 'none'}`,
    seed: Math.random(),
  };
}
