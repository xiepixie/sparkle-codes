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
    primaryPool: ["BigDipper", "Lyra"],
    secondaryPool: ["Lyra"],
    secondaryChance: 0.1,
    ambientCount: 180,
    heroOpacityBoost: 0.15,
    ambientOpacityMax: 0.5,
  },
  day: {
    primaryPool: ["Lyra"], // Very faint
    secondaryPool: [],
    secondaryChance: 0,
    ambientCount: 60,
    heroOpacityBoost: 0,
    ambientOpacityMax: 0.25,
  },
  dusk: {
    primaryPool: ["Scorpio", "BigDipper", "Cassiopeia", "Cygnus", "UrsaMinor"],
    secondaryPool: ["BigDipper", "Scorpio", "Lyra", "Cassiopeia", "UrsaMinor"],
    secondaryChance: 0.35,
    ambientCount: 280,
    heroOpacityBoost: 0.25,
    ambientOpacityMax: 0.65,
  },
  night: {
    primaryPool: ["Scorpio", "BigDipper", "Orion", "Cygnus", "Cassiopeia", "Crux", "Leo", "UrsaMinor"],
    secondaryPool: ["BigDipper", "Scorpio", "Orion", "Lyra", "Crux", "Cygnus", "Leo", "UrsaMinor"],
    secondaryChance: 0.5,
    ambientCount: 450,
    heroOpacityBoost: 0.35,
    ambientOpacityMax: 0.8,
  },
};
