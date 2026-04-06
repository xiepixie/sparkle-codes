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

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const monthNumber = date.getMonth() + 1;
  const dayNumber = date.getDate();
  const month = monthNumber < 10 ? `0${monthNumber}` : `${monthNumber}`;
  const day = dayNumber < 10 ? `0${dayNumber}` : `${dayNumber}`;
  return `${year}-${month}-${day}`;
}

/**
 * Deterministic numeric hash-based PRNG starting from a string or number.
 * Ensures server and client reach the exact same conclusion if they share 
 * the same input (like the current date string).
 */
export function createPRNG(seed: string | number) {
  let s = typeof seed === "string" ? 
    seed.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0) : 
    seed;
  
  // Use a simple but effective LCG-style generator
  return () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function getTimeSlotByHour(hour: number): TimeSlot {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

function weightedPick(names: string[], rng: () => number): string | null {
  if (!names.length) return null;

  const enriched = names.map((name) => {
    const c = CONSTELLATIONS.find((x) => x.name === name);
    return { name, weight: c?.weight ?? 1 };
  });

  const total = enriched.reduce((sum, item) => sum + item.weight, 0);
  let r = rng() * total;

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

/**
 * Builds a deterministic scene for a given date.
 * If no date is provided, it uses the current local current day (no hours!)
 * to ensure consistency across the entire session until the day rolls over, 
 * or alternatively, use hours for more dynamism but ensure the input 
 * is synchronized across SSR/Client.
 */
export function buildSceneForDate(date = new Date()): SelectedScene {
  const hour = date.getHours();
  // Use local date + local hour. `toISOString()` would shift the date in non-UTC timezones.
  const dateStr = formatLocalDateKey(date);
  const hourStr = hour.toString();
  const seedString = `${dateStr}-${hourStr}`;
  
  const rng = createPRNG(seedString);
  const timeSlot = getTimeSlotByHour(hour);
  const config = TIME_SLOT_CONFIG[timeSlot];

  const primary = weightedPick(config.primaryPool, rng);

  let secondary: string | null = null;
  if (
    primary &&
    config.secondaryPool.length > 0 &&
    rng() < config.secondaryChance
  ) {
    const filtered = config.secondaryPool.filter((name) => name !== primary);
    secondary = weightedPick(filtered, rng);
  }

  const { effect, duration } = findEffect(primary, secondary);

  return {
    timeSlot,
    primary,
    secondary,
    effect,
    effectDuration: duration,
    sceneKey: `${timeSlot}-${seedString}-${primary ?? 'none'}-${secondary ?? 'none'}`,
    seed: rng(), // This final seed is useable by other components for their own logic
  };
}
