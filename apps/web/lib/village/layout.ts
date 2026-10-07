/**
 * Village layout: the grid → world mapping, the road network, routing, and the
 * seats (activity spots) at each venue. Pure data + math — no three.js, so the
 * simulation can be tested and the scene and the sim always agree on positions.
 */
import { DEFAULT_ZONES } from "@aivillage/shared";

export interface Pt { x: number; z: number; }

// ---- grid mapping: tile (col,row) -> world (x,z). One tile = 1 unit. ----
export const GRID_MIN = -2;
export const GRID_MAX = 9;
const CX = 3.5;
const CZ = 3.5;
export const gx = (col: number) => col - CX;
export const gz = (row: number) => row - CZ;
export const tileToWorld = (col: number, row: number): Pt => ({ x: gx(col), z: gz(row) });
/** Half-size of the walkable island in world units. */
export const ISLAND_HALF = (GRID_MAX - GRID_MIN + 1) / 2;

export function zoneCenter(zone: string): Pt {
  const z = DEFAULT_ZONES.find((zz) => zz.name === zone) ?? DEFAULT_ZONES[0];
  return tileToWorld(z.col, z.row);
}

// ---------------- road network ----------------

/** Waypoints: the four venues, the plaza, connector bends and a scenic ring. */
export const NODES: Record<string, Pt> = {
  C:     { x: -0.5, z: -0.5 }, // THE STAGE (plaza)
  CAFE:  { x: -3.5, z: 1.5 },
  QUIET: { x: 2.5,  z: -3.5 },
  LAWN:  { x: 2.5,  z: 2.5 },
  M1:    { x: -2.0, z: 0.6 },
  M2:    { x: 0.9,  z: -2.0 },
  M3:    { x: 0.9,  z: 1.4 },
  R2:    { x: -0.8, z: 3.0 },
  R3:    { x: 3.4,  z: -0.6 },
  R4:    { x: -1.4, z: -3.0 }
};

export const EDGES: [string, string][] = [
  ["C", "M1"], ["M1", "CAFE"],
  ["C", "M2"], ["M2", "QUIET"],
  ["C", "M3"], ["M3", "LAWN"],
  ["CAFE", "R2"], ["R2", "LAWN"],
  ["QUIET", "R3"], ["R3", "LAWN"],
  ["CAFE", "R4"], ["R4", "QUIET"]
];

export const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

const NEIGHBORS: Record<string, string[]> = {};
for (const [a, b] of EDGES) {
  (NEIGHBORS[a] ??= []).push(b);
  (NEIGHBORS[b] ??= []).push(a);
}

function nearestNode(p: Pt): string {
  let best = "C";
  let bd = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = dist2(p, n);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/** Dijkstra over the tiny waypoint graph. */
function nodePath(fromId: string, toId: string): string[] {
  if (fromId === toId) return [fromId];
  const distm: Record<string, number> = { [fromId]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set(Object.keys(NODES));
  while (open.size > 0) {
    let cur: string | null = null;
    let cd = Infinity;
    for (const id of open) {
      const d = distm[id];
      if (d !== undefined && d < cd) { cd = d; cur = id; }
    }
    if (!cur) break;
    open.delete(cur);
    if (cur === toId) break;
    for (const nb of NEIGHBORS[cur] ?? []) {
      if (!open.has(nb)) continue;
      const nd = cd + Math.sqrt(dist2(NODES[cur], NODES[nb]));
      if (distm[nb] === undefined || nd < distm[nb]) {
        distm[nb] = nd;
        prev[nb] = cur;
      }
    }
  }
  const out: string[] = [];
  let c: string | undefined = toId;
  while (c) { out.unshift(c); c = prev[c]; }
  return out[0] === fromId ? out : [fromId, toId];
}

/** Route from an arbitrary point to another, walking the roads in between. */
export function findRoute(from: Pt, to: Pt): Pt[] {
  if (dist2(from, to) < 2.6) return [to]; // short hops go direct
  const ids = nodePath(nearestNode(from), nearestNode(to));
  const pts = ids.map((id) => NODES[id]);
  // drop a leading waypoint that would make us walk backwards
  if (pts.length > 1 && dist2(from, pts[1]) < dist2(from, pts[0])) pts.shift();
  const route = [...pts, to];
  // drop a final waypoint that overshoots the destination
  if (route.length > 1 && dist2(route[route.length - 2], to) < 0.09) route.splice(route.length - 2, 1);
  return route;
}

// ---------------- venue layout + seats ----------------

export type ActivityKind = "coffee" | "bench" | "blanket" | "stage";

export interface SpotDef {
  id: string;
  zone: string;
  kind: ActivityKind;
  x: number;
  z: number;
  /** facing while doing the activity (radians, three.js Y rotation) */
  yaw: number;
}

/** Café tables, relative to THE CAFÉ's centre (kept off the three café roads). One seat per table. */
export const CAFE_TABLES: Pt[] = [{ x: -0.9, z: 0.45 }, { x: 0.05, z: 1.1 }];
/** Bench at QUIET CORNER (relative), south of the junction so no road runs through it; seats along it. */
export const BENCH = { x: 0.1, z: -0.75, width: 0.85 };
/** Picnic blanket at THE LAWN (relative). */
export const BLANKET = { x: 0, z: 0, w: 0.85, d: 0.65 };
/** Stage platform at THE STAGE (relative). */
export const STAGE_PLATFORM = { x: 0, z: 0, radius: 1.05 };

function buildSpots(): SpotDef[] {
  const out: SpotDef[] = [];
  const at = (zone: string, rel: Pt) => {
    const c = zoneCenter(zone);
    return { x: c.x + rel.x, z: c.z + rel.z };
  };
  CAFE_TABLES.forEach((t, i) => {
    const p = at("maker_space", { x: t.x + 0.42, z: t.z + 0.3 });
    out.push({ id: `cafe-${i}`, zone: "maker_space", kind: "coffee", ...p, yaw: Math.atan2(-0.42, -0.3) });
  });
  out.push({ id: "stage-0", zone: "plaza", kind: "stage", ...at("plaza", { x: 0, z: 0.25 }), yaw: Math.PI * 0.25 });
  out.push({ id: "lawn-0", zone: "event_space", kind: "blanket", ...at("event_space", { x: -0.22, z: 0.14 }), yaw: Math.PI / 2 });
  out.push({ id: "lawn-1", zone: "event_space", kind: "blanket", ...at("event_space", { x: 0.26, z: -0.12 }), yaw: -Math.PI / 2 });
  out.push({ id: "bench-0", zone: "network_hub", kind: "bench", ...at("network_hub", { x: BENCH.x - 0.22, z: BENCH.z + 0.06 }), yaw: 0 });
  out.push({ id: "bench-1", zone: "network_hub", kind: "bench", ...at("network_hub", { x: BENCH.x + 0.23, z: BENCH.z + 0.06 }), yaw: 0 });
  return out;
}

export const SPOTS: SpotDef[] = buildSpots();

/** The venue nearest to a tile (where a twin "is" for the HUD). */
export function zoneOfTile(col: number, row: number): string {
  let best = DEFAULT_ZONES[0];
  let bd = Infinity;
  for (const z of DEFAULT_ZONES) {
    const d = (z.col - col) ** 2 + (z.row - row) ** 2;
    if (d < bd) { bd = d; best = z; }
  }
  return best.name;
}
