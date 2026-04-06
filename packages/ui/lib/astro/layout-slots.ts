export type LayoutSlotId =
  | "topLeft"
  | "topRight"
  | "midLeft"
  | "midRight"
  | "bottomLeft"
  | "bottomRight";

export interface LayoutSlot {
  id: LayoutSlotId;
  anchorX: number; // Normalized center X (0-1)
  anchorY: number; // Normalized center Y (0-1)
  width: number;   // Max width as % of screen (0-1)
  height: number;  // Max height as % of screen (0-1)
}

export const LAYOUT_SLOTS: Record<LayoutSlotId, LayoutSlot> = {
  topLeft:     { id: "topLeft",     anchorX: 0.15, anchorY: 0.18, width: 0.20, height: 0.18 },
  topRight:    { id: "topRight",    anchorX: 0.85, anchorY: 0.18, width: 0.20, height: 0.18 },
  midLeft:     { id: "midLeft",     anchorX: 0.12, anchorY: 0.48, width: 0.20, height: 0.18 },
  midRight:    { id: "midRight",    anchorX: 0.88, anchorY: 0.48, width: 0.20, height: 0.18 },
  bottomLeft:  { id: "bottomLeft",  anchorX: 0.15, anchorY: 0.82, width: 0.20, height: 0.18 },
  bottomRight: { id: "bottomRight", anchorX: 0.85, anchorY: 0.82, width: 0.20, height: 0.18 },
};
