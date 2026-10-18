/**
 * Placement math for the Main Street scenery: the wider street and its bike
 * lane, buildings that reach past their round pads, keep-out areas, and
 * deterministic scattering of trees / lamps over the big island. Pure — no
 * React, no three.js — so tests can prove that nothing lands on a road, a pad
 * or a spot a twin uses.
 */
import {
  COASTER, EDGES, HOUSE, NODES, POOL, CINEMA, SPOTS, STREET, zoneCenter, type Pt, type Pt3
} from "../../lib/village/layout";
import { PADS, PAD_RADIUS, ROAD_W, VERGE_IN, isClear, rng, segDist } from "./scenery";

// ---------------- the main street ----------------

/** The main street is wider than the side roads. */
export const STREET_W = 0.64;
/** Painted bike lane inside the street: centre offset (to the +normal side, west → east) and width. */
export const BIKE_LANE = { offset: 0.2, width: 0.15 };

const streetPairs = new Set(STREET.slice(1).map((id, i) => `${STREET[i]}|${id}`));

export function isStreetEdge(a: string, b: string): boolean {
  return streetPairs.has(`${a}|${b}`) || streetPairs.has(`${b}|${a}`);
}

/** Distance from a point to the main street's centreline. */
export function streetDist(p: Pt): number {
  let best = Infinity;
  for (let i = 1; i < STREET.length; i++) best = Math.min(best, segDist(p, NODES[STREET[i - 1]], NODES[STREET[i]]));
  return best;
}

/** Distance to the nearest side road (any edge that is not the street). */
function sideRoadDist(p: Pt): number {
  let best = Infinity;
  for (const [a, b] of EDGES) if (!isStreetEdge(a, b)) best = Math.min(best, segDist(p, NODES[a], NODES[b]));
  return best;
}

// ---------------- buildings that reach past their pads ----------------

/**
 * The shared house (relative to the home centre): turned so its front (+z
 * local) faces the door spot, with the door spot on the doorstep.
 */
export const HOUSE_BODY = (() => {
  const door = HOUSE.door;
  const fx = door.x - HOUSE.x, fz = door.z - HOUSE.z;
  const len = Math.hypot(fx, fz);
  const ux = fx / len, uz = fz / len;
  const w = 1.4, d = 1.1, step = 0.16;
  return { x: door.x - ux * (d / 2 + step), z: door.z - uz * (d / 2 + step), yaw: Math.atan2(ux, uz), w, d };
})();

/** Middle of the house's front wall (world), where the door is drawn. */
export function houseDoorWorld(): Pt {
  const c = zoneCenter("home");
  return {
    x: c.x + HOUSE_BODY.x + Math.sin(HOUSE_BODY.yaw) * HOUSE_BODY.d / 2,
    z: c.z + HOUSE_BODY.z + Math.cos(HOUSE_BODY.yaw) * HOUSE_BODY.d / 2
  };
}

/**
 * The café building (relative to the café centre), front facing +z: behind the
 * terrace as the default (+x,+z) camera sees it, so it never hides the tables,
 * and beside the path that comes in from the road.
 */
export const CAFE_BUILDING = { x: -1.3, z: -0.85, w: 1.41, d: 0.87 };

/** The pool deck (relative to the pool centre): holds the basin and the loungers. */
export const POOL_DECK = (() => {
  const x0 = Math.min(POOL.x - POOL.w / 2, ...POOL.loungers.map((l) => l.x - 0.2)) - 0.25;
  const x1 = Math.max(POOL.x + POOL.w / 2, ...POOL.loungers.map((l) => l.x + 0.2)) + 0.25;
  const z0 = POOL.z - POOL.d / 2 - 0.25;
  // the deck runs out to the pad's front edge, where the pool's road arrives
  const z1 = Math.max(PAD_RADIUS.pool - 0.15, ...POOL.loungers.map((l) => l.z + 0.45));
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
})();

/** A small static ferris wheel by the funfair (world). */
export const FERRIS = { x: 10.2, z: 4.7, r: 0.7 };

// ---------------- keep-out areas for decor ----------------

type KeepOut = { kind: "ellipse"; x: number; z: number; rx: number; rz: number } | { kind: "rect"; x: number; z: number; hw: number; hd: number };

const KEEP_OUT: KeepOut[] = (() => {
  const home = zoneCenter("home"), cafe = zoneCenter("maker_space"), pool = zoneCenter("pool"), cin = zoneCenter("cinema");
  return [
    { kind: "ellipse", x: home.x + HOUSE_BODY.x, z: home.z + HOUSE_BODY.z, rx: 0.95, rz: 0.95 },
    { kind: "rect", x: cafe.x + CAFE_BUILDING.x, z: cafe.z + CAFE_BUILDING.z, hw: CAFE_BUILDING.w / 2 + 0.12, hd: CAFE_BUILDING.d / 2 + 0.12 },
    { kind: "rect", x: pool.x + POOL_DECK.x, z: pool.z + POOL_DECK.z, hw: POOL_DECK.w / 2 + 0.05, hd: POOL_DECK.d / 2 + 0.05 },
    // the screen plus its legs and braces, which reach back (+z)
    { kind: "rect", x: cin.x + CINEMA.screen.x, z: cin.z + CINEMA.screen.z + 0.2, hw: CINEMA.screen.w / 2 + 0.25, hd: 0.5 },
    { kind: "ellipse", x: COASTER.cx, z: COASTER.cz, rx: COASTER.rx + 0.4, rz: COASTER.rz + 0.4 },
    { kind: "ellipse", x: FERRIS.x, z: FERRIS.z, rx: FERRIS.r + 0.25, rz: FERRIS.r + 0.25 }
  ];
})();

/** True inside a building or ride that reaches past its pad (house, café, pool deck, screen, coaster, ferris wheel). */
export function inKeepOut(p: Pt, margin: number): boolean {
  for (const k of KEEP_OUT) {
    if (k.kind === "rect") {
      if (Math.abs(p.x - k.x) < k.hw + margin && Math.abs(p.z - k.z) < k.hd + margin) return true;
    } else {
      const ex = (p.x - k.x) / (k.rx + margin), ez = (p.z - k.z) / (k.rz + margin);
      if (ex * ex + ez * ez < 1) return true;
    }
  }
  return false;
}

/** True when a prop of radius `margin` at p stays off roads, the street, pads, spots and big buildings. */
export function decorClear(p: Pt, margin: number): boolean {
  if (!isClear(p, margin)) return false;
  if (streetDist(p) < STREET_W / 2 + margin) return false;
  if (inKeepOut(p, margin)) return false;
  for (const s of SPOTS) if (Math.hypot(p.x - s.x, p.z - s.z) < 0.3 + margin) return false;
  return true;
}

/**
 * Jittered-grid scatter over the inner island (inside the verge). Same seed →
 * same points. `accept(p, r)` gets a per-cell random number in [0,1) to thin
 * the result (e.g. denser far from the street).
 */
export function scatter(seed: number, cell: number, margin: number, accept?: (p: Pt, r: number) => boolean): Pt[] {
  const rand = rng(seed);
  const out: Pt[] = [];
  const lim = VERGE_IN - margin;
  const n = Math.floor((2 * lim) / cell);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const jx = rand(), jz = rand(), r = rand(); // always draw three → stable sequence
      const p = { x: -lim + (i + 0.15 + 0.7 * jx) * cell, z: -lim + (j + 0.15 + 0.7 * jz) * cell };
      if (accept && !accept(p, r)) continue;
      if (decorClear(p, margin)) out.push(p);
    }
  }
  return out;
}

/** Street lamps every ~2 units of street, alternating sides, off pads and side-road mouths. */
export function streetLamps(): Pt[] {
  const out: Pt[] = [];
  const off = STREET_W / 2 + 0.17;
  let side = 1;
  for (let i = 1; i < STREET.length; i++) {
    const a = NODES[STREET[i - 1]], b = NODES[STREET[i]];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    for (let s = 0.4; s < len - 0.3; s += 0.5) {
      for (const sd of [side, -side]) {
        const p = { x: a.x + ux * s - uz * off * sd, z: a.z + uz * s + ux * off * sd };
        if (!lampOk(p, out)) continue;
        out.push(p);
        side = -sd; // next lamp prefers the other side
        break;
      }
    }
  }
  return out;
}

function lampOk(p: Pt, placed: Pt[]): boolean {
  if (streetDist(p) < STREET_W / 2 + 0.1) return false;
  if (sideRoadDist(p) < ROAD_W / 2 + 0.2) return false;
  if (PADS.some((pad) => Math.hypot(p.x - pad.x, p.z - pad.z) < pad.r + 0.3)) return false;
  if (inKeepOut(p, 0.1)) return false;
  if (SPOTS.some((sp) => Math.hypot(p.x - sp.x, p.z - sp.z) < 0.4)) return false;
  return !placed.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 2.3);
}

// ---------------- bikes ----------------

/**
 * Which rack slots still show a bike: `inUse` bikes are out; slots a rider
 * holds (`busy`) go first, the rest are taken from the end of the rack.
 */
export function bikesShown(slots: number, inUse: number, busy: boolean[]): boolean[] {
  const k = Math.max(0, Math.min(slots, Number.isFinite(inUse) ? Math.round(inUse) : 0));
  const shown = Array.from({ length: slots }, () => true);
  let left = k;
  for (let i = 0; i < slots && left > 0; i++) if (busy[i]) { shown[i] = false; left--; }
  for (let i = slots - 1; i >= 0 && left > 0; i--) if (shown[i]) { shown[i] = false; left--; }
  return shown;
}

// ---------------- rollercoaster ----------------

/** A rail beside the closed track centreline: `side` to the left (+) / right (−) of travel, `drop` below it. */
export function railLine(track: Pt3[], side: number, drop: number): Pt3[] {
  const n = track.length;
  return track.map((c, i) => {
    const a = track[(i - 1 + n) % n], b = track[(i + 1) % n];
    const tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    return { x: c.x - (tz / l) * side, y: c.y - drop, z: c.z + (tx / l) * side };
  });
}

/** Support posts under every `every`-th track sample; y is the top of the post (just under the rails). */
export function coasterSupports(track: Pt3[], every: number, drop: number): Pt3[] {
  const out: Pt3[] = [];
  for (let i = 0; i < track.length; i += every) out.push({ x: track[i].x, y: track[i].y - drop - 0.03, z: track[i].z });
  return out;
}

// ---------------- ground dressing ----------------

/** The pool basin (world) — the island slab and the pool deck get a hole here. */
export function poolBasinWorld(): { x: number; z: number; w: number; d: number } {
  const c = zoneCenter("pool");
  return { x: c.x + POOL.x, z: c.z + POOL.z, w: POOL.w, d: POOL.d };
}

function rectClear(x: number, z: number, w: number, d: number, margin: number): boolean {
  const nx = Math.max(2, Math.ceil(w / 0.12)), nz = Math.max(2, Math.ceil(d / 0.12));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      if (!decorClear({ x: x - w / 2 + (w * i) / nx, z: z - d / 2 + (d * j) / nz }, margin)) return false;
    }
  }
  return true;
}

export interface Patch { x: number; z: number; w: number; d: number }

/** Darker lawn blocks between the roads: a coarse grid, each shrunk until it clears everything. */
export function grassPatches(): Patch[] {
  const rand = rng(17);
  const out: Patch[] = [];
  const cell = 2.4;
  const lim = VERGE_IN - 0.2;
  const n = Math.floor((2 * lim) / cell);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -lim + (i + 0.5) * cell + (rand() - 0.5) * 0.2;
      const z = -lim + (j + 0.5) * cell + (rand() - 0.5) * 0.2;
      let w = 1.1 + rand() * 1.0, d = 1.0 + rand() * 1.0;
      const skip = rand() < 0.25;
      if (skip) continue;
      for (let k = 0; k < 10; k++) {
        if (rectClear(x, z, w, d, 0.12)) {
          out.push({ x, z, w: +w.toFixed(2), d: +d.toFixed(2) });
          break;
        }
        w *= 0.85;
        d *= 0.85;
        if (w < 0.5 || d < 0.4) break;
      }
    }
  }
  return out;
}

/** A few park benches beside the street, turned to face it. */
export function streetBenches(): { x: number; z: number; yaw: number }[] {
  const out: { x: number; z: number; yaw: number }[] = [];
  const off = STREET_W / 2 + 0.42;
  let side = -1;
  for (let i = 2; i < STREET.length - 1; i++) {
    const a = NODES[STREET[i - 1]], b = NODES[STREET[i]];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    for (const f of [0.5, 0.3, 0.7]) {
      const placed = [side, -side].some((sd) => {
        const p = { x: a.x + ux * len * f - uz * off * sd, z: a.z + uz * len * f + ux * off * sd };
        if (!decorClear(p, 0.3) || sideRoadDist(p) < ROAD_W / 2 + 0.45) return false;
        if (out.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 2.5)) return false;
        out.push({ ...p, yaw: Math.atan2(uz * sd, -ux * sd) });
        side = -sd;
        return true;
      });
      if (placed) break;
    }
  }
  return out;
}

// ---------------- painted names ----------------

const LABEL_TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];

function labelFree(zone: string, p: Pt): boolean {
  for (const pad of PADS) if (pad.zone !== zone && Math.hypot(p.x - pad.x, p.z - pad.z) < pad.r + 0.45) return false;
  if (zone !== "funfair" && inKeepOut(p, 0.15)) return false;
  return true;
}

/**
 * Where a place's name is painted: at its pad's edge toward the camera, swung
 * around the pad (up to ~100°) when that spot would land on another place.
 * `prefer` is the turn used last frame (index into the swing list) — it is
 * kept while still free so the name doesn't flicker. The name always turns
 * to read upright from the camera.
 */
export function labelSpot(zone: string, center: Pt, radius: number, camera: Pt, prefer: number): { x: number; z: number; yaw: number; turn: number } {
  const dx = camera.x - center.x, dz = camera.z - center.z;
  const base = Math.atan2(dx, dz);
  const r = radius + 0.6;
  const at = (k: number) => {
    const a = base + LABEL_TURNS[k];
    return { x: center.x + Math.sin(a) * r, z: center.z + Math.cos(a) * r };
  };
  let turn = 0;
  if (prefer > 0 && prefer < LABEL_TURNS.length && labelFree(zone, at(prefer)) && !labelFree(zone, at(0))) turn = prefer;
  else turn = LABEL_TURNS.findIndex((_, k) => labelFree(zone, at(k)));
  if (turn < 0) turn = 0;
  const p = at(turn);
  return { ...p, yaw: Math.atan2(camera.x - p.x, camera.z - p.z), turn };
}
