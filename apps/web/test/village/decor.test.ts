import { describe, it, expect } from "vitest";
import {
  EDGES, NODES, SPOTS, STREET, COASTER_TRACK, CAFE_TABLES, POOL, zoneCenter, ISLAND_HALF, type Pt
} from "../../lib/village/layout";
import { PADS, PAD_RADIUS, ROAD_W } from "../../components/village/scenery";
import {
  STREET_W, BIKE_LANE, streetDist, isStreetEdge, HOUSE_BODY, CAFE_BUILDING, POOL_DECK, FERRIS, decorClear, scatter,
  streetLamps, bikesShown, railLine, coasterSupports, houseDoorWorld
} from "../../components/village/decor";

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });

/** Point in a building's local frame (x sideways, z = front) given its centre and yaw. */
function toLocal(p: Pt, c: { x: number; z: number; yaw: number }): Pt {
  const dx = p.x - c.x, dz = p.z - c.z;
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  return { x: dx * co - dz * s, z: dx * s + dz * co };
}

describe("street", () => {
  it("is wider than a side road and carries a bike lane inside its width", () => {
    expect(STREET_W).toBeGreaterThan(ROAD_W);
    expect(BIKE_LANE.offset + BIKE_LANE.width / 2).toBeLessThan(STREET_W / 2);
    expect(BIKE_LANE.offset - BIKE_LANE.width / 2).toBeGreaterThan(0);
  });

  it("knows which edges are the main street", () => {
    expect(isStreetEdge(STREET[0], STREET[1])).toBe(true);
    expect(isStreetEdge(STREET[2], STREET[1])).toBe(true);
    expect(isStreetEdge("CAFE", "S2")).toBe(false);
  });

  it("streetDist is zero on the street and grows away from it", () => {
    const a = NODES[STREET[3]], b = NODES[STREET[4]];
    expect(streetDist(lerp(a, b, 0.5))).toBeCloseTo(0, 6);
    expect(streetDist({ x: 0, z: -11 })).toBeGreaterThan(5);
  });
});

describe("buildings that stick out of their pads", () => {
  it("the house faces its door; the door spot is on the doorstep", () => {
    const door = SPOTS.find((s) => s.id === "house-door")!;
    const home = zoneCenter("home");
    const body = { x: home.x + HOUSE_BODY.x, z: home.z + HOUSE_BODY.z, yaw: HOUSE_BODY.yaw };
    const l = toLocal(door, body);
    expect(Math.abs(l.x)).toBeLessThan(0.15);
    const step = l.z - HOUSE_BODY.d / 2;
    expect(step).toBeGreaterThan(0.05);
    expect(step).toBeLessThan(0.35);
    expect(houseDoorWorld().x).toBeCloseTo(home.x + HOUSE_BODY.x + Math.sin(HOUSE_BODY.yaw) * HOUSE_BODY.d / 2, 6);
  });

  it("the house stays on its pad", () => {
    expect([HOUSE_BODY.w, HOUSE_BODY.d]).toEqual([1.4 * 1.5, 1.1 * 1.5]); // half again as big as the first house
    const r = Math.hypot(HOUSE_BODY.w / 2, HOUSE_BODY.d / 2);
    expect(Math.hypot(HOUSE_BODY.x, HOUSE_BODY.z) + r).toBeLessThan(PAD_RADIUS.home);
  });

  it("the café building sits behind the terrace (as the default camera sees it), off the walk-in path", () => {
    const c = zoneCenter("maker_space");
    const road = NODES.S2;
    // the road arrives along x ≈ 0 (relative); the building keeps clear of it
    expect(Math.abs(road.x - c.x)).toBeLessThan(0.05);
    expect(Math.abs(CAFE_BUILDING.x) - CAFE_BUILDING.w / 2).toBeGreaterThan(0.25);
    // the default camera looks from +x,+z: the building stays on the far (−z) side of every table
    for (const t of CAFE_TABLES) expect(t.z - 0.25 - (CAFE_BUILDING.z + CAFE_BUILDING.d / 2)).toBeGreaterThan(0.4);
    for (const s of SPOTS.filter((sp) => sp.zone === "maker_space")) {
      const l = { x: s.x - c.x - CAFE_BUILDING.x, z: s.z - c.z - CAFE_BUILDING.z };
      expect(Math.abs(l.x) > CAFE_BUILDING.w / 2 + 0.2 || Math.abs(l.z) > CAFE_BUILDING.d / 2 + 0.2, s.id).toBe(true);
    }
  });

  it("the pool deck holds the basin and both loungers", () => {
    const inDeck = (x: number, z: number) =>
      Math.abs(x - POOL_DECK.x) <= POOL_DECK.w / 2 && Math.abs(z - POOL_DECK.z) <= POOL_DECK.d / 2;
    expect(inDeck(POOL.x - POOL.w / 2 - 0.1, POOL.z - POOL.d / 2 - 0.1)).toBe(true);
    expect(inDeck(POOL.x + POOL.w / 2 + 0.1, POOL.z + POOL.d / 2 + 0.1)).toBe(true);
    for (const l of POOL.loungers) expect(inDeck(l.x, l.z + 0.32)).toBe(true);
  });

  it("the pool deck keeps off the street and the coaster track", () => {
    const c = zoneCenter("pool");
    const onDeck = (p: Pt) =>
      Math.abs(p.x - c.x - POOL_DECK.x) <= POOL_DECK.w / 2 && Math.abs(p.z - c.z - POOL_DECK.z) <= POOL_DECK.d / 2;
    for (const p of COASTER_TRACK) expect(onDeck(p)).toBe(false);
    for (let i = 1; i < STREET.length; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const p = lerp(NODES[STREET[i - 1]], NODES[STREET[i]], t);
        expect(onDeck(p)).toBe(false);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const corner = { x: c.x + POOL_DECK.x + (sx * POOL_DECK.w) / 2, z: c.z + POOL_DECK.z + (sz * POOL_DECK.d) / 2 };
      expect(streetDist(corner)).toBeGreaterThan(STREET_W / 2 + 0.1);
    }
  });

  it("the ferris wheel stays off roads, pads and the coaster", () => {
    expect(Math.max(Math.abs(FERRIS.x), Math.abs(FERRIS.z)) + FERRIS.r).toBeLessThan(ISLAND_HALF - 1);
    for (const pad of PADS) expect(Math.hypot(FERRIS.x - pad.x, FERRIS.z - pad.z), pad.zone).toBeGreaterThan(pad.r + FERRIS.r * 0.5);
    for (const p of COASTER_TRACK) expect(Math.hypot(FERRIS.x - p.x, FERRIS.z - p.z)).toBeGreaterThan(0.9);
  });
});

describe("decorClear", () => {
  it("rejects roads, the street, pads, spots and the big rides", () => {
    for (const [a, b] of EDGES) for (const t of [0.25, 0.5, 0.75]) expect(decorClear(lerp(NODES[a], NODES[b], t), 0)).toBe(false);
    for (const s of SPOTS) expect(decorClear(s, 0), s.id).toBe(false);
    for (const pad of PADS) expect(decorClear(pad, 0), pad.zone).toBe(false);
    for (const p of COASTER_TRACK) expect(decorClear(p, 0)).toBe(false);
    const cafe = zoneCenter("maker_space");
    expect(decorClear({ x: cafe.x + CAFE_BUILDING.x, z: cafe.z + CAFE_BUILDING.z }, 0)).toBe(false);
    expect(decorClear(FERRIS, 0)).toBe(false);
  });

  it("accepts open grass", () => {
    expect(decorClear({ x: -6, z: -9.5 }, 0.3)).toBe(true);
  });
});

describe("scatter", () => {
  it("is deterministic and keeps every point clear", () => {
    const a = scatter(11, 1.0, 0.3);
    const b = scatter(11, 1.0, 0.3);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(60);
    for (const p of a) expect(decorClear(p, 0.3)).toBe(true);
  });

  it("covers the whole bigger island", () => {
    const pts = scatter(3, 1.0, 0.3);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      // each corner is wooded — or a place fills it (the big pool sits in the north-east)
      const filled = pts.some((p) => p.x * sx > 6 && p.z * sz > 6) || PADS.some((p) => p.x * sx > 6 && p.z * sz > 6);
      expect(filled, `${sx},${sz}`).toBe(true);
    }
  });

  it("an accept filter thins the result", () => {
    expect(scatter(5, 1.0, 0.3, (_p, r) => r < 0.3).length).toBeLessThan(scatter(5, 1.0, 0.3).length);
  });
});

describe("streetLamps", () => {
  it("line the street, off the tarmac and pads, not too close together", () => {
    const lamps = streetLamps();
    expect(lamps.length).toBeGreaterThanOrEqual(7); // the bigger house pad covers the street's first metre
    for (const l of lamps) {
      const d = streetDist(l);
      expect(d).toBeGreaterThan(STREET_W / 2);
      expect(d).toBeLessThan(STREET_W / 2 + 0.4);
      for (const pad of PADS) expect(Math.hypot(l.x - pad.x, l.z - pad.z)).toBeGreaterThan(pad.r);
    }
    for (const a of lamps) for (const b of lamps) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.2);
  });
});

describe("bikesShown", () => {
  it("shows every bike when none is ridden", () => {
    expect(bikesShown(4, 0, [])).toEqual([true, true, true, true]);
  });
  it("hides the slots the riders took first, then from the end", () => {
    expect(bikesShown(4, 2, [false, true, false, false])).toEqual([true, false, true, false]);
    expect(bikesShown(4, 1, [])).toEqual([true, true, true, false]);
  });
  it("clamps silly counts", () => {
    expect(bikesShown(4, 9, [])).toEqual([false, false, false, false]);
    expect(bikesShown(4, -1, [])).toEqual([true, true, true, true]);
    expect(bikesShown(4, Number.NaN, [])).toEqual([true, true, true, true]);
  });
});

describe("coaster geometry", () => {
  it("rails run beside the track centre, slightly below it", () => {
    const left = railLine(COASTER_TRACK, -0.09, 0.12);
    expect(left).toHaveLength(COASTER_TRACK.length);
    left.forEach((p, i) => {
      const c = COASTER_TRACK[i];
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(0.09, 3);
      expect(c.y - p.y).toBeCloseTo(0.12, 6);
    });
  });

  it("supports stand under the rails, down to the ground", () => {
    const sup = coasterSupports(COASTER_TRACK, 4, 0.12);
    expect(sup.length).toBe(Math.ceil(COASTER_TRACK.length / 4));
    for (const s of sup) {
      expect(s.y).toBeGreaterThan(0.05);
      expect(COASTER_TRACK.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 1e-9 && c.y - 0.12 - s.y < 0.1)).toBe(true);
    }
  });
});

describe("grass patches and benches", () => {
  it("patches are deterministic and never cover a road, pad or spot", async () => {
    const { grassPatches } = await import("../../components/village/decor");
    const a = grassPatches();
    expect(a).toEqual(grassPatches());
    expect(a.length).toBeGreaterThan(10);
    for (const p of a) {
      for (const fx of [-0.5, 0, 0.5]) for (const fz of [-0.5, 0, 0.5]) {
        expect(decorClear({ x: p.x + fx * p.w, z: p.z + fz * p.d }, 0.05)).toBe(true);
      }
    }
    for (const a1 of a) for (const b1 of a) {
      if (a1 === b1) continue;
      const overlap = Math.abs(a1.x - b1.x) < (a1.w + b1.w) / 2 && Math.abs(a1.z - b1.z) < (a1.d + b1.d) / 2;
      expect(overlap).toBe(false);
    }
  });

  it("street benches face the street from its side", async () => {
    const { streetBenches } = await import("../../components/village/decor");
    const benches = streetBenches();
    expect(benches.length).toBeGreaterThanOrEqual(4);
    for (const b of benches) {
      expect(decorClear(b, 0.25)).toBe(true);
      const ahead = { x: b.x + Math.sin(b.yaw) * 0.5, z: b.z + Math.cos(b.yaw) * 0.5 };
      expect(streetDist(ahead)).toBeLessThan(streetDist(b));
    }
  });

  it("the pool basin hole matches the layout's basin", async () => {
    const { poolBasinWorld } = await import("../../components/village/decor");
    const c = zoneCenter("pool");
    expect(poolBasinWorld()).toEqual({ x: c.x + POOL.x, z: c.z + POOL.z, w: POOL.w, d: POOL.d });
  });
});

describe("labelSpot", () => {
  it("keeps every painted name off other places from the default camera and from around", async () => {
    const { labelSpot } = await import("../../components/village/decor");
    const cams = [{ x: 11, z: 11 }, { x: -14, z: 9 }, { x: 0, z: -16 }, { x: 15, z: -3 }];
    for (const cam of cams) {
      for (const pad of PADS) {
        const s = labelSpot(pad.zone, pad, pad.r, cam, 0);
        for (const other of PADS) {
          if (other.zone === pad.zone) continue;
          expect(Math.hypot(s.x - other.x, s.z - other.z), `${pad.zone} on ${other.zone} from ${cam.x},${cam.z}`).toBeGreaterThan(other.r + 0.3);
        }
        expect(s.yaw).toBeCloseTo(Math.atan2(cam.x - s.x, cam.z - s.z), 0);
      }
    }
  });

  it("uses the plain camera-facing spot when it is free", async () => {
    const { labelSpot } = await import("../../components/village/decor");
    const { groundLabelPlacement } = await import("../../lib/village/venueLabels");
    const c = zoneCenter("plaza");
    const a = labelSpot("plaza", c, PAD_RADIUS.plaza, { x: 11, z: 11 }, 0);
    const b = groundLabelPlacement(c, PAD_RADIUS.plaza, { x: 11, z: 11 });
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.z).toBeCloseTo(b.z, 6);
  });
});
