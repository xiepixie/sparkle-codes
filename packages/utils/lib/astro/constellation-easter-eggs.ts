export type EasterEggEffectType = "celestialGold" | "dualPulse" | "meteor";

export interface EasterEggRule {
  pair: [string, string];
  effect: EasterEggEffectType;
  durationMs: number;
  description?: string; // Optional reasoning for the easter egg
}

export interface SpecialEffectState {
  type: EasterEggEffectType | null;
  active: boolean;
  startedAt: number;
  durationMs: number;
}

export const EASTER_EGG_RULES: EasterEggRule[] = [
  {
    pair: ["Scorpio", "Orion"],
    effect: "celestialGold",
    durationMs: 10000,
    description: "⚔️ 宿敌对决：蝎子刺杀猎户。现实中它们永远不会同时出现在天空中 — 此为不可能的相遇",
  },
  {
    pair: ["天鹅座 (Cygnus)", "天琴座 (Lyra)"],
    effect: "dualPulse",
    durationMs: 12000,
    description: "🎵 夏季大三角（局部）：天鹰衔银河，天鹅作桥，织女独奏。俄耳甫斯的琴声飘过银河",
  },
  {
    pair: ["Orion", "金牛座 (Taurus)"],
    effect: "celestialGold",
    durationMs: 10000,
    description: "🐂 冬夜王者：猎户追逐金牛。Aldebaran（毕宿五='追随者'）追踪昴星团",
  },
  {
    pair: ["双子座 (Gemini)", "Leo"],
    effect: "dualPulse",
    durationMs: 8000,
    description: "👬 黄道邻居：双胞胎与狮子在黄道上毗邻。Castor & Pollux 的不朽誓言",
  },
  {
    pair: ["Andromeda", "Cassiopeia"],
    effect: "celestialGold",
    durationMs: 10000,
    description: "👸 母女天罚：仙后的傲慢导致公主被献祭。它们在天球上紧邻",
  },
  {
    pair: ["Andromeda", "Perseus"],
    effect: "meteor",
    durationMs: 15000,
    description: "🗡️ 英雄救美：Perseus 斩美杜莎、救 Andromeda。触发彩蛋时使用流星效果（暗示英仙座流星雨）",
  },
  {
    pair: ["BigDipper", "UrsaMinor"],
    effect: "dualPulse",
    durationMs: 10000,
    description: "🐻 母子寻星：Dubhe-Merak 连线指向 Polaris。天文学入门第一课",
  },
  {
    pair: ["天琴座 (Lyra)", "Aquila"],
    effect: "celestialGold",
    durationMs: 12000,
    description: "🌌 七夕传说：织女(Vega) 与 牛郎(Altair) 隔银河相望。天鹅(Cygnus)是鹊桥",
  },
  {
    pair: ["Corona Borealis", "天琴座 (Lyra)"],
    effect: "dualPulse",
    durationMs: 8000,
    description: "👑 音乐与王冠：Ariadne 的婚冠与 Orpheus 的琴。两者都是'失去后被天空铭记'的意象",
  },
  {
    pair: ["BigDipper", "Cassiopeia"],
    effect: "meteor",
    durationMs: 8000,
    description: "🔄 北天双极：它们围绕北极星旋转时永远处于对角线位置。极轴对称的优雅",
  },
];
