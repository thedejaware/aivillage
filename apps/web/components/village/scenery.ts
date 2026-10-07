/**
 * Scene-dressing math on top of the village layout: road/pad clearance tests,
 * heights of the ground layers, and deterministic placement helpers. Pure —
 * no React — so decor never lands on a road a twin walks.
 */
import { DEFAULT_ZONES } from "@aivillage/shared";
import { EDGES, ISLAND_HALF, NODES, zoneCenter, type Pt } from "../../lib/village/layout";

export const ROAD_W = 0.44;
export const ROAD_H = 0.012;
export const LINE_H = 0.004;
/** Top of the paved venue pads (they cover the road ends). */
export const PAD_TOP = 0.022;
/** Top of lawns and grass patches. */
export const GRASS_TOP = 0.03;
/** The green verge that rings the island: inner and outer half-size. */
export const VERGE_IN = ISLAND_HALF - 1.0;
export const VERGE_OUT = ISLAND_HALF - 0.2;

/** Stage platform top: a performer standing on it should be lifted this much. */
export const STAGE_TOP = 0.08;

/** Heights (world Y) of the surfaces at each activity spot. */
export const SEAT_Y = {
  coffee: PAD_TOP + 0.24,
  bench: PAD_TOP + 0.235,
  blanket: GRASS_TOP + 0.02,
  stage: STAGE_TOP
} as const;

/** Radius of the paved pad (or lawn) around each venue's centre. */
export const PAD_RADIUS: Record<string, number> = {
  plaza: 1.3,
  maker_space: 1.45,
  network_hub: 1.15,
  event_space: 1.65
};

/** The road node that sits at each venue's centre. */
export const NODE_ZONE: Record<string, string> = {
  C: "plaza",
  CAFE: "maker_space",
  QUIET: "network_hub",
  LAWN: "event_space"
};

export interface Pad extends Pt { zone: string; r: number }

export const PADS: Pad[] = DEFAULT_ZONES.map((z) => ({ zone: z.name, ...zoneCenter(z.name), r: PAD_RADIUS[z.name] ?? 1.2 }));

export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** Closest point on any road centreline. */
export function nearestRoadPoint(p: Pt): Pt {
  let best: Pt = p;
  let bd = Infinity;
  for (const [ia, ib] of EDGES) {
    const a = NODES[ia], b = NODES[ib];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    const q = { x: a.x + dx * t, z: a.z + dz * t };
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** Distance from a point to the nearest road centreline. */
export function roadDist(p: Pt): number {
  let best = Infinity;
  for (const [a, b] of EDGES) best = Math.min(best, segDist(p, NODES[a], NODES[b]));
  return best;
}

/** True when a prop of radius `margin` at p stays off roads, venue pads and the island rim. */
export function isClear(p: Pt, margin: number, opts: { pads?: boolean; rim?: number } = {}): boolean {
  if (roadDist(p) < ROAD_W / 2 + margin) return false;
  if (opts.pads !== false) {
    for (const pad of PADS) if (Math.hypot(p.x - pad.x, p.z - pad.z) < pad.r + margin) return false;
  }
  const lim = (opts.rim ?? VERGE_IN) - margin;
  return Math.abs(p.x) <= lim && Math.abs(p.z) <= lim;
}

/** Shrink a rectangle around its centre until it clears roads and pads, or give up. */
export function fitRect(cx: number, cz: number, w: number, d: number, margin: number): { w: number; d: number } | null {
  for (let k = 0; k < 16; k++) {
    if (rectClear(cx, cz, w, d, margin)) return { w, d };
    w *= 0.9;
    d *= 0.9;
    if (w < 0.45 || d < 0.35) return null;
  }
  return null;
}

function rectClear(cx: number, cz: number, w: number, d: number, margin: number): boolean {
  const step = 0.08;
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) {
    for (let z = -d / 2; z <= d / 2 + 1e-6; z += step) {
      if (!isClear({ x: cx + x, z: cz + z }, margin)) return false;
    }
  }
  return true;
}

/** Deterministic PRNG (mulberry32) so the dressing is identical on every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
