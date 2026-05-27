// Mirror of backend/detector.py PCB_CLASSES + CLASS_COLORS_HEX so the UI can
// colour-code chips and bounding boxes even before the first server response.

export const PCB_CLASSES = [
  "missing_hole",
  "mouse_bite",
  "open_circuit",
  "short",
  "spur",
  "spurious_copper",
];

export const PCB_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
];

export function colorFor(className, idx = 0) {
  const i = PCB_CLASSES.indexOf(className);
  if (i >= 0) return PCB_COLORS[i];
  return PCB_COLORS[idx % PCB_COLORS.length];
}

export function prettyClass(name) {
  return name.replace(/_/g, " ");
}
