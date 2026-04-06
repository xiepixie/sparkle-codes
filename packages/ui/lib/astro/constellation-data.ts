export type TimeSlot = "dawn" | "day" | "dusk" | "night";

export interface ConstellationPoint {
  x: number;   // local normalized (0-1)
  y: number;   // local normalized (0-1)
  size: number;
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
      { x: 0.06, y: 0.28, size: 2.2 },
      { x: 0.14, y: 0.22, size: 1.8 },
      { x: 0.22, y: 0.32, size: 2.4 },
      { x: 0.30, y: 0.46, size: 1.6 },
      { x: 0.38, y: 0.62, size: 1.8 },
      { x: 0.48, y: 0.74, size: 3.2 }, // Antares
      { x: 0.60, y: 0.72, size: 1.8 },
      { x: 0.70, y: 0.62, size: 1.6 },
      { x: 0.80, y: 0.54, size: 1.4 },
      { x: 0.88, y: 0.66, size: 1.8 },
      { x: 0.94, y: 0.82, size: 2.2 },
      { x: 0.88, y: 0.94, size: 1.6 }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11]]
  },
  {
    name: "BigDipper",
    preferredSlots: ["dawn", "dusk", "night"],
    weight: 1.2,
    defaultScale: 1.0,
    points: [
      { x: 0.18, y: 0.20, size: 2.2 },
      { x: 0.30, y: 0.24, size: 1.8 },
      { x: 0.44, y: 0.32, size: 2.4 },
      { x: 0.40, y: 0.50, size: 1.6 },
      { x: 0.28, y: 0.60, size: 2.2 },
      { x: 0.14, y: 0.66, size: 1.8 },
      { x: 0.04, y: 0.56, size: 1.6 }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]
  },
  {
    name: "Orion",
    preferredSlots: ["night"],
    weight: 0.8,
    defaultScale: 1.0,
    points: [
      { x: 0.20, y: 0.15, size: 2.2 }, // Betelgeuse
      { x: 0.15, y: 0.48, size: 1.6 },
      { x: 0.26, y: 0.80, size: 2.4 }, // Rigel
      { x: 0.45, y: 0.45, size: 2.0 }, // Belt 1
      { x: 0.52, y: 0.48, size: 2.0 }, // Belt 2
      { x: 0.59, y: 0.51, size: 2.0 }, // Belt 3
      { x: 0.72, y: 0.22, size: 1.8 },
      { x: 0.78, y: 0.52, size: 1.6 },
      { x: 0.82, y: 0.88, size: 2.2 }
    ],
    links: [[0,3],[3,1],[1,2],[3,4],[4,5],[5,7],[7,6],[7,8]]
  },
  {
    name: "Cassiopeia",
    preferredSlots: ["dusk", "night"],
    weight: 1.0,
    defaultScale: 1.1,
    points: [
      { x: 0.10, y: 0.60, size: 2.0 },
      { x: 0.32, y: 0.42, size: 1.8 },
      { x: 0.50, y: 0.52, size: 2.4 },
      { x: 0.68, y: 0.30, size: 2.0 },
      { x: 0.90, y: 0.55, size: 1.8 }
    ],
    links: [[0,1],[1,2],[2,3],[3,4]]
  },
  {
    name: "Cygnus",
    preferredSlots: ["night", "dusk"],
    weight: 1.1,
    defaultScale: 1.2,
    points: [
      { x: 0.50, y: 0.20, size: 2.5 }, // Deneb
      { x: 0.50, y: 0.50, size: 1.8 }, // Heart
      { x: 0.20, y: 0.45, size: 1.6 }, // Left wing
      { x: 0.80, y: 0.55, size: 1.6 }, // Right wing
      { x: 0.50, y: 0.90, size: 2.0 }  // Head
    ],
    links: [[0,1],[1,2],[1,3],[1,4]]
  },
  {
    name: "Crux",
    preferredSlots: ["night"],
    weight: 0.7,
    defaultScale: 0.9,
    points: [
      { x: 0.50, y: 0.15, size: 2.2 },
      { x: 0.25, y: 0.50, size: 2.0 },
      { x: 0.75, y: 0.50, size: 2.0 },
      { x: 0.50, y: 0.85, size: 2.4 }
    ],
    links: [[0,3],[1,2]]
  },
  {
    name: "Lyra",
    preferredSlots: ["night", "dusk"],
    weight: 0.9,
    defaultScale: 1.0,
    points: [
      { x: 0.15, y: 0.10, size: 3.2 }, // Vega
      { x: 0.45, y: 0.30, size: 1.8 },
      { x: 0.85, y: 0.35, size: 1.8 },
      { x: 0.75, y: 0.75, size: 1.8 },
      { x: 0.35, y: 0.70, size: 1.8 }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,1]]
  },
  {
    name: "UrsaMinor",
    preferredSlots: ["dawn", "dusk", "night"],
    weight: 1.0,
    defaultScale: 0.8,
    points: [
      { x: 0.10, y: 0.10, size: 3.5 }, // Polaris
      { x: 0.25, y: 0.25, size: 1.6 },
      { x: 0.40, y: 0.35, size: 1.6 },
      { x: 0.55, y: 0.50, size: 2.0 },
      { x: 0.75, y: 0.55, size: 1.8 },
      { x: 0.80, y: 0.80, size: 1.8 },
      { x: 0.60, y: 0.85, size: 1.8 }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]
  },
  {
    name: "Leo",
    preferredSlots: ["night"],
    weight: 0.9,
    defaultScale: 1.1,
    points: [
      { x: 0.80, y: 0.20, size: 2.2 },
      { x: 0.70, y: 0.35, size: 1.8 },
      { x: 0.75, y: 0.55, size: 2.4 }, // Regulus
      { x: 0.60, y: 0.65, size: 1.8 },
      { x: 0.40, y: 0.60, size: 2.0 },
      { x: 0.20, y: 0.70, size: 2.2 },
      { x: 0.35, y: 0.40, size: 1.8 },
      { x: 0.60, y: 0.30, size: 1.6 }
    ],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,1]]
  }
];
