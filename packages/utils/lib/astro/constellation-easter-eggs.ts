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
    durationMs: 8000,
  },
  {
    // The Summer Triangle (incomplete but common pair)
    pair: ["天鹅座 (Cygnus)", "天琴座 (Lyra)"],
    effect: "dualPulse",
    durationMs: 12000,
  },
  {
    // The Winter Peak
    pair: ["Orion", "金牛座 (Taurus)"],
    effect: "celestialGold",
    durationMs: 10000,
  },
];

