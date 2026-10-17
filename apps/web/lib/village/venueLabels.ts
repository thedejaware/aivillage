import type { Pt } from "./layout";

/** Gap between a venue's pad and its painted name. */
export const EDGE_GAP = 0.6;

/**
 * Where a venue's name is painted on the ground: at the pad's edge nearest the
 * camera, turned so it reads upright from there (like a map label).
 * `yaw` is the Y rotation of a flat text plane whose "up" points to −z at yaw 0.
 */
export function groundLabelPlacement(center: Pt, radius: number, camera: Pt): { x: number; z: number; yaw: number } {
  const dx = camera.x - center.x;
  const dz = camera.z - center.z;
  const d = Math.hypot(dx, dz) || 1;
  const r = radius + EDGE_GAP;
  return { x: center.x + (dx / d) * r, z: center.z + (dz / d) * r, yaw: Math.atan2(dx, dz) };
}
