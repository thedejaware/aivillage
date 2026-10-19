import { describe, it, expect } from "vitest";
import type { DishLook } from "@aivillage/shared";
import { BENCH, KITCHEN, LIBRARY, SPOTS, spotsFor, zoneCenter, type Pt } from "../../lib/village/layout";
import { PAD_RADIUS, ROAD_W, roadDist } from "../../components/village/scenery";
import { decorClear, inKeepOut } from "../../components/village/decor";
import {
  BOOK_COLORS, DESK, KITCHEN_FLOOR, KITCHEN_PERGOLA, KITCHEN_PROPS, LIBRARY_PROPS, LIBRARY_ROOF, LIBRARY_RUG, QUIET_PROPS,
  SHELF, bookRow, copySlots, steamPuff
} from "../../components/village/venues/placeProps";

const world = (zone: string, p: Pt): Pt => {
  const c = zoneCenter(zone);
  return { x: c.x + p.x, z: c.z + p.z };
};
const corners = (r: { x0: number; x1: number; z0: number; z1: number }): Pt[] =>
  [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x0, z: r.z1 }, { x: r.x1, z: r.z1 }];
const inFloor = (p: Pt, r: number) =>
  Math.abs(p.x - KITCHEN_FLOOR.x) + r <= KITCHEN_FLOOR.w / 2 && Math.abs(p.z - KITCHEN_FLOOR.z) + r <= KITCHEN_FLOOR.d / 2;
/** A twin standing or sitting at a spot takes about this much room. */
const BODY = 0.18;

describe("the kitchen's props", () => {
  const zone = "kitchen";

  it("stand on the pad or on the cooking floor", () => {
    for (const p of KITCHEN_PROPS) {
      const onPad = Math.hypot(p.x, p.z) + p.r <= PAD_RADIUS[zone] + 0.05;
      expect(onPad || inFloor(p, p.r), p.id).toBe(true);
    }
  });

  it("the cooking floor holds the island, the range and the pergola posts", () => {
    const { island, range } = KITCHEN;
    for (const b of [island, range]) {
      expect(inFloor({ x: b.x - b.w / 2, z: b.z - b.d / 2 }, 0)).toBe(true);
      expect(inFloor({ x: b.x + b.w / 2, z: b.z + b.d / 2 }, 0)).toBe(true);
    }
    for (const c of corners(KITCHEN_PERGOLA)) expect(inFloor(c, 0.04)).toBe(true);
  });

  it("keep clear of every spot a twin uses, and of the path", () => {
    const spots = spotsFor(zone);
    const posts = corners(KITCHEN_PERGOLA).map((c, i) => ({ id: `post${i}`, ...c, r: 0.05 }));
    for (const p of [...KITCHEN_PROPS, ...posts]) {
      const w = world(zone, p);
      for (const s of spots) expect(Math.hypot(w.x - s.x, w.z - s.z), `${p.id}/${s.id}`).toBeGreaterThan(p.r + BODY);
      expect(roadDist(w), p.id).toBeGreaterThan(ROAD_W / 2 + p.r);
    }
  });

  it("the path in from the street reaches the centre without crossing the floor or the table", () => {
    // the road ends at the centre; the floor starts behind it and the table stands east of it
    expect(KITCHEN_FLOOR.z + KITCHEN_FLOOR.d / 2).toBeLessThan(-ROAD_W / 2);
    const t = KITCHEN.table;
    const c = zoneCenter(zone);
    const tableWest = { x: c.x + t.x - t.w / 2 - KITCHEN.seatOffset, z: c.z + t.z };
    expect(roadDist(tableWest)).toBeGreaterThan(ROAD_W / 2 + 0.2);
  });

  it("trees and lamps never grow on the cooking floor", () => {
    const c = zoneCenter(zone);
    const f = KITCHEN_FLOOR;
    for (const p of [{ x: f.x - f.w / 2 + 0.05, z: f.z - f.d / 2 + 0.05 }, { x: f.x + f.w / 2 - 0.05, z: f.z - f.d / 2 + 0.05 }]) {
      const w = { x: c.x + p.x, z: c.z + p.z };
      expect(inKeepOut(w, 0)).toBe(true);
      expect(decorClear(w, 0.1)).toBe(false);
    }
  });
});

describe("the library's props", () => {
  const zone = "library";
  const desks = LIBRARY.desks.map((d) => ({ x0: d.x - DESK.w / 2, x1: d.x + DESK.w / 2, z0: d.z - DESK.d / 2, z1: d.z + DESK.d / 2 }));
  const rectDist = (p: Pt, r: { x0: number; x1: number; z0: number; z1: number }) =>
    Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.z0 - p.z, 0, p.z - r.z1));

  it("desks don't overlap each other or their sitters", () => {
    for (let i = 1; i < desks.length; i++) expect(desks[i].z0).toBeGreaterThan(desks[i - 1].z1);
    for (const d of LIBRARY.desks) expect(d.x - DESK.w / 2 - d.seatX).toBeGreaterThan(0.1);
  });

  it("roof posts, lamps and plants keep clear of chairs, desks, shelves and the path", () => {
    const posts = corners(LIBRARY_ROOF).map((c, i) => ({ id: `post${i}`, ...c, r: 0.04 }));
    const shelves = LIBRARY.shelves.map((s) => ({ x0: s.x - s.w / 2, x1: s.x + s.w / 2, z0: s.z - SHELF.d / 2, z1: s.z + SHELF.d / 2 }));
    for (const p of [...LIBRARY_PROPS, ...posts]) {
      for (const a of LIBRARY.armchairs) expect(Math.hypot(p.x - a.x, p.z - a.z), p.id).toBeGreaterThan(p.r + 0.2);
      for (const d of [...desks, ...shelves]) expect(rectDist(p, d), p.id).toBeGreaterThan(p.r + 0.02);
      for (const s of spotsFor(zone)) {
        const w = world(zone, p);
        expect(Math.hypot(w.x - s.x, w.z - s.z), `${p.id}/${s.id}`).toBeGreaterThan(p.r + BODY);
      }
      expect(roadDist(world(zone, p)), p.id).toBeGreaterThan(ROAD_W / 2 + p.r);
    }
  });

  it("everything stands on the pad except the back of the roof, which decor keeps clear", () => {
    for (const p of LIBRARY_PROPS) expect(Math.hypot(p.x, p.z) + p.r, p.id).toBeLessThanOrEqual(PAD_RADIUS[zone]);
    for (const d of desks) for (const c of corners(d)) expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(PAD_RADIUS[zone]);
    for (const c of corners(LIBRARY_ROOF)) expect(inKeepOut(world(zone, c), 0)).toBe(true);
    expect(Math.hypot(LIBRARY_RUG.x, LIBRARY_RUG.z) + LIBRARY_RUG.r).toBeLessThan(PAD_RADIUS[zone]);
  });

  it("book rows fill the shelf without spilling out of it", () => {
    const rowH = SHELF.h / SHELF.rows - 0.04;
    for (let seed = 1; seed < 30; seed++) {
      const row = bookRow(seed, 1.0, rowH);
      expect(row.length).toBeGreaterThan(12);
      for (const b of row) {
        expect(b.h).toBeLessThan(rowH);
        expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w / 2 + (b.tilt ? b.h * Math.sin(b.tilt) : 0)).toBeLessThanOrEqual(1.0 + 1e-9);
        expect(BOOK_COLORS as readonly string[]).toContain(b.color);
      }
      for (let i = 1; i < row.length; i++) expect(row[i].x - row[i].w / 2).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w / 2 - 1e-9);
    }
    expect(bookRow(7, 1.0, rowH)).toEqual(bookRow(7, 1.0, rowH)); // same on every load
  });
});

describe("the quiet corner after the library path", () => {
  it("its lamp, tree and flowers stay off the path and away from the bench", () => {
    const zone = "network_hub";
    const seats = SPOTS.filter((s) => s.zone === zone);
    for (const [id, p] of Object.entries(QUIET_PROPS)) {
      const w = world(zone, p);
      expect(roadDist(w), id).toBeGreaterThan(ROAD_W / 2 + p.r);
      for (const s of seats) expect(Math.hypot(w.x - s.x, w.z - s.z), id).toBeGreaterThan(p.r + 0.25);
      // not under the bench itself
      expect(Math.abs(p.x - BENCH.x) > BENCH.width / 2 + p.r || Math.abs(p.z - BENCH.z) > 0.2 + p.r, id).toBe(true);
      expect(Math.hypot(p.x, p.z) + p.r, id).toBeLessThanOrEqual(PAD_RADIUS[zone] + 0.05);
    }
  });

  it("the bench itself stays off the path", () => {
    const c = zoneCenter("network_hub");
    for (const dx of [-BENCH.width / 2, 0, BENCH.width / 2]) {
      expect(roadDist({ x: c.x + BENCH.x + dx, z: c.z + BENCH.z })).toBeGreaterThan(ROAD_W / 2 + 0.05);
    }
  });
});

describe("steam and kitchen state", () => {
  it("a puff rises, grows and fades in and out", () => {
    const a = steamPuff(0.1, 0, 3), b = steamPuff(1.0, 0, 3);
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.s).toBeGreaterThan(a.s);
    for (let t = 0; t < 10; t += 0.07) {
      for (let k = 0; k < 3; k++) {
        const p = steamPuff(t, k, 3);
        expect(p.o).toBeGreaterThanOrEqual(0);
        expect(p.o).toBeLessThanOrEqual(0.55);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(0.4);
      }
    }
  });

  it("reads whatever the sim gives as exactly n looks or nulls, and says when it changed", () => {
    const out: (DishLook | null)[] = [null, null, null, null];
    expect(copySlots(undefined, out)).toBe(false);
    expect(copySlots(["pasta", null, "sushi", 3, "drink"], out)).toBe(true);
    expect(out).toEqual(["pasta", null, null, null]);
    expect(copySlots(["pasta"], out)).toBe(false);
    expect(copySlots([null, "burger"], out)).toBe(true);
    expect(out).toEqual([null, "burger", null, null]);
  });
});
