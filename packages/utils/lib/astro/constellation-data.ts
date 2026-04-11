export type TimeSlot = "dawn" | "day" | "dusk" | "night";

export interface ConstellationPoint {
  x: number;   // local normalized (0-1)
  y: number;   // local normalized (0-1)
  size: number;
  color?: string;    // CSS color string (hex/hsl)
  hasSpike?: boolean; // Highlight with a subtle lens spike
  name?: string;     // Optional star name
}

export interface Constellation {
  name: string;
  points: ConstellationPoint[];
  links: [number, number][];
  preferredSlots: TimeSlot[];   // Suitable time segments
  weight?: number;              // Probability weight
  defaultScale?: number;        // Optional visual scaling
}

export const CONSTELLATIONS: Constellation[] = [
  {
    name: "Scorpio",
    preferredSlots: ["dusk", "night"],
    weight: 1.0,
    defaultScale: 1.1,
    points: [
      { name: "Graffias", x: 0.25, y: 0.15, size: 2.0, color: "#ffffff" },
      { name: "Dschubba", x: 0.35, y: 0.18, size: 2.2, color: "#a2c0ff" },
      { name: "Pi Sco", x: 0.18, y: 0.26, size: 1.8, color: "#ffffff" },
      { name: "Sigma Sco", x: 0.42, y: 0.35, size: 2.0, color: "#ffffff" },
      { name: "Antares", x: 0.48, y: 0.40, size: 4.2, color: "#ff4d4d", hasSpike: true }, // The Heart (Red Giant)
      { name: "Tau Sco", x: 0.52, y: 0.52, size: 1.8, color: "#ffffff" },
      { name: "Epsilon Sco", x: 0.56, y: 0.64, size: 2.0, color: "#ffffff" },
      { name: "Mu Sco", x: 0.60, y: 0.74, size: 1.8, color: "#ffffff" },
      { name: "Zeta Sco", x: 0.65, y: 0.85, size: 1.8, color: "#ffffff" },
      { name: "Eta Sco", x: 0.62, y: 0.94, size: 1.6, color: "#ffffff" },
      { name: "Sargas", x: 0.52, y: 0.96, size: 2.2, color: "#ffd2a1" },
      { name: "Shaula", x: 0.42, y: 0.86, size: 2.4, color: "#a2c0ff" } // Stinger
    ],
    links: [[0,1],[2,1],[1,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11]]
  },
  {
    name: "BigDipper",
    preferredSlots: ["dawn", "dusk", "night"],
    weight: 1.2,
    defaultScale: 1.0,
    points: [
      { name: "Alkaid", x: 0.05, y: 0.55, size: 2.2, color: "#a2c0ff" },
      { name: "Mizar", x: 0.20, y: 0.45, size: 2.2, color: "#ffffff" },
      { name: "Alcor", x: 0.18, y: 0.42, size: 1.2, color: "#ffffff" }, // famous visual binary system pair with Mizar
      { name: "Alioth", x: 0.35, y: 0.48, size: 2.6, color: "#ffffff", hasSpike: true },
      { name: "Megrez", x: 0.55, y: 0.52, size: 1.6, color: "#ffffff" },
      { name: "Phecda", x: 0.65, y: 0.65, size: 2.2, color: "#ffffff" },
      { name: "Merak", x: 0.85, y: 0.55, size: 2.0, color: "#ffffff" },
      { name: "Dubhe", x: 0.80, y: 0.35, size: 2.6, color: "#ffd2a1" } // Pointer star (K orange)
    ],
    links: [[0,1],[1,3],[3,4],[4,5],[5,6],[6,7],[7,4]]
  },
  {
    name: "Orion",
    preferredSlots: ["night"],
    weight: 1.2,
    defaultScale: 1.0,
    points: [
      { name: "Mintaka", x: 0.42, y: 0.47, size: 2.0, color: "#ffffff" }, 
      { name: "Alnilam", x: 0.50, y: 0.50, size: 2.2, color: "#ffffff" },
      { name: "Alnitak", x: 0.58, y: 0.53, size: 2.0, color: "#ffffff" },
      { name: "Betelgeuse", x: 0.30, y: 0.20, size: 3.8, color: "#ff8c42", hasSpike: true }, // Red supergiant
      { name: "Bellatrix", x: 0.72, y: 0.25, size: 2.2, color: "#a2c0ff" },
      { name: "Saiph", x: 0.38, y: 0.80, size: 2.0, color: "#ffffff" },
      { name: "Rigel", x: 0.78, y: 0.85, size: 4.2, color: "#80abff", hasSpike: true }, // Blue supergiant
      { name: "Meissa", x: 0.52, y: 0.10, size: 1.6, color: "#ffffff" } // Head
    ],
    links: [[3,7],[4,7],[3,0],[4,2],[0,1],[1,2],[0,6],[2,5],[6,5]]
  },
  {
    name: "Cassiopeia",
    preferredSlots: ["dusk", "night"],
    weight: 1.0,
    defaultScale: 1.1,
    points: [
      { name: "Caph", x: 0.15, y: 0.30, size: 2.2, color: "#ffffff" },
      { name: "Schedar", x: 0.35, y: 0.70, size: 2.8, color: "#ffd2a1", hasSpike: true }, // Orange giant K-type
      { name: "Gamma Cas", x: 0.50, y: 0.40, size: 2.4, color: "#a2c0ff" },
      { name: "Ruchbah", x: 0.70, y: 0.60, size: 2.2, color: "#ffffff" },
      { name: "Segin", x: 0.85, y: 0.20, size: 1.8, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4]]
  },
  {
    name: "天鹅座 (Cygnus)",
    preferredSlots: ["night", "dusk"],
    weight: 1.1,
    defaultScale: 1.0,
    points: [
      { name: "天津四 (Deneb)", x: 0.20, y: 0.15, size: 3.5, color: "#a2c0ff", hasSpike: true }, // Blue-white A2 supergiant
      { name: "天津一 (Sadr)",  x: 0.45, y: 0.35, size: 2.4, color: "#fff4e8" },
      { name: "辇道增七 (Albireo)", x: 0.85, y: 0.85, size: 2.6, color: "#ffd2a1" }, // Stunning double star
      { name: "天津九 (Gienah)", x: 0.25, y: 0.60, size: 2.0, color: "#ffb56c" },
      { name: "天津二 (Delta)",  x: 0.65, y: 0.15, size: 2.0, color: "#a2c0ff" }
    ],
    links: [[0, 1], [1, 2], [3, 1], [1, 4]]
  },
  {
    name: "南十字座 (Crux)",
    preferredSlots: ["night"],
    weight: 0.9,
    defaultScale: 0.8,
    points: [
      { name: "十字架一 (Gacrux)", x: 0.50, y: 0.10, size: 2.8, color: "#ff4d4d" }, // Class M red giant
      { name: "十字架二 (Acrux)",  x: 0.50, y: 0.90, size: 3.8, color: "#80abff", hasSpike: true }, // Class B blue-white
      { name: "十字架三 (Mimosa)", x: 0.15, y: 0.45, size: 3.2, color: "#80abff" },
      { name: "十字架四 (Delta)",  x: 0.80, y: 0.55, size: 2.2, color: "#a2c0ff" },
      { name: "十字架增一",        x: 0.70, y: 0.75, size: 1.2, color: "#ffb56c" }
    ],
    links: [[0, 1], [2, 3]]
  },
  {
    name: "天琴座 (Lyra)",
    preferredSlots: ["night", "dusk"],
    weight: 1.0,
    defaultScale: 0.85,
    points: [
      { name: "织女星 (Vega)", x: 0.20, y: 0.15, size: 4.5, color: "#e4e8ff", hasSpike: true }, // A0 main sequence
      { name: "织女二", x: 0.35, y: 0.18, size: 1.8, color: "#ffffff" },
      { name: "织女三", x: 0.30, y: 0.30, size: 1.8, color: "#ffffff" },
      { name: "渐台二 (Sheliak)", x: 0.50, y: 0.80, size: 2.2, color: "#a2c0ff" },
      { name: "渐台三 (Sulafat)", x: 0.80, y: 0.70, size: 2.0, color: "#a2c0ff" },
      { name: "Delta Lyr", x: 0.65, y: 0.45, size: 1.8, color: "#ffffff" },
      { name: "Gamma Lyr", x: 0.45, y: 0.55, size: 2.0, color: "#ffffff" }
    ],
    links: [[0, 1], [0, 2], [0, 6], [6, 3], [3, 4], [4, 5], [5, 6]]
  },
  {
    name: "金牛座 (Taurus)",
    preferredSlots: ["night"],
    weight: 0.8,
    defaultScale: 1.1,
    points: [
      { name: "毕宿五 (Aldebaran)", x: 0.35, y: 0.55, size: 3.8, color: "#ff8c42", hasSpike: true }, // K5 giant
      { name: "毕宿一", x: 0.48, y: 0.45, size: 2.0, color: "#ffd2a1" },
      { name: "毕宿四", x: 0.30, y: 0.45, size: 1.8, color: "#ffd2a1" },
      { name: "毕宿增二", x: 0.20, y: 0.40, size: 1.6, color: "#ffd2a1" },
      { name: "天关 (Zeta Tau)", x: 0.90, y: 0.45, size: 2.2, color: "#a2c0ff" },
      { name: "五车五 (Elnath)", x: 0.80, y: 0.15, size: 2.5, color: "#a2c0ff" },
      { name: "昴星团 (Pleiades)", x: 0.10, y: 0.10, size: 3.0, color: "#80abff" } // iconic blue star cluster
    ],
    links: [[3, 2], [2, 0], [0, 1], [0, 4], [1, 5]]
  },
  {
    name: "双子座 (Gemini)",
    preferredSlots: ["night", "dawn"],
    weight: 0.9,
    defaultScale: 1.1,
    points: [
      { name: "北河二 (Castor)", x: 0.20, y: 0.20, size: 2.8, color: "#a2c0ff" }, // 六重星
      { name: "北河三 (Pollux)", x: 0.35, y: 0.25, size: 3.2, color: "#ffb56c", hasSpike: true }, // K0 giant
      { name: "天樽二 (Wasat)", x: 0.45, y: 0.55, size: 1.8, color: "#fff4e8" },
      { name: "天樽三 (Mekbuda)", x: 0.25, y: 0.45, size: 1.8, color: "#ffd2a1" },
      { name: "井宿三 (Alhena)", x: 0.30, y: 0.85, size: 2.5, color: "#ffffff" },
      { name: "井宿一 (Alzirr)", x: 0.55, y: 0.80, size: 2.0, color: "#fff4e8" }
    ],
    links: [[0, 3], [3, 4], [1, 2], [2, 5]]
  },
  {
    name: "UrsaMinor",
    preferredSlots: ["dawn", "dusk", "night"],
    weight: 1.0,
    defaultScale: 0.8,
    points: [
      { name: "Polaris", x: 0.90, y: 0.10, size: 4.0, color: "#fffffa", hasSpike: true }, // North Star, Yellow-white supergiant
      { name: "Yildun", x: 0.70, y: 0.25, size: 1.6, color: "#ffffff" },
      { name: "Epsilon", x: 0.50, y: 0.40, size: 1.6, color: "#ffffff" },
      { name: "Zeta", x: 0.35, y: 0.50, size: 2.0, color: "#ffffff" },
      { name: "Kochab", x: 0.20, y: 0.80, size: 2.8, color: "#ffd2a1" }, // Orange
      { name: "Pherkad", x: 0.10, y: 0.60, size: 2.2, color: "#ffffff" },
      { name: "Eta", x: 0.25, y: 0.48, size: 1.8, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]
  },
  {
    name: "Leo",
    preferredSlots: ["night"],
    weight: 0.9,
    defaultScale: 1.1,
    points: [
      { name: "Regulus", x: 0.85, y: 0.85, size: 3.5, color: "#80abff", hasSpike: true }, // Blue main sequence
      { name: "Eta Leo", x: 0.95, y: 0.65, size: 1.8, color: "#ffffff" },
      { name: "Algieba", x: 0.80, y: 0.45, size: 2.4, color: "#ffb56c" },
      { name: "Adhafera", x: 0.65, y: 0.30, size: 1.8, color: "#ffffff" },
      { name: "Rasalas", x: 0.50, y: 0.35, size: 2.0, color: "#ffffff" },
      { name: "Zosma", x: 0.30, y: 0.45, size: 2.2, color: "#ffffff" },
      { name: "Chertan", x: 0.35, y: 0.60, size: 2.0, color: "#ffffff" },
      { name: "Denebola", x: 0.10, y: 0.40, size: 2.4, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,2],[0,6],[6,5],[2,5],[5,7]]
  },
  {
    name: "Andromeda",
    preferredSlots: ["night"],
    weight: 0.8,
    defaultScale: 1.0,
    points: [
      { name: "Alpheratz", x: 0.90, y: 0.80, size: 3.0, color: "#a2c0ff", hasSpike: true },
      { name: "Delta And", x: 0.70, y: 0.65, size: 2.0, color: "#ffffff" },
      { name: "Mirach", x: 0.50, y: 0.50, size: 2.8, color: "#ffb56c" }, // Red giant
      { name: "Gamma And (Almach)", x: 0.20, y: 0.20, size: 2.6, color: "#ffd2a1" },
      { name: "Pi And", x: 0.65, y: 0.40, size: 1.8, color: "#ffffff" },
      { name: "Mu And", x: 0.45, y: 0.30, size: 2.0, color: "#ffffff" },
      { name: "M31 (Andromeda Galaxy)", x: 0.35, y: 0.20, size: 3.8, color: "#a2c0ff" } // M31
    ],
    links: [[0,1],[1,2],[2,3],[1,4],[2,5],[5,6]]
  },
  {
    name: "Aries",
    preferredSlots: ["night", "dawn"],
    weight: 0.7,
    defaultScale: 0.8,
    points: [
      { name: "Hamal", x: 0.80, y: 0.40, size: 3.2, color: "#ffb56c", hasSpike: true }, // K2 orange giant
      { name: "Sheratan", x: 0.50, y: 0.50, size: 2.4, color: "#ffffff" },
      { name: "Mesarthim", x: 0.35, y: 0.65, size: 2.0, color: "#ffffff" }
    ],
    links: [[0,1],[1,2]]
  },
  {
    name: "Corona Borealis",
    preferredSlots: ["night"],
    weight: 0.7,
    defaultScale: 0.9,
    points: [
      { name: "Theta", x: 0.20, y: 0.45, size: 1.6, color: "#ffffff" },
      { name: "Beta", x: 0.30, y: 0.25, size: 2.0, color: "#ffffff" },
      { name: "Alphecca", x: 0.50, y: 0.15, size: 3.0, color: "#e4e8ff", hasSpike: true }, // A0 main sequence Jewel
      { name: "Gamma", x: 0.70, y: 0.20, size: 2.2, color: "#ffffff" },
      { name: "Delta", x: 0.82, y: 0.40, size: 1.8, color: "#ffffff" },
      { name: "Epsilon", x: 0.90, y: 0.65, size: 1.6, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5]]
  },
  {
    name: "Perseus",
    preferredSlots: ["night", "dawn"],
    weight: 0.9,
    defaultScale: 1.1,
    points: [
      { name: "Mirfak", x: 0.50, y: 0.40, size: 3.5, color: "#fffffa", hasSpike: true }, // Yellow-white F5 supergiant
      { name: "Algol", x: 0.70, y: 0.60, size: 2.8, color: "#ffb56c" }, // Demon star
      { name: "Gamma Per", x: 0.30, y: 0.20, size: 2.4, color: "#ffffff" },
      { name: "Delta Per", x: 0.40, y: 0.65, size: 2.0, color: "#ffffff" },
      { name: "Epsilon Per", x: 0.30, y: 0.85, size: 2.2, color: "#ffffff" },
      { name: "Atik", x: 0.80, y: 0.80, size: 2.0, color: "#a2c0ff" }
    ],
    links: [[2,0],[0,1],[1,5],[0,3],[3,4]]
  },
  {
    name: "Aquila",
    preferredSlots: ["night", "dusk"],
    weight: 1.0,
    defaultScale: 1.1,
    points: [
      { name: "Altair", x: 0.50, y: 0.50, size: 3.6, color: "#fffffa", hasSpike: true }, // Vega's lover across the river
      { name: "Tarazed", x: 0.38, y: 0.35, size: 2.6, color: "#ffb56c" }, // Orange giant K3
      { name: "Alshain", x: 0.60, y: 0.65, size: 2.2, color: "#a2c0ff" },
      { name: "Delta Aql", x: 0.25, y: 0.55, size: 2.0, color: "#ffffff" },
      { name: "Theta Aql", x: 0.80, y: 0.45, size: 2.2, color: "#ffffff" },
      { name: "Lambda Aql", x: 0.65, y: 0.90, size: 2.0, color: "#ffffff" }
    ],
    links: [[1,0],[0,2],[2,5],[0,3],[0,4]]
  }
];
