import type { TimeSlot } from "./constellation-data";

export interface TimeSlotConfig {
  primaryPool: string[];     // 主星座池
  secondaryPool: string[];   // 副星座池
  secondaryChance: number;   // 0~1 (副星座概率)
  ambientCount: number;      // 环境星数
  heroOpacityBoost: number;  // 星座基础不透明度提升
  ambientOpacityMax: number; // 环境星最大不透明度
}

export const TIME_SLOT_CONFIG: Record<TimeSlot, TimeSlotConfig> = {
  dawn: {
    primaryPool: ["BigDipper", "UrsaMinor", "天琴座 (Lyra)", "双子座 (Gemini)", "Aries", "Perseus"],
    secondaryPool: ["天琴座 (Lyra)", "BigDipper", "双子座 (Gemini)", "Aries"],
    secondaryChance: 0.40,
    ambientCount: 120, // 适中，清晨微光
    heroOpacityBoost: 0.55,
    ambientOpacityMax: 0.5,
  },
  day: {
    primaryPool: ["天琴座 (Lyra)", "BigDipper", "UrsaMinor"],
    secondaryPool: ["BigDipper", "天琴座 (Lyra)"],
    secondaryChance: 0.20,
    ambientCount: 60, // 增加白天星数，避免太空
    heroOpacityBoost: 0.25,
    ambientOpacityMax: 0.2,
  },
  dusk: {
    primaryPool: ["Scorpio", "BigDipper", "Cassiopeia", "天鹅座 (Cygnus)", "UrsaMinor", "天琴座 (Lyra)", "Leo", "Aquila"],
    secondaryPool: ["BigDipper", "Scorpio", "天琴座 (Lyra)", "Cassiopeia", "UrsaMinor", "Aquila"],
    secondaryChance: 0.75,
    ambientCount: 180, // 从 352 显著下调
    heroOpacityBoost: 0.70,
    ambientOpacityMax: 0.65,
  },
  night: {
    primaryPool: [
      "Scorpio", "BigDipper", "Orion", "天鹅座 (Cygnus)", "Cassiopeia",
      "南十字座 (Crux)", "Leo", "UrsaMinor", "金牛座 (Taurus)", "双子座 (Gemini)",
      "Andromeda", "Aries", "Corona Borealis", "天琴座 (Lyra)", "Perseus", "Aquila"
    ],
    secondaryPool: [
      "BigDipper", "Scorpio", "Orion", "天琴座 (Lyra)", "南十字座 (Crux)",
      "天鹅座 (Cygnus)", "Leo", "UrsaMinor", "金牛座 (Taurus)", "双子座 (Gemini)",
      "Andromeda", "Aries", "Corona Borealis", "Cassiopeia", "Perseus", "Aquila"
    ],
    secondaryChance: 0.85,
    ambientCount: 240, // 核心改动：从 512 下调一半以上，提升通透感
    heroOpacityBoost: 0.85,
    ambientOpacityMax: 0.8,
  },
};
