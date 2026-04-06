import { type TimeSlot } from "./constellation-data";

export interface TimeSlotConfig {
  primaryPool: string[];
  secondaryPool: string[];
  secondaryChance: number; // 0~1
  ambientCount: number;
  heroOpacityBoost: number;
  ambientOpacityMax: number;
}

export const TIME_SLOT_CONFIG: Record<TimeSlot, TimeSlotConfig> = {
  dawn: {
    primaryPool: ["BigDipper", "天琴座 (Lyra)", "双子座 (Gemini)", "UrsaMinor", "Aries"],
    secondaryPool: ["天琴座 (Lyra)", "BigDipper", "双子座 (Gemini)", "Aries"],
    secondaryChance: 0.35,
    ambientCount: 140,
    heroOpacityBoost: 0.15,
    ambientOpacityMax: 0.5,
  },
  day: {
    primaryPool: ["天琴座 (Lyra)", "BigDipper", "UrsaMinor"], // Extremely faint
    secondaryPool: ["BigDipper", "天琴座 (Lyra)"],
    secondaryChance: 0.2, // Drastically reduced for day
    ambientCount: 25,
    heroOpacityBoost: 0,
    ambientOpacityMax: 0.2,
  },
  dusk: {
    primaryPool: ["Scorpio", "BigDipper", "Cassiopeia", "天鹅座 (Cygnus)", "UrsaMinor", "天琴座 (Lyra)"],
    secondaryPool: ["BigDipper", "Scorpio", "天琴座 (Lyra)", "Cassiopeia", "UrsaMinor"],
    secondaryChance: 0.75,
    ambientCount: 220,
    heroOpacityBoost: 0.25,
    ambientOpacityMax: 0.65,
  },
  night: {
    primaryPool: ["Scorpio", "BigDipper", "Orion", "天鹅座 (Cygnus)", "Cassiopeia", "南十字座 (Crux)", "Leo", "UrsaMinor", "金牛座 (Taurus)", "双子座 (Gemini)", "Andromeda", "Aries", "Corona Borealis"],
    secondaryPool: ["BigDipper", "Scorpio", "Orion", "天琴座 (Lyra)", "南十字座 (Crux)", "天鹅座 (Cygnus)", "Leo", "UrsaMinor", "金牛座 (Taurus)", "双子座 (Gemini)", "Andromeda", "Aries", "Corona Borealis"],
    secondaryChance: 0.85,
    ambientCount: 320,
    heroOpacityBoost: 0.35,
    ambientOpacityMax: 0.8,
  },
};

