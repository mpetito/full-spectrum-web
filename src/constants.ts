/** Shared constants for the Dither3D UI. */

/** Minimum absolute epsilon (100nm floor) to prevent numerical degeneracy at small layer heights. */
export const MIN_ABSOLUTE_EPSILON = 0.0001;

export const FILAMENT_COLORS = [
  '#808080', // 0: default/unassigned (gray)
  '#E74C3C', // 1: red
  '#3498DB', // 2: blue
  '#2ECC71', // 3: green
  '#F39C12', // 4: orange
  '#9B59B6', // 5: purple
  '#1ABC9C', // 6: teal
  '#E67E22', // 7: dark orange
  '#2C3E50', // 8: dark blue
  '#27AE60', // 9: forest green
  '#C0392B', // 10: dark red
] as const;
