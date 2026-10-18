import { describe, it, expect } from "vitest";
import { DEFAULT_ZONES, PLACES, placeOf } from "@aivillage/shared";
import {
  findRoute, NODES, EDGES, SPOTS, zoneCenter, tileToWorld, zoneOfTile, ISLAND_HALF, GRID_MIN, GRID_MAX,
  COASTER_TRACK, coasterPose, COASTER_QUEUE, COASTER_EXITS, BIKE_ROUTE, spotsFor, type Pt
} from "../../lib/village/layout";
import { PAD_RADIUS, SEAT_Y } from "../../components/village/scenery";
import { WALK_SPEED } from "../../lib/village/sim";

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
};
const roadDist = (p: Pt) => Math.min(...EDGES.map(([a, b]) => segDist(p, NODES[a], NODES[b])));
const routeLength = (from: Pt, route: Pt[]) => {
  let len = 0;
  let cur = from;
  for (const p of route) { len += Math.hypot(p.x - cur.x, p.z - cur.z); cur = p; }
  return len;
};

describe("the Main Street map", () => {
  it("is about 4× today's island (24 × 24 tiles)", () => {
    expect([GRID_MIN, GRID_MAX, ISLAND_HALF]).toEqual([-8, 15, 12]);
    expect(tileToWorld(3.5, 3.5)).toEqual({ x: 0, z: 0 });
  });

  it("every place sits inside the island, its pad clear of the edge", () => {
    for (const z of DEFAULT_ZONES) {
      const c = zoneCenter(z.name);
      const r = PAD_RADIUS[z.name];
      expect(r, z.name).toBeGreaterThan(0);
      expect(Math.max(Math.abs(c.x), Math.abs(c.z)) + r, z.name).toBeLessThanOrEqual(ISLAND_HALF - 0.4);
    }
  });

  it("no two place pads overlap", () => {
    for (const a of DEFAULT_ZONES) for (const b of DEFAULT_ZONES) {
      if (a.name >= b.name) continue;
      const d = Math.hypot(zoneCenter(a.name).x - zoneCenter(b.name).x, zoneCenter(a.name).z - zoneCenter(b.name).z);
      expect(d, `${a.name}/${b.name}`).toBeGreaterThan(PAD_RADIUS[a.name] + PAD_RADIUS[b.name]);
    }
  });

  it("every place is reachable from the house along the roads", () => {
    for (const z of DEFAULT_ZONES) {
      const route = findRoute(zoneCenter("home"), zoneCenter(z.name));
      expect(route[route.length - 1], z.name).toEqual(zoneCenter(z.name));
    }
  });

  it("walking the whole street (house → rollercoaster) takes under 45 s", () => {
    const from = zoneCenter("home");
    const seconds = routeLength(from, findRoute(from, zoneCenter("funfair"))) / WALK_SPEED;
    expect(seconds).toBeLessThan(45);
  });

  it("every road edge connects two known waypoints", () => {
    for (const [a, b] of EDGES) {
      expect(NODES[a], a).toBeDefined();
      expect(NODES[b], b).toBeDefined();
    }
  });

  it("the big places are bigger (Main Street v3)", () => {
    expect(PAD_RADIUS.pool).toBeGreaterThanOrEqual(2.9);
    expect(PAD_RADIUS.gym).toBeGreaterThanOrEqual(1.9);
    expect(PAD_RADIUS.cinema).toBeGreaterThanOrEqual(2.2);
    expect(PAD_RADIUS.maker_space).toBeGreaterThanOrEqual(2.1);
  });

  it("zoneOfTile returns the nearest place", () => {
    for (const z of DEFAULT_ZONES) expect(zoneOfTile(z.col, z.row)).toBe(z.name);
  });
});

describe("spots", () => {
  it("each place has as many spots as it has room (the house shares one door)", () => {
    for (const p of PLACES) {
      const n = spotsFor(p.zone).length;
      if (p.zone === "home") expect(n).toBe(1);
      else expect(n, p.zone).toBe(p.capacity);
    }
  });

  it("spot ids are unique and every spot kind has a seat height", () => {
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length);
    for (const s of SPOTS) expect(SEAT_Y[s.kind], s.kind).toBeDefined();
  });

  it("spots stay near their place and off the roads (except the house door)", () => {
    for (const s of SPOTS) {
      const c = zoneCenter(s.zone);
      expect(Math.hypot(s.x - c.x, s.z - c.z), s.id).toBeLessThan(PAD_RADIUS[s.zone] + 0.2);
      const nearCentre = Math.hypot(s.x - c.x, s.z - c.z) < 0.6;
      if (s.kind !== "bed" && !nearCentre) expect(roadDist(s), s.id).toBeGreaterThan(0.38);
    }
  });

  it("the café has 4 tables with 2 seats facing each other", () => {
    const seats = spotsFor("maker_space");
    expect(seats.every((s) => s.kind === "coffee")).toBe(true);
    expect(seats).toHaveLength(8);
  });

  it("the pool has 4 lanes and 8 sun loungers", () => {
    const kinds = spotsFor("pool").map((s) => s.kind);
    expect(kinds.filter((k) => k === "swim")).toHaveLength(4);
    expect(kinds.filter((k) => k === "lounger")).toHaveLength(8);
  });

  it("the gym has 2 treadmills and 3 weight spots", () => {
    const kinds = spotsFor("gym").map((s) => s.kind);
    expect(kinds.filter((k) => k === "treadmill")).toHaveLength(2);
    expect(kinds.filter((k) => k === "weights")).toHaveLength(3);
  });

  it("the cinema seats 10", () => {
    expect(spotsFor("cinema")).toHaveLength(10);
  });

  it("no two spots are closer than a twin's width", () => {
    for (const a of SPOTS) for (const b of SPOTS) {
      if (a.id >= b.id) continue;
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id}/${b.id}`).toBeGreaterThan(0.3);
    }
  });

  it("place spot kinds", () => {
    const kinds = (z: string) => [...new Set(spotsFor(z).map((s) => s.kind))].sort();
    expect(kinds("gym")).toEqual(["treadmill", "weights"]);
    expect(kinds("pool")).toEqual(["lounger", "swim"]);
    expect(kinds("cinema")).toEqual(["cinema"]);
    expect(kinds("garden")).toEqual(["plot"]);
    expect(kinds("bike_rack")).toEqual(["bike"]);
    expect(kinds("funfair")).toEqual(["coaster"]);
    expect(placeOf("pool")!.capacity).toBe(spotsFor("pool").length);
  });
});

describe("rollercoaster", () => {
  it("the track is a closed loop with one high hill and a drop", () => {
    expect(COASTER_TRACK.length).toBeGreaterThan(40);
    const ys = COASTER_TRACK.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...ys)).toBeGreaterThan(1.0);
  });

  it("coasterPose is smooth and loops back to the start", () => {
    let prev = coasterPose(0);
    for (let i = 1; i <= 200; i++) {
      const p = coasterPose(i / 200);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z)).toBeLessThan(0.3);
      prev = p;
    }
    const a = coasterPose(0);
    const b = coasterPose(0.99999);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.05);
  });

  it("the track is bigger than the first one (rx 1.15, rz 2.2)", () => {
    const xs = COASTER_TRACK.map((p) => p.x), zs = COASTER_TRACK.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2.7);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(5.8);
  });

  it("the track stays on the island", () => {
    for (const p of COASTER_TRACK) expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(ISLAND_HALF - 0.6);
  });

  it("riders get off beside the gate, clear of the rails and of each other", () => {
    expect(COASTER_EXITS).toHaveLength(4);
    for (const e of COASTER_EXITS) {
      const rail = Math.min(...COASTER_TRACK.map((p) => Math.hypot(p.x - e.x, p.z - e.z)));
      expect(rail).toBeGreaterThan(0.45);
      expect(Math.hypot(e.x - NODES.FUN.x, e.z - NODES.FUN.z)).toBeLessThan(1);
    }
    for (const a of COASTER_EXITS) for (const b of COASTER_EXITS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.25);
  });

  it("riders queue next to the station", () => {
    expect(COASTER_QUEUE).toHaveLength(4);
    const station = coasterPose(0);
    for (const q of COASTER_QUEUE) expect(Math.hypot(q.x - station.x, q.z - station.z)).toBeLessThan(1.6);
  });
});

describe("bike route", () => {
  it("rides along the street and comes back to the rack", () => {
    expect(BIKE_ROUTE.length).toBeGreaterThan(8);
    const first = BIKE_ROUTE[0];
    const last = BIKE_ROUTE[BIKE_ROUTE.length - 1];
    expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeLessThan(0.01);
    const far = Math.max(...BIKE_ROUTE.map((p) => p.x));
    expect(far).toBeGreaterThan(5); // reaches the east end of the street
  });
});
