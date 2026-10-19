/**
 * Village layout (Main Street map, LAYOUT_VERSION 2): the grid → world mapping,
 * the road network, routing, every place's spots, the rollercoaster track and
 * the bike route. Pure data + math — no three.js — so the simulation and the
 * scene always agree on positions, and tests can drive them.
 *
 * One winding street runs from the house (west) to the rollercoaster (east);
 * every place hangs off it on a short branch.
 */
import { DEFAULT_ZONES } from "@aivillage/shared";

export interface Pt { x: number; z: number; }
export interface Pt3 { x: number; y: number; z: number; }

// ---- grid mapping: tile (col,row) -> world (x,z). One tile = 1 unit. ----
export const GRID_MIN = -8;
export const GRID_MAX = 15;
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

const C = (zone: string) => zoneCenter(zone);

/** Waypoints: every place's centre, the street spine S0…S7, and the coaster station. */
export const NODES: Record<string, Pt> = {
  STAGE: C("plaza"),
  HOME: C("home"),
  QUIET: C("network_hub"),
  BIKES: C("bike_rack"),
  CAFE: C("maker_space"),
  GARDEN: C("garden"),
  GYM: C("gym"),
  LAWN: C("event_space"),
  POOL: C("pool"),
  CINEMA: C("cinema"),
  KITCHEN: C("kitchen"),
  LIBRARY: C("library"),
  FUN: { x: 8.2, z: 0.9 }, // the coaster station gate (the funfair centre is under the track)
  S0: { x: -7.4, z: 0.4 }, // clear of the (bigger) house pad
  S1: { x: -6.6, z: -1.4 },
  S2: { x: -4.5, z: -0.5 },
  S3: { x: -2.0, z: 1.5 },
  S4: { x: 0.5, z: 0.5 },
  S5: { x: 3.0, z: -1.0 },
  S6: { x: 5.5, z: 0.5 },
  S7: { x: 7.5, z: 1.0 }
};

/** The main street (spine) in order, west → east. */
export const STREET: string[] = ["HOME", "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "FUN"];

export const EDGES: [string, string][] = [
  ...STREET.slice(1).map((id, i) => [STREET[i], id] as [string, string]),
  ["QUIET", "S1"], ["BIKES", "S0"], ["CAFE", "S2"], ["GARDEN", "S3"], ["STAGE", "S4"],
  ["GYM", "S5"], ["LAWN", "S6"], ["POOL", "S7"], ["CINEMA", "S7"],
  ["KITCHEN", "S2"], ["LIBRARY", "QUIET"] // the library is reached through the quiet corner
];

export const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

const NEIGHBORS: Record<string, string[]> = {};
for (const [a, b] of EDGES) {
  (NEIGHBORS[a] ??= []).push(b);
  (NEIGHBORS[b] ??= []).push(a);
}

function nearestNode(p: Pt): string {
  let best = "STAGE";
  let bd = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = dist2(p, n);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/** Dijkstra over the waypoint graph. */
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

// ---------------- places: layout of each one (relative to its centre) ----------------

export type ActivityKind =
  | "coffee" | "bench" | "blanket" | "stage" | "bed" | "treadmill" | "weights"
  | "swim" | "lounger" | "cinema" | "plot" | "coaster" | "bike"
  | "counter" | "stove" | "table" | "armchair" | "desk";

export interface SpotDef {
  id: string;
  zone: string;
  kind: ActivityKind;
  x: number;
  z: number;
  /** facing while doing the activity (radians, three.js Y rotation; 0 = +z) */
  yaw: number;
}

/** Café tables (relative to THE CAFÉ's centre); two seats per table, facing each other along x. */
export const CAFE_TABLES: Pt[] = [{ x: -1.4, z: 0.45 }, { x: -0.5, z: 1.25 }, { x: 0.5, z: 1.25 }, { x: 1.4, z: 0.45 }];
export const CAFE_SEAT_OFFSET = 0.32;
/** Bench at QUIET CORNER (relative), east of the path that runs through it (street ↔ library); two seats along it. */
export const BENCH = { x: 0.75, z: -0.1, width: 0.85 };
/** Picnic blanket at THE LAWN (relative). */
export const BLANKET = { x: -0.18, z: 0.21, w: 0.85, d: 0.65 };
/** Stage platform at THE STAGE (relative). */
export const STAGE_PLATFORM = { x: 0, z: 0, radius: 1.05 };
/** The shared house (relative): body footprint and the door, which faces the street. */
export const HOUSE = { x: -0.25, z: -0.2, w: 1.5, d: 1.2, door: { x: 0.9, z: 0.42 } };
/** Bike rack slots (relative), bikes point north to the street. */
export const BIKE_SLOTS: Pt[] = [{ x: -0.6, z: 0.45 }, { x: -0.2, z: 0.45 }, { x: 0.2, z: 0.45 }, { x: 0.6, z: 0.45 }];
/** Hobby garden plots (relative); the gardener stands 0.4 in front (−z) facing the plot. */
export const GARDEN_PLOTS: Pt[] = [{ x: -0.75, z: 0.55 }, { x: 0, z: 0.85 }, { x: 0.75, z: 0.55 }];
/** Gym stations (relative): two treadmills and three weight spots, facing the street (+z). */
export const GYM_STATIONS: { kind: "treadmill" | "weights"; x: number; z: number }[] = [
  { kind: "treadmill", x: -1.3, z: -0.4 },
  { kind: "treadmill", x: -0.55, z: -0.95 },
  { kind: "weights", x: 0.3, z: -1.05 },
  { kind: "weights", x: 1.1, z: -0.65 },
  { kind: "weights", x: 1.35, z: 0.25 }
];
/** Pool basin (relative): 4 lanes along z; swimmers go from `swimFrom` to `swimTo` and back.
 *  Eight sun loungers in a row on the street side, clear of the path in the middle (x = 0). */
export const POOL = {
  x: 0, z: -1.5, w: 3.8, d: 2.8,
  lanes: [-1.35, -0.45, 0.45, 1.35],
  swimFrom: -0.45, swimTo: -2.6,
  loungers: [-2.7, -2.05, -1.4, -0.75, 0.75, 1.4, 2.05, 2.7].map((x) => ({ x, z: 1.0 })) as Pt[]
};
/** Open-air cinema (relative): the screen faces the seats (−z); 2 rows of 5 seats face +z. */
export const CINEMA = {
  screen: { x: 0, z: 2.0, w: 3.0, h: 1.6 },
  rows: [0.95, 0.3],
  seatsX: [-1.3, -0.65, 0, 0.65, 1.3]
};

/**
 * The open-air kitchen (relative; its path comes in from +z). Four cooking
 * stations across the back: a twin preps at the island (standing at `prepZ`,
 * facing −z), then turns to the burner behind it (standing at `stoveZ`).
 * The long table runs along z on the east side; the oven stands on the west.
 */
export const KITCHEN = {
  stations: [-1.1, -0.4, 0.4, 1.1],
  island: { x: 0, z: -0.85, w: 2.9, d: 0.4 },
  range: { x: 0, z: -1.8, w: 2.7, d: 0.4 },
  prepZ: -0.45,
  stoveZ: -1.42,
  table: { x: 1.2, z: 0.9, w: 0.5, d: 1.7 },
  seatsZ: [0.3, 0.7, 1.1, 1.5],
  seatOffset: 0.38,
  oven: { x: -1.6, z: 0.15 }
};

/**
 * The library pavilion (relative; its path comes in from +z): shelves across
 * the back, armchairs on the west facing the middle, desks on the east (the
 * twin sits at `seatX` facing +x, the desk is at `x`).
 */
export const LIBRARY = {
  shelves: [{ x: -0.75, z: -1.4, w: 1.1 }, { x: 0.55, z: -1.4, w: 1.1 }],
  armchairs: [{ x: -1.25, z: -0.75 }, { x: -0.55, z: -0.95 }, { x: -1.35, z: 0.1 }, { x: -0.8, z: 0.6 }] as Pt[],
  desks: [-0.9, -0.3, 0.3, 0.9].map((z) => ({ x: 1.2, z, seatX: 0.85 }))
};

const rel = (zone: string, p: Pt): Pt => {
  const c = zoneCenter(zone);
  return { x: c.x + p.x, z: c.z + p.z };
};

function buildSpots(): SpotDef[] {
  const out: SpotDef[] = [];
  const add = (id: string, zone: string, kind: ActivityKind, p: Pt, yaw: number) => out.push({ id, zone, kind, ...rel(zone, p), yaw });

  add("house-door", "home", "bed", HOUSE.door, Math.atan2(-HOUSE.door.x, -HOUSE.door.z));
  add("bench-0", "network_hub", "bench", { x: BENCH.x - 0.22, z: BENCH.z + 0.06 }, 0);
  add("bench-1", "network_hub", "bench", { x: BENCH.x + 0.23, z: BENCH.z + 0.06 }, 0);
  BIKE_SLOTS.forEach((p, i) => add(`bike-${i}`, "bike_rack", "bike", p, Math.PI));
  CAFE_TABLES.forEach((t, i) => {
    add(`cafe-${i}a`, "maker_space", "coffee", { x: t.x - CAFE_SEAT_OFFSET, z: t.z }, Math.PI / 2);
    add(`cafe-${i}b`, "maker_space", "coffee", { x: t.x + CAFE_SEAT_OFFSET, z: t.z }, -Math.PI / 2);
  });
  GARDEN_PLOTS.forEach((p, i) => add(`plot-${i}`, "garden", "plot", { x: p.x, z: p.z - 0.4 }, 0));
  add("stage-0", "plaza", "stage", { x: 0, z: -0.2 }, 0);
  GYM_STATIONS.forEach((s, i) => add(`gym-${i}`, "gym", s.kind, s, 0));
  POOL.lanes.forEach((x, i) => add(`lane-${i}`, "pool", "swim", { x, z: POOL.swimFrom }, Math.PI));
  POOL.loungers.forEach((p, i) => add(`lounger-${i}`, "pool", "lounger", p, 0));
  add("lawn-0", "event_space", "blanket", { x: BLANKET.x - 0.24, z: BLANKET.z + 0.13 }, Math.PI / 2);
  add("lawn-1", "event_space", "blanket", { x: BLANKET.x + 0.24, z: BLANKET.z - 0.13 }, -Math.PI / 2);
  add("lawn-2", "event_space", "blanket", { x: -0.7, z: -0.45 }, Math.PI * 0.25);
  add("lawn-3", "event_space", "blanket", { x: 0.45, z: 0.75 }, -Math.PI * 0.75);
  CINEMA.rows.forEach((z, r) => CINEMA.seatsX.forEach((x, i) => add(`cinema-${r}${i}`, "cinema", "cinema", { x, z }, 0)));
  COASTER_QUEUE.forEach((p, i) => out.push({ id: `queue-${i}`, zone: "funfair", kind: "coaster", ...p, yaw: Math.PI / 2 }));
  KITCHEN.stations.forEach((x, i) => {
    add(`counter-${i}`, "kitchen", "counter", { x, z: KITCHEN.prepZ }, Math.PI);
    add(`stove-${i}`, "kitchen", "stove", { x, z: KITCHEN.stoveZ }, Math.PI);
  });
  KITCHEN.seatsZ.forEach((z, i) => {
    add(`table-${i}a`, "kitchen", "table", { x: KITCHEN.table.x - KITCHEN.seatOffset, z }, Math.PI / 2);
    add(`table-${i}b`, "kitchen", "table", { x: KITCHEN.table.x + KITCHEN.seatOffset, z }, -Math.PI / 2);
  });
  LIBRARY.armchairs.forEach((p, i) => add(`armchair-${i}`, "library", "armchair", p, Math.atan2(-p.x, -p.z)));
  LIBRARY.desks.forEach((d, i) => add(`desk-${i}`, "library", "desk", { x: d.seatX, z: d.z }, Math.PI / 2));
  return out;
}

// ---------------- rollercoaster ----------------

/** Track oval (world): centre, radii; t = 0 is the station on the west side. */
export const COASTER = { cx: 9.95, cz: 0.3, rx: 1.4, rz: 3.0, base: 0.35 };
/** One ride, in seconds. */
export const COASTER_RIDE_SECONDS = 40;
/** The big drop, as track fractions [start, end] — riders throw their arms up here. */
export const COASTER_DROP: [number, number] = [0.3, 0.42];
/** Seats in the cart (cart-local: x = sideways, z = along the track). */
export const COASTER_SEATS: Pt[] = [{ x: -0.12, z: 0.1 }, { x: 0.12, z: 0.1 }, { x: -0.12, z: -0.24 }, { x: 0.12, z: -0.24 }];
/** Where riders wait for the cart (world). */
/** (east of the pool road, which runs north from S7 at x = 7.5) */
export const COASTER_QUEUE: Pt[] = [{ x: 8.2, z: -0.2 }, { x: 8.2, z: -0.65 }, { x: 7.95, z: -1.05 }, { x: 8.25, z: -1.15 }];

/** Where the 4 riders step off after a ride (world): beside the gate, west of the rails. */
export const COASTER_EXITS: Pt[] = [{ x: 7.8, z: 1.3 }, { x: 8.1, z: 1.3 }, { x: 7.8, z: 1.6 }, { x: 8.1, z: 1.6 }];

/** Track height keyframes (t, y): flat station, lift hill, big drop, a small bump, back home. */
const HEIGHT_KEYS: [number, number][] = [
  [0, 0.35], [0.08, 0.35], [0.3, 1.35], [0.42, 0.4], [0.55, 0.4], [0.65, 0.8], [0.78, 0.45], [0.92, 0.35], [1, 0.35]
];

function trackHeight(t: number): number {
  const u = ((t % 1) + 1) % 1;
  for (let i = 1; i < HEIGHT_KEYS.length; i++) {
    const [t1, y1] = HEIGHT_KEYS[i];
    const [t0, y0] = HEIGHT_KEYS[i - 1];
    if (u <= t1) {
      const k = (u - t0) / (t1 - t0);
      return y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos(Math.PI * k)); // eased
    }
  }
  return HEIGHT_KEYS[0][1];
}

function trackPoint(t: number): Pt3 {
  const th = 2 * Math.PI * t;
  return { x: COASTER.cx - COASTER.rx * Math.cos(th), y: trackHeight(t), z: COASTER.cz + COASTER.rz * Math.sin(th) };
}

/** The cart's pose at track fraction t ∈ [0,1): position, heading (yaw) and slope (pitch, + = nose up). */
export function coasterPose(t: number): { x: number; y: number; z: number; yaw: number; pitch: number } {
  const p = trackPoint(t);
  const q = trackPoint(t + 0.002);
  const dx = q.x - p.x, dz = q.z - p.z, dy = q.y - p.y;
  return { ...p, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Sampled track centreline (world), for drawing rails and supports. */
export const COASTER_TRACK: Pt3[] = Array.from({ length: 96 }, (_, i) => trackPoint(i / 96));

// ---------------- bikes ----------------

/** A bike ride: out of the rack, along the street to its east end and back to the rack. */
export const BIKE_ROUTE: Pt[] = (() => {
  const exit = rel("bike_rack", { x: 0, z: -0.6 });
  const spine = ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7"].map((id) => NODES[id]);
  return [exit, ...spine, ...spine.slice(0, -1).reverse(), exit];
})();

// ---------------- spots ----------------

export const SPOTS: SpotDef[] = buildSpots();

export function spotsFor(zone: string): SpotDef[] {
  return SPOTS.filter((s) => s.zone === zone);
}

/** The place nearest to a tile (where a twin "is" for the HUD). */
export function zoneOfTile(col: number, row: number): string {
  let best = DEFAULT_ZONES[0];
  let bd = Infinity;
  for (const z of DEFAULT_ZONES) {
    const d = (z.col - col) ** 2 + (z.row - row) ** 2;
    if (d < bd) { bd = d; best = z; }
  }
  return best.name;
}
