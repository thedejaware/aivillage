import { describe, it, expect } from "vitest";
import { DEFAULT_ZONES } from "@aivillage/shared";
import { findRoute, NODES, EDGES, SPOTS, zoneCenter, tileToWorld, CAFE_TABLES, zoneOfTile, BENCH } from "../../lib/village/layout";

const onSomeEdge = (p: { x: number; z: number }) =>
  Object.values(NODES).some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 1e-9);

describe("tileToWorld / zoneCenter", () => {
  it("maps the grid so the island is centred on the origin", () => {
    expect(tileToWorld(3.5, 3.5)).toEqual({ x: 0, z: 0 });
    expect(zoneCenter("plaza")).toEqual({ x: -0.5, z: -0.5 });
  });
  it("falls back to the first zone for unknown names", () => {
    expect(zoneCenter("narnia")).toEqual(zoneCenter(DEFAULT_ZONES[0].name));
  });
});

describe("findRoute", () => {
  it("short hops go straight to the destination", () => {
    expect(findRoute({ x: 0, z: 0 }, { x: 0.5, z: 0.5 })).toEqual([{ x: 0.5, z: 0.5 }]);
  });
  it("long trips follow road waypoints and end at the destination", () => {
    const to = { x: 2.6, z: 2.6 };
    const route = findRoute(NODES.CAFE, to);
    expect(route[route.length - 1]).toEqual(to);
    expect(route.length).toBeGreaterThan(2);
    for (const p of route.slice(0, -1)) expect(onSomeEdge(p)).toBe(true);
  });
  it("every road edge connects two known waypoints", () => {
    for (const [a, b] of EDGES) {
      expect(NODES[a]).toBeDefined();
      expect(NODES[b]).toBeDefined();
    }
  });
});

describe("SPOTS", () => {
  it("every venue has at least one seat", () => {
    for (const z of DEFAULT_ZONES) expect(SPOTS.some((s) => s.zone === z.name)).toBe(true);
  });
  it("seats sit close to their venue", () => {
    for (const s of SPOTS) {
      const c = zoneCenter(s.zone);
      expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeLessThan(1.6);
    }
  });
  it("one café seat per table", () => {
    expect(SPOTS.filter((s) => s.kind === "coffee").length).toBe(CAFE_TABLES.length);
  });
  it("spot ids are unique", () => {
    expect(new Set(SPOTS.map((s) => s.id)).size).toBe(SPOTS.length);
  });
});

describe("zoneOfTile", () => {
  it("returns the nearest venue to a tile", () => {
    expect(zoneOfTile(0, 5)).toBe("maker_space");
    expect(zoneOfTile(6.4, 5.6)).toBe("event_space");
    expect(zoneOfTile(3, 3)).toBe("plaza");
  });
});

describe("seats stay off the roads", () => {
  /** distance from p to the segment a–b */
  const segDist = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
  };
  const roadDist = (p: { x: number; z: number }) => Math.min(...EDGES.map(([a, b]) => segDist(p, NODES[a], NODES[b])));
  // venue centres are road junctions; ignore the first 0.6 units of each road (covered by the venue pad)
  const nearVenueCentre = (p: { x: number; z: number }) =>
    DEFAULT_ZONES.some((z) => Math.hypot(p.x - zoneCenter(z.name).x, p.z - zoneCenter(z.name).z) < 0.6);

  it("no seat is on a road", () => {
    for (const s of SPOTS) if (!nearVenueCentre(s)) expect(roadDist(s), s.id).toBeGreaterThan(0.4);
  });
  it("no café table is on a road", () => {
    const c = zoneCenter("maker_space");
    for (const t of CAFE_TABLES) expect(roadDist({ x: c.x + t.x, z: c.z + t.z })).toBeGreaterThan(0.45);
  });
  it("the bench is off the roads", () => {
    const c = zoneCenter("network_hub");
    for (const dx of [-BENCH.width / 2, 0, BENCH.width / 2]) {
      expect(roadDist({ x: c.x + BENCH.x + dx, z: c.z + BENCH.z })).toBeGreaterThan(0.35);
    }
  });
});
