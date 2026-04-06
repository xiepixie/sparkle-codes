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
      { x: 0.15, y: 0.15, size: 1.8, color: "#ffffff" },
      { x: 0.20, y: 0.22, size: 2.2, color: "#a2c0ff" }, 
      { x: 0.18, y: 0.30, size: 1.8, color: "#ffffff" },
      { x: 0.35, y: 0.32, size: 1.6, color: "#ffffff" },
      { name: "Antares", x: 0.48, y: 0.45, size: 4.2, color: "#ff4d4d", hasSpike: true }, // The Heart (Red Giant)
      { x: 0.55, y: 0.60, size: 1.8, color: "#ffffff" },
      { x: 0.58, y: 0.75, size: 1.6, color: "#ffffff" },
      { x: 0.52, y: 0.88, size: 1.8, color: "#ffffff" },
      { x: 0.65, y: 0.94, size: 1.6, color: "#ffffff" },
      { x: 0.80, y: 0.92, size: 1.8, color: "#ffffff" },
      { x: 0.90, y: 0.82, size: 2.2, color: "#a2c0ff" }, // Shaula (Stinger)
      { x: 0.88, y: 0.68, size: 1.6, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[1,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11]]
  },
  {
    name: "BigDipper",
    preferredSlots: ["dawn", "dusk", "night"],
    weight: 1.2,
    defaultScale: 1.0,
    points: [
      { name: "Alkaid", x: 0.05, y: 0.35, size: 2.2, color: "#a2c0ff" },
      { name: "Mizar", x: 0.18, y: 0.42, size: 1.8, color: "#ffffff" },
      { name: "Alioth", x: 0.32, y: 0.55, size: 2.6, color: "#ffffff", hasSpike: true },
      { name: "Megrez", x: 0.48, y: 0.68, size: 1.5, color: "#ffffff" },
      { name: "Phecda", x: 0.46, y: 0.88, size: 2.2, color: "#ffffff" },
      { name: "Merak", x: 0.75, y: 0.92, size: 2.0, color: "#ffffff" },
      { name: "Dubhe", x: 0.82, y: 0.65, size: 2.4, color: "#ffd2a1" } // Pointer star
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]
  },
  {
    name: "Orion",
    preferredSlots: ["night"],
    weight: 1.2,
    defaultScale: 1.0,
    points: [
      { name: "Betelgeuse", x: 0.25, y: 0.15, size: 3.5, color: "#ff8c42", hasSpike: true },
      { name: "Bellatrix", x: 0.75, y: 0.22, size: 2.0, color: "#a2c0ff" },
      { name: "Mintaka", x: 0.44, y: 0.48, size: 2.0, color: "#ffffff" }, 
      { name: "Alnilam", x: 0.50, y: 0.50, size: 2.2, color: "#ffffff" },
      { name: "Alnitak", x: 0.56, y: 0.52, size: 2.0, color: "#ffffff" },
      { name: "Saiph", x: 0.30, y: 0.85, size: 2.0, color: "#ffffff" },
      { name: "Rigel", x: 0.80, y: 0.88, size: 4.5, color: "#80abff", hasSpike: true }
    ],
    links: [[0,2],[1,4],[2,3],[3,4],[2,5],[4,6]]
  },
  {
    name: "Cassiopeia",
    preferredSlots: ["dusk", "night"],
    weight: 1.0,
    defaultScale: 1.1,
    points: [
      { x: 0.10, y: 0.65, size: 2.2, color: "#ffffff" },
      { name: "Schedar", x: 0.32, y: 0.38, size: 2.8, color: "#ffd2a1", hasSpike: true },
      { x: 0.50, y: 0.55, size: 2.4, color: "#a2c0ff" },
      { x: 0.72, y: 0.28, size: 2.2, color: "#ffffff" },
      { x: 0.90, y: 0.62, size: 1.8, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4]]
  },
  {
    name: "天鹅座 (Cygnus)",
    preferredSlots: ["night", "dusk"],
    weight: 1.1,
    defaultScale: 1.0,
    points: [
      { name: "天津四 (Deneb)", x: 0.50, y: 0.15, size: 3.2, color: "#a2c0ff", hasSpike: true },
      { name: "天津一 (Sadr)",  x: 0.50, y: 0.45, size: 2.2, color: "#fff4e8" },
      { name: "天津九 (Gienah)",x: 0.15, y: 0.35, size: 2.0, color: "#ffb56c" },
      { name: "天津二 (Delta)", x: 0.85, y: 0.35, size: 2.0, color: "#a2c0ff" },
      { name: "辇道增七 (Albireo)", x: 0.50, y: 0.85, size: 2.5, color: "#ffd2a1" }
    ],
    links: [[0, 1], [1, 2], [1, 3], [1, 4]]
  },
  {
    name: "南十字座 (Crux)",
    preferredSlots: ["night"],
    weight: 0.9,
    defaultScale: 0.8,
    points: [
      { name: "十字架一 (Gacrux)", x: 0.45, y: 0.15, size: 2.8, color: "#ff4d4d" },
      { name: "十字架二 (Acrux)",  x: 0.55, y: 0.85, size: 3.5, color: "#80abff", hasSpike: true },
      { name: "十字架三 (Mimosa)", x: 0.20, y: 0.45, size: 3.0, color: "#80abff" },
      { name: "十字架四 (Delta)",  x: 0.75, y: 0.35, size: 2.2, color: "#a2c0ff" },
      { name: "十字架增一",        x: 0.60, y: 0.65, size: 1.2, color: "#ffb56c" }
    ],
    links: [[0, 1], [2, 3]]
  },
  {
    name: "天琴座 (Lyra)",
    preferredSlots: ["night", "dusk"],
    weight: 1.0,
    defaultScale: 0.85,
    points: [
      { name: "织女星 (Vega)", x: 0.70, y: 0.10, size: 4.5, color: "#e4e8ff", hasSpike: true },
      { name: "织女二", x: 0.80, y: 0.30, size: 1.5, color: "#ffffff" },
      { name: "织女三", x: 0.50, y: 0.40, size: 1.8, color: "#ffffff" },
      { name: "渐台二 (Sheliak)", x: 0.20, y: 0.65, size: 2.0, color: "#a2c0ff" },
      { name: "渐台三 (Sulafat)", x: 0.40, y: 0.85, size: 2.0, color: "#a2c0ff" }
    ],
    links: [[0, 1], [0, 2], [1, 2], [2, 3], [3, 4], [4, 2]]
  },
  {
    name: "金牛座 (Taurus)",
    preferredSlots: ["night"],
    weight: 0.8,
    defaultScale: 1.1,
    points: [
      { name: "毕宿五 (Aldebaran)", x: 0.35, y: 0.60, size: 3.5, color: "#ff8c42", hasSpike: true },
      { name: "毕宿一", x: 0.45, y: 0.45, size: 2.0, color: "#ffd2a1" },
      { name: "毕宿四", x: 0.25, y: 0.45, size: 1.8, color: "#ffd2a1" },
      { name: "天关 (Zeta Tau)", x: 0.85, y: 0.80, size: 2.2, color: "#a2c0ff" },
      { name: "五车五 (Elnath)", x: 0.75, y: 0.15, size: 2.5, color: "#a2c0ff" },
      { name: "昴星团 (Pleiades)", x: 0.10, y: 0.15, size: 3.0, color: "#80abff" }
    ],
    links: [[2, 0], [2, 1], [0, 3], [1, 4]]
  },
  {
    name: "双子座 (Gemini)",
    preferredSlots: ["night", "dawn"],
    weight: 0.9,
    defaultScale: 1.1,
    points: [
      { name: "北河二 (Castor)", x: 0.65, y: 0.15, size: 2.8, color: "#a2c0ff" },
      { name: "北河三 (Pollux)", x: 0.35, y: 0.20, size: 3.0, color: "#ffb56c", hasSpike: true },
      { name: "天樽二 (Wasat)", x: 0.70, y: 0.45, size: 1.8, color: "#fff4e8" },
      { name: "天樽三 (Mekbuda)", x: 0.30, y: 0.50, size: 1.8, color: "#ffd2a1" },
      { name: "井宿三 (Alhena)", x: 0.20, y: 0.85, size: 2.5, color: "#ffffff" },
      { name: "井宿一 (Alzirr)", x: 0.80, y: 0.80, size: 2.0, color: "#fff4e8" }
    ],
    links: [[0, 2], [2, 5], [1, 3], [3, 4]]
  },
  {
    name: "UrsaMinor",
    preferredSlots: ["dawn", "dusk", "night"],
    weight: 1.0,
    defaultScale: 0.8,
    points: [
      { name: "Polaris", x: 0.10, y: 0.10, size: 4.0, color: "#ffffff", hasSpike: true }, // North Star
      { x: 0.25, y: 0.20, size: 1.6, color: "#ffffff" },
      { x: 0.35, y: 0.35, size: 1.6, color: "#ffffff" },
      { x: 0.50, y: 0.50, size: 2.0, color: "#ffffff" },
      { x: 0.75, y: 0.52, size: 1.8, color: "#ffffff" },
      { x: 0.85, y: 0.75, size: 1.8, color: "#ffffff" },
      { x: 0.65, y: 0.85, size: 1.8, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]
  },
  {
    name: "Leo",
    preferredSlots: ["night"],
    weight: 0.9,
    defaultScale: 1.1,
    points: [
      { x: 0.85, y: 0.15, size: 2.0, color: "#ffffff" },
      { x: 0.95, y: 0.30, size: 1.8, color: "#ffffff" },
      { x: 0.90, y: 0.45, size: 1.8, color: "#ffffff" },
      { name: "Regulus", x: 0.75, y: 0.55, size: 3.5, color: "#80abff", hasSpike: true }, // Blue giant
      { x: 0.45, y: 0.58, size: 2.2, color: "#ffffff" },
      { x: 0.15, y: 0.65, size: 2.4, color: "#ffffff" },
      { x: 0.25, y: 0.40, size: 1.8, color: "#ffffff" },
      { x: 0.50, y: 0.35, size: 2.0, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,4]]
  },
  {
    name: "Andromeda",
    preferredSlots: ["night"],
    weight: 0.8,
    defaultScale: 1.0,
    points: [
      { name: "Alpheratz", x: 0.15, y: 0.15, size: 2.8, color: "#ffffff", hasSpike: true },
      { x: 0.35, y: 0.25, size: 2.0, color: "#ffffff" },
      { name: "Mirach", x: 0.55, y: 0.38, size: 2.5, color: "#ffb56c" },
      { x: 0.75, y: 0.52, size: 2.0, color: "#ffffff" },
      { name: "Almach", x: 0.90, y: 0.65, size: 2.4, color: "#ffd2a1" },
      { name: "M31 (Nebula)", x: 0.58, y: 0.22, size: 3.5, color: "#a2c0ff" } // Representing the galaxy position
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[2,5]]
  },
  {
    name: "Aries",
    preferredSlots: ["night", "dawn"],
    weight: 0.7,
    defaultScale: 0.8,
    points: [
      { name: "Hamal", x: 0.25, y: 0.25, size: 3.2, color: "#ffb56c", hasSpike: true },
      { name: "Sheratan", x: 0.55, y: 0.45, size: 2.4, color: "#ffffff" },
      { name: "Mesarthim", x: 0.75, y: 0.65, size: 2.0, color: "#ffffff" }
    ],
    links: [[0,1],[1,2]]
  },
  {
    name: "Corona Borealis",
    preferredSlots: ["night"],
    weight: 0.7,
    defaultScale: 0.9,
    points: [
      { x: 0.15, y: 0.45, size: 1.5, color: "#ffffff" },
      { x: 0.25, y: 0.65, size: 1.8, color: "#ffffff" },
      { x: 0.40, y: 0.78, size: 2.0, color: "#ffffff" },
      { name: "Alphecca", x: 0.55, y: 0.82, size: 3.0, color: "#ffffff", hasSpike: true },
      { x: 0.70, y: 0.75, size: 2.0, color: "#ffffff" },
      { x: 0.82, y: 0.60, size: 1.8, color: "#ffffff" },
      { x: 0.90, y: 0.40, size: 1.5, color: "#ffffff" }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]
  }
];


