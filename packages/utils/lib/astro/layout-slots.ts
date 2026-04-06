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
  topLeft:     { id: "topLeft",     anchorX: 0.22, anchorY: 0.22, width: 0.22, height: 0.20 },
  topRight:    { id: "topRight",    anchorX: 0.78, anchorY: 0.22, width: 0.22, height: 0.20 },
  midLeft:     { id: "midLeft",     anchorX: 0.18, anchorY: 0.50, width: 0.22, height: 0.20 },
  midRight:    { id: "midRight",    anchorX: 0.82, anchorY: 0.50, width: 0.22, height: 0.20 },
  bottomLeft:  { id: "bottomLeft",  anchorX: 0.22, anchorY: 0.78, width: 0.22, height: 0.20 },
  bottomRight: { id: "bottomRight", anchorX: 0.78, anchorY: 0.78, width: 0.22, height: 0.20 },
};
