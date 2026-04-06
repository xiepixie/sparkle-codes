export type EasterEggEffectType = "celestialGold" | "dualPulse" | "meteor";

export interface EasterEggRule {
  pair: [string, string];
  effect: EasterEggEffectType;
  durationMs: number;
}

export interface SpecialEffectState {
  type: EasterEggEffectType | null;
  active: boolean;
  startedAt: number;
  durationMs: number;
}

export const EASTER_EGG_RULES: EasterEggRule[] = [
  {
    pair: ["Scorpio", "BigDipper"],
    effect: "celestialGold",
    durationMs: 8000, // 8 seconds of shimmering gold
  },
];
