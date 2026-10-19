import { describe, it, expect, vi } from "vitest";
import type { DishLook, WorldState, WorldTwinView } from "@aivillage/shared";
import { DEFAULT_ZONES, DEFAULT_APPEARANCE, LAYOUT_VERSION } from "@aivillage/shared";
import { VillageSim, avatarPose, bodyLift, WALK_SPEED } from "../../lib/village/sim";
import {
  tileToWorld, zoneCenter, spotsFor, SPOTS, POOL, BIKE_ROUTE, COASTER_DROP, COASTER_QUEUE,
  COASTER_RIDE_SECONDS, KITCHEN, coasterPose, type Pt
} from "../../lib/village/layout";
import { SEAT_Y } from "../../components/village/scenery";

/** the arrival callback also passes the order's issuedAt (null when a test order has none) */
const ARRIVED_AT = { asymmetricMatch: (v: unknown) => v === null || typeof v === "string", toString: () => "issuedAt" };

/** Deterministic PRNG so behaviour is repeatable. */
function seeded(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The tile of a zone's centre (tests place twins by place, not by raw tiles). */
const tile = (zone: string) => {
  const z = DEFAULT_ZONES.find((zz) => zz.name === zone)!;
  return { col: z.col, row: z.row };
};

const view = (id: string, col: number, row: number, order: WorldTwinView["order"] = null): WorldTwinView => ({
  id, name: id[0].toUpperCase() + id.slice(1), colorHex: 0x5b8cff, col, row, say: null, flag: null, order,
  appearance: DEFAULT_APPEARANCE, isMain: false, pose: null, stamina: 100
});
/** A twin standing at a zone's centre tile. */
const at = (id: string, zone: string, order: WorldTwinView["order"] = null): WorldTwinView => {
  const t = tile(zone);
  return view(id, t.col, t.row, order);
};
const world = (...twins: WorldTwinView[]): WorldState => ({ zones: DEFAULT_ZONES, twins, structures: [] });

/** Step the sim forward `seconds` from `t0`; returns the end time. */
function run(sim: VillageSim, t0: number, seconds: number, dt = 0.05): number {
  let t = t0;
  for (let i = 0; i < seconds / dt; i++) {
    t += dt;
    sim.step(t, dt);
  }
  return t;
}

/** Step until `pred` holds (or `max` seconds pass); returns the time. */
function runUntil(sim: VillageSim, t0: number, pred: () => boolean, max = 120, dt = 0.05): number {
  let t = t0;
  for (let i = 0; i < max / dt && !pred(); i++) {
    t += dt;
    sim.step(t, dt);
  }
  return t;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);
const goOrder = (zone: string) => ({ kind: "go" as const, zone, targetName: null, label: `Heading to ${zone}` });

describe("VillageSim basics", () => {
  it("creates twins at their tile position", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 3, 3)), 0);
    const t = sim.twins.get("memo")!;
    expect({ x: t.x, z: t.z }).toEqual(tileToWorld(3, 3));
  });

  it("walks to a new server position along the roads", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(at("memo", "plaza")), 0);
    const cafe = tile("maker_space");
    sim.reconcile(world(view("memo", cafe.col, cafe.row)), 0.1);
    const t = run(sim, 0.1, 1);
    expect(sim.twins.get("memo")!.mode).toBe("walk");
    run(sim, t, 40);
    expect(dist(sim.twins.get("memo")!, zoneCenter("maker_space"))).toBeLessThan(0.01);
  });
});

describe("VillageSim owner orders", () => {
  it("go: walks to a seat at the venue, sits, and reports arrival once", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(at("memo", "plaza")), 0);
    sim.reconcile(world(at("memo", "maker_space", goOrder("maker_space"))), 0);
    expect(sim.twins.get("memo")!.status).toBe("🚶 Heading to maker_space");
    run(sim, 0, 40);
    const memo = sim.twins.get("memo")!;
    const seat = spotsFor("maker_space").find((s) => dist(s, memo) < 0.01);
    expect(seat).toBeDefined();
    expect(memo.mode).toBe("activity");
    expect(memo.anim).toBe("drink");
    expect(onOrderArrive).toHaveBeenCalledTimes(1);
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "☕ At THE CAFÉ", ARRIVED_AT);
    expect(memo.status).toBe("☕ At THE CAFÉ");
  });

  it("go: stays at the venue for as long as the order holds", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "maker_space", goOrder("maker_space"))), 0);
    run(sim, 0, 30);
    const seatedAt = { ...sim.twins.get("memo")! };
    run(sim, 30, 300);
    expect(dist(sim.twins.get("memo")!, seatedAt)).toBeLessThan(0.01);
  });

  it("go: server tile updates do not drag an ordered twin off its seat", () => {
    const sim = new VillageSim({ random: seeded() });
    const cafe = tile("maker_space");
    sim.reconcile(world(view("memo", cafe.col, cafe.row, goOrder("maker_space"))), 0);
    run(sim, 0, 30);
    const seatedAt = { ...sim.twins.get("memo")! };
    sim.reconcile(world(view("memo", cafe.col + 1, cafe.row, goOrder("maker_space"))), 30);
    run(sim, 30, 10);
    expect(dist(sim.twins.get("memo")!, seatedAt)).toBeLessThan(0.01);
  });

  it("go: takes the seat even if a free-roaming villager sits there", () => {
    const sim = new VillageSim({ random: seeded() });
    const benchSeats = spotsFor("network_hub");
    sim.reconcile(world(at("memo", "plaza"), at("aiko", "network_hub"), at("ravi", "network_hub")), 0);
    for (const [i, id] of ["aiko", "ravi"].entries()) sim.occupySpot(id, benchSeats[i].id, 0);
    sim.reconcile(world(at("memo", "network_hub", goOrder("network_hub")), at("aiko", "network_hub"), at("ravi", "network_hub")), 1);
    run(sim, 1, 40);
    const memo = sim.twins.get("memo")!;
    expect(memo.mode).toBe("activity");
    expect(benchSeats.some((s) => dist(s, memo) < 0.01)).toBe(true);
  });

  it("free again: the twin goes back to roaming", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "maker_space", goOrder("maker_space"))), 0);
    run(sim, 0, 30);
    const seatedAt = { ...sim.twins.get("memo")! };
    sim.reconcile(world(at("memo", "maker_space")), 30);
    expect(sim.twins.get("memo")!.status).toBeNull();
    run(sim, 30, 90);
    expect(dist(sim.twins.get("memo")!, seatedAt)).toBeGreaterThan(0.05);
  });

  it("stay: arrives on the spot and never wanders", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(at("memo", "plaza")), 0);
    const start = { ...sim.twins.get("memo")! };
    sim.reconcile(world(at("memo", "plaza", { kind: "stay", zone: "plaza", targetName: null, label: "Staying at THE STAGE" })), 0);
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "📍 Staying at THE STAGE", ARRIVED_AT);
    run(sim, 0, 120);
    expect(dist(sim.twins.get("memo")!, start)).toBeLessThan(0.01);
  });

  it("talk_to: the target waits, the twin walks up to it and faces it", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(at("memo", "maker_space"), at("ravi", "garden")), 0);
    const raviStart = { ...sim.twins.get("ravi")! };
    sim.reconcile(world(at("memo", "garden", { kind: "talk_to", zone: "garden", targetName: "Ravi", label: "Going to talk to Ravi" }), at("ravi", "garden")), 0);
    run(sim, 0, 40);
    const memo = sim.twins.get("memo")!;
    const ravi = sim.twins.get("ravi")!;
    expect(dist(ravi, raviStart)).toBeLessThan(0.01);
    expect(dist(memo, ravi)).toBeLessThan(1);
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "💬 Talking with Ravi", ARRIVED_AT);
    const facing = Math.atan2(ravi.x - memo.x, ravi.z - memo.z);
    expect(Math.abs(Math.atan2(Math.sin(memo.yaw - facing), Math.cos(memo.yaw - facing)))).toBeLessThan(0.05);
  });
});

describe("VillageSim ambient life", () => {
  it("idle neighbours strike up a canned chat with speech bubbles", () => {
    const sim = new VillageSim({ random: seeded(7) });
    sim.reconcile(world(view("memo", 3, 3), view("ravi", 3.5, 3)), 0);
    run(sim, 0, 3);
    const memo = sim.twins.get("memo")!;
    const ravi = sim.twins.get("ravi")!;
    expect(memo.mode === "talk" || ravi.mode === "talk").toBe(true);
    run(sim, 3, 1);
    expect(memo.bubble !== null || ravi.bubble !== null).toBe(true);
  });

  it("a twin under orders is never pulled into ambient chat", () => {
    const sim = new VillageSim({ random: seeded(7) });
    sim.reconcile(world(view("memo", 3, 3, { kind: "stay", zone: "plaza", targetName: null, label: "Staying" }), view("ravi", 3.5, 3)), 0);
    run(sim, 0, 10);
    expect(sim.twins.get("memo")!.mode).not.toBe("talk");
  });

  it("drops twins that left the world", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 3, 3), view("ravi", 6, 6)), 0);
    sim.reconcile(world(view("memo", 3, 3)), 1);
    expect(sim.twins.has("ravi")).toBe(false);
  });

  it("idle life only uses restful spots — never a gym station, a lane or the coaster", () => {
    const sim = new VillageSim({ random: seeded(5) });
    sim.reconcile(world(at("memo", "gym"), at("aiko", "pool"), at("ravi", "funfair"), at("sena", "maker_space")), 0);
    const kinds = new Set<string>();
    let t = 0;
    for (let i = 0; i < 300; i++) {
      t = run(sim, t, 1);
      for (const tw of sim.twins.values()) if (tw.activity) kinds.add(tw.activity.spot.kind);
    }
    expect(kinds.has("coffee")).toBe(true); // the café twin does sit down
    for (const k of kinds) expect(["coffee", "bench", "blanket", "lounger"]).toContain(k);
  });
});

// ---------------- v4: body animations, actions, saved poses ----------------

type Act = NonNullable<NonNullable<WorldTwinView["order"]>["action"]>;
const act = (
  a: Partial<Act> & Pick<Act, "id" | "anim">, zone = "plaza", issuedAt = "2026-10-17T12:00:00Z", auto = false
): WorldTwinView["order"] => {
  const action: Act = { label: a.id, emoji: "✨", seconds: 4, place: null, targetName: null, ...a };
  return { kind: "act", zone, targetName: action.targetName, label: action.label, action, issuedAt, ...(auto ? { auto: true } : {}) };
};

describe("VillageSim body animations", () => {
  it("a walking twin reports a walk cycle; a standing one is idle", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(at("memo", "plaza")), 0);
    expect(avatarPose(sim.twins.get("memo")!, 0)).toMatchObject({ anim: "idle", walking: false, item: null });
    const cafe = tile("maker_space");
    sim.reconcile(world(view("memo", cafe.col, cafe.row)), 0.1);
    run(sim, 0.1, 2);
    expect(avatarPose(sim.twins.get("memo")!, 2.1)).toMatchObject({ walking: true });
  });

  it("every place's spots pick a matching body animation", () => {
    const expected: Record<string, string> = {
      coffee: "drink", bench: "sit", blanket: "sit", stage: "dance", treadmill: "run", weights: "lift",
      swim: "swim", lounger: "sit", cinema: "watch", plot: "dig"
    };
    for (const [kind, anim] of Object.entries(expected)) {
      const sim = new VillageSim({ random: seeded(), ambient: false });
      sim.reconcile(world(at("memo", "plaza")), 0);
      sim.occupySpot("memo", SPOTS.find((s) => s.kind === kind)!.id, 0);
      expect(sim.twins.get("memo")!.anim, kind).toBe(anim);
    }
  });

  it("animTime counts from when the animation started", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(at("memo", "maker_space")), 0);
    sim.occupySpot("memo", SPOTS.find((s) => s.kind === "coffee")!.id, 2);
    expect(avatarPose(sim.twins.get("memo")!, 5).animTime).toBeCloseTo(3);
  });
});

describe("VillageSim action orders", () => {
  it("a solo action plays right where the twin stands, then the twin waits", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(view("memo", 3, 3)), 0);
    const start = { ...sim.twins.get("memo")! };
    sim.reconcile(world(view("memo", 3, 3, act({ id: "jump", anim: "jump", emoji: "🦘", label: "jump", seconds: 4 }))), 0);
    run(sim, 0, 1);
    const memo = sim.twins.get("memo")!;
    expect(memo.anim).toBe("jump");
    expect(memo.bubble).toBe("🦘");
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "🦘 jump", ARRIVED_AT);
    run(sim, 1, 6);
    expect(memo.anim).toBe("idle");
    run(sim, 7, 60);
    expect(dist(memo, start)).toBeLessThan(0.01);
  });

  it("a placed action without a seat walks to its venue first (wash hands → the café)", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "plaza")), 0);
    sim.reconcile(world(at("memo", "plaza", act({ id: "wash_hands", anim: "wash", place: "maker_space", seconds: 6 }, "maker_space"))), 0);
    run(sim, 0, 1);
    expect(sim.twins.get("memo")!.mode).toBe("walk");
    runUntil(sim, 1, () => sim.twins.get("memo")!.anim === "wash");
    const memo = sim.twins.get("memo")!;
    expect(memo.anim).toBe("wash");
    expect(dist(memo, zoneCenter("maker_space"))).toBeLessThan(1.5);
  });

  it("a social action: walks to the partner, both play it facing each other", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "maker_space"), at("ravi", "garden")), 0);
    sim.reconcile(world(at("memo", "garden", act({ id: "hug", anim: "hug", emoji: "🤗", label: "hug", targetName: "Ravi", seconds: 5 }, "garden")), at("ravi", "garden")), 0);
    const t = runUntil(sim, 0, () => sim.twins.get("memo")!.anim === "hug");
    const memo = sim.twins.get("memo")!;
    const ravi = sim.twins.get("ravi")!;
    expect(memo.anim).toBe("hug");
    expect(ravi.anim).toBe("hug");
    expect(dist(memo, ravi)).toBeLessThan(0.8);
    const facing = Math.atan2(ravi.x - memo.x, ravi.z - memo.z);
    expect(Math.abs(Math.atan2(Math.sin(memo.yaw - facing), Math.cos(memo.yaw - facing)))).toBeLessThan(0.05);
    run(sim, t, 8);
    expect(ravi.anim).not.toBe("hug");
    expect(ravi.perform).toBeNull();
  });

  it("a refused social action: the partner says no, nobody hugs", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "garden"), at("ravi", "garden")), 0);
    sim.reconcile(world(at("memo", "garden", act({ id: "kiss_cheek", anim: "kiss", label: "kiss on the cheek", targetName: "Ravi", refused: true }, "garden")), at("ravi", "garden")), 0);
    runUntil(sim, 0, () => sim.twins.get("ravi")!.bubble === "🙅");
    expect(sim.twins.get("ravi")!.bubble).toBe("🙅");
    expect(sim.twins.get("memo")!.bubble).toBe("🙁");
    expect(sim.twins.get("memo")!.anim).not.toBe("kiss");
    expect(sim.twins.get("ravi")!.anim).not.toBe("kiss");
  });

  it("the same order given again plays again", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 3, 3)), 0);
    sim.reconcile(world(view("memo", 3, 3, act({ id: "jump", anim: "jump" }, "plaza", "2026-10-17T12:00:00Z"))), 0);
    run(sim, 0, 10);
    expect(sim.twins.get("memo")!.anim).toBe("idle");
    sim.reconcile(world(view("memo", 3, 3, act({ id: "jump", anim: "jump" }, "plaza", "2026-10-17T12:00:30Z"))), 10);
    run(sim, 10, 0.5);
    expect(sim.twins.get("memo")!.anim).toBe("jump");
  });
});

describe("VillageSim saved poses", () => {
  it("a twin starts exactly where it was saved on this map, and stays there", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    const v = { ...view("memo", 3, 3), pose: { x: 1.25, z: -2.5, yaw: 1.1, zone: "plaza", layout: LAYOUT_VERSION } };
    sim.reconcile(world(v), 0);
    run(sim, 0, 5);
    const memo = sim.twins.get("memo")!;
    expect({ x: memo.x, z: memo.z, yaw: memo.yaw }).toEqual({ x: 1.25, z: -2.5, yaw: 1.1 });
  });

  it("a pose saved on the old map is ignored: the twin starts at its tile", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    for (const layout of [1, undefined]) {
      const v = { ...view("memo", 3, 3), pose: { x: 1.25, z: -2.5, yaw: 1.1, zone: "network_hub", layout } };
      sim.reconcile(world(), 0);
      sim.reconcile(world(v), 0);
      const memo = sim.twins.get("memo")!;
      expect({ x: memo.x, z: memo.z }).toEqual(tileToWorld(3, 3));
    }
  });

  it("poses() reports where everyone is, with the nearest venue and the map version", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(at("memo", "maker_space"), at("ravi", "pool")), 0);
    const poses = sim.poses();
    expect(poses).toHaveLength(2);
    expect(poses.find((p) => p.id === "memo")).toMatchObject({ ...zoneCenter("maker_space"), zone: "maker_space", layout: LAYOUT_VERSION });
    expect(poses.find((p) => p.id === "ravi")).toMatchObject({ zone: "pool" });
  });
});

describe("VillageSim v4: the AI decides where twins go", () => {
  it("idle twins stay around their venue — no random strolls across the island", () => {
    const sim = new VillageSim({ random: seeded(3) });
    sim.reconcile(world(at("memo", "network_hub")), 0);
    const home = zoneCenter("network_hub");
    let t = 0;
    let far = 0;
    for (let i = 0; i < 60; i++) {
      t = run(sim, t, 5);
      far = Math.max(far, dist(sim.twins.get("memo")!, home));
    }
    expect(far).toBeLessThan(2.6);
  });

  it("idle side chats are wordless — real words only come from the AI", () => {
    const sim = new VillageSim({ random: seeded(7) });
    sim.reconcile(world(view("memo", 3, 3), view("ravi", 3.5, 3)), 0);
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 100; i++) {
      t = run(sim, t, 0.2);
      for (const tw of sim.twins.values()) if (tw.bubble) seen.add(tw.bubble);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const b of seen) expect(b).not.toMatch(/[a-z]{3,}/i);
  });
});

describe("VillageSim → avatar fit", () => {
  it("sitting on the ground lowers the body to the grass; seats keep it at seat height", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(at("memo", "event_space"), at("aiko", "network_hub"), view("ravi", 3, 3)), 0);
    sim.occupySpot("memo", SPOTS.find((s) => s.kind === "blanket")!.id, 0);
    sim.occupySpot("aiko", SPOTS.find((s) => s.kind === "bench")!.id, 0);
    expect(bodyLift(sim.twins.get("memo")!)).toBeLessThan(-0.15);
    expect(Math.abs(bodyLift(sim.twins.get("aiko")!))).toBeLessThan(0.03);
    expect(bodyLift(sim.twins.get("ravi")!)).toBe(0);
    sim.reconcile(world(at("memo", "event_space"), at("aiko", "network_hub"), view("ravi", 3, 3, act({ id: "sit", anim: "sit", seconds: 20 }))), 1);
    run(sim, 1, 0.5);
    expect(bodyLift(sim.twins.get("ravi")!)).toBeLessThan(-0.15);
  });

  it("every seat kind keeps a seated twin on its seat (seat top − the avatar's seat height)", () => {
    for (const kind of ["coffee", "bench", "cinema", "lounger"] as const) {
      const sim = new VillageSim({ random: seeded(), ambient: false });
      sim.reconcile(world(at("memo", "plaza")), 0);
      sim.occupySpot("memo", SPOTS.find((s) => s.kind === kind)!.id, 0);
      expect(bodyLift(sim.twins.get("memo")!), kind).toBeCloseTo(SEAT_Y[kind] - 0.25, 5);
    }
  });

  it("seated: legs sit on café chairs, benches, cinema seats, loungers and the blanket — whatever the upper body does", () => {
    for (const kind of ["coffee", "bench", "cinema", "lounger", "blanket"] as const) {
      const sim = new VillageSim({ random: seeded(), ambient: false });
      sim.reconcile(world(at("memo", "plaza")), 0);
      sim.occupySpot("memo", SPOTS.find((s) => s.kind === kind)!.id, 0);
      expect(avatarPose(sim.twins.get("memo")!, 1).seated, kind).toBe(true);
      expect(bodyLift(sim.twins.get("memo")!), kind).toBeCloseTo(SEAT_Y[kind] - 0.25, 5);
    }
    for (const kind of ["treadmill", "weights", "plot", "stage"] as const) {
      const sim = new VillageSim({ random: seeded(), ambient: false });
      sim.reconcile(world(at("memo", "plaza")), 0);
      sim.occupySpot("memo", SPOTS.find((s) => s.kind === kind)!.id, 0);
      expect(avatarPose(sim.twins.get("memo")!, 1).seated, kind).toBe(false);
    }
    // an ordered café visit: drinking with the legs under the table
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "maker_space")), 0);
    sim.reconcile(world(at("memo", "maker_space", placeAct("eat", "eat", "maker_space", 30, { item: "plate" }))), 0);
    const memo = sim.twins.get("memo")!;
    const t = runUntil(sim, 0, () => memo.anim === "eat", 30);
    expect(avatarPose(memo, t)).toMatchObject({ anim: "eat", seated: true, item: "plate" });
    expect(avatarPose(sim.twins.get("memo")!, t).walking).toBe(false);
  });

  it("the walk cycle follows the distance walked, so feet don't slide", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(at("memo", "plaza"), at("aiko", "plaza")), 0);
    const cafe = tile("maker_space");
    const gym = tile("gym");
    sim.reconcile(world(view("memo", cafe.col, cafe.row), view("aiko", gym.col, gym.row)), 0.1);
    run(sim, 0.1, 1.5);
    const before = [...sim.twins.values()].map((tw) => ({ tw, x: tw.x, z: tw.z, ph: tw.walkPhase }));
    run(sim, 1.6, 0.3, 0.01);
    let checked = 0;
    for (const b of before) {
      const walked = Math.hypot(b.tw.x - b.x, b.tw.z - b.z);
      if (walked < 0.1 || b.tw.route.length === 0) continue;
      expect((b.tw.walkPhase - b.ph) / walked).toBeCloseTo(9 / WALK_SPEED, 0);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ---------------- Main Street: places ----------------

/** A catalogue place action, as the server sends it. */
const placeAct = (
  id: string, anim: Act["anim"], place: string, seconds: number,
  extra: Partial<Act> = {}, issuedAt = "2026-10-17T12:00:00Z", auto = true
) => act({ id, anim, place, seconds, label: id, emoji: "✨", ...extra }, place, issuedAt, auto);

const spotOf = (sim: VillageSim, id: string) => {
  const tw = sim.twins.get(id)!;
  return SPOTS.find((s) => dist(s, tw) < 0.01);
};

describe("Main Street: a place action", () => {
  it("walks to a free spot of the right kind, plays the action's anim for its seconds, holds the item", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(at("memo", "event_space")), 0);
    sim.reconcile(world(at("memo", "cinema", placeAct("watch_movie", "watch", "cinema", 20, { item: "popcorn", emoji: "🎬", label: "watch a movie" }))), 0);
    const memo = sim.twins.get("memo")!;
    const t = runUntil(sim, 0, () => memo.anim === "watch");
    expect(memo.anim).toBe("watch");
    expect(spotOf(sim, "memo")?.kind).toBe("cinema");
    expect(avatarPose(memo, t).item).toBe("popcorn");
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "🎬 watch a movie", ARRIVED_AT);
    run(sim, t, 19);
    expect(memo.anim).toBe("watch");
    run(sim, t + 19, 2);
    expect(memo.anim).not.toBe("watch");
    expect(avatarPose(memo, t + 21).item).toBeNull();
    expect(sim.spots.filter((s) => s.busyBy === "memo")).toHaveLength(0);
  });

  it("each action finds its kind of spot", () => {
    const cases: [string, Act["anim"], string, string][] = [
      ["swim", "swim", "pool", "swim"], ["sunbathe", "sit", "pool", "lounger"], ["run", "run", "gym", "treadmill"],
      ["work_out", "lift", "gym", "weights"], ["garden", "dig", "garden", "plot"], ["drink_coffee", "drink", "maker_space", "coffee"],
      ["drink_juice", "drink", "maker_space", "coffee"], ["eat", "eat", "maker_space", "coffee"], ["read", "read", "network_hub", "bench"]
    ];
    for (const [id, anim, place, kind] of cases) {
      const sim = new VillageSim({ random: seeded() });
      sim.reconcile(world(at("memo", place)), 0);
      sim.reconcile(world(at("memo", place, placeAct(id, anim, place, 30))), 0);
      const memo = sim.twins.get("memo")!;
      runUntil(sim, 0, () => memo.anim === anim && memo.route.length === 0, 60);
      expect(memo.anim, id).toBe(anim);
      if (kind !== "swim") expect(spotOf(sim, "memo")?.kind, id).toBe(kind);
      else expect(sim.spots.find((s) => s.busyBy === "memo")?.kind).toBe("swim");
    }
  });

  it("an auto 'sit' at the lawn sits on the blanket", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "event_space")), 0);
    sim.reconcile(world(at("memo", "event_space", act({ id: "sit", anim: "sit", seconds: 20 }, "event_space", "2026-10-17T12:00:00Z", true))), 0);
    runUntil(sim, 0, () => sim.twins.get("memo")!.activity !== null || sim.twins.get("memo")!.task?.phase === "do", 30);
    expect(spotOf(sim, "memo")?.kind).toBe("blanket");
    expect(sim.twins.get("memo")!.anim).toBe("sit");
  });

  it("capacity: a 5th swimmer waits off the lanes, then swims when a lane frees up", () => {
    const sim = new VillageSim({ random: seeded() });
    const ids = ["a1", "a2", "a3", "a4", "a5"];
    sim.reconcile(world(...ids.map((id) => at(id, "pool"))), 0);
    sim.reconcile(world(...ids.map((id, i) => at(id, "pool", placeAct("swim", "swim", "pool", i === 0 ? 10 : 60)))), 0);
    const swimmers = () => [...sim.twins.values()].filter((tw) => tw.anim === "swim");
    let t = runUntil(sim, 0, () => swimmers().length === 4, 30);
    expect(swimmers().length).toBe(4);
    const waiting = [...sim.twins.values()].find((tw) => tw.anim !== "swim")!;
    expect(waiting.task?.phase).toBe("wait");
    expect(sim.spots.some((s) => s.busyBy === waiting.id)).toBe(false);
    expect(spotsFor("pool").filter((s) => s.kind === "swim")).toHaveLength(4);
    // the first swimmer leaves after 10 s; the waiting twin takes its lane — nobody ever shares a spot
    for (let i = 0; i < 600 && waiting.anim !== "swim"; i++) {
      t = run(sim, t, 0.1);
      const held = sim.spots.filter((s) => s.busyBy).map((s) => s.busyBy);
      expect(new Set(held).size).toBe(held.length);
      expect(sim.twins.get("a1")!.anim === "swim" ? swimmers().length : 4).toBeLessThanOrEqual(4);
    }
    expect(waiting.anim).toBe("swim");
    expect(sim.spots.find((s) => s.busyBy === waiting.id)?.kind).toBe("swim");
  });
});

describe("Main Street: the pool", () => {
  it("swims lengths along its lane, body down in the water", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "pool")), 0);
    sim.reconcile(world(at("memo", "pool", placeAct("swim", "swim", "pool", 40))), 0);
    const memo = sim.twins.get("memo")!;
    let t = runUntil(sim, 0, () => memo.anim === "swim");
    const lane = sim.spots.find((s) => s.busyBy === "memo")!;
    const c = zoneCenter("pool");
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < 200; i++) {
      t = run(sim, t, 0.1);
      expect(memo.x).toBeCloseTo(lane.x, 5);
      expect(bodyLift(memo)).toBeCloseTo(SEAT_Y.swim, 5);
      expect(avatarPose(memo, t).walking).toBe(false);
      zMin = Math.min(zMin, memo.z);
      zMax = Math.max(zMax, memo.z);
    }
    expect(zMin).toBeLessThan(c.z + POOL.swimTo + 0.1);
    expect(zMax).toBeGreaterThan(c.z + POOL.swimFrom - 0.1);
    // after the swim the twin climbs out: no longer in the water
    runUntil(sim, t, () => memo.anim !== "swim", 30);
    run(sim, t, 5);
    expect(bodyLift(memo)).toBeGreaterThan(-0.05);
  });
});

describe("Main Street: the rollercoaster", () => {
  it("queue → ride seated along the track → arms up + 😱 on the drop → get off", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "funfair")), 0);
    sim.reconcile(world(at("memo", "funfair", placeAct("ride_coaster", "ride", "funfair", 60))), 0);
    const memo = sim.twins.get("memo")!;
    expect(sim.coaster.running).toBe(false);
    let t = runUntil(sim, 0, () => memo.task?.phase === "queue", 30);
    expect(COASTER_QUEUE.some((q) => dist(q, memo) < 0.01)).toBe(true);
    t = runUntil(sim, t, () => sim.coaster.running, 10);
    expect(sim.coaster.riders).toEqual(["memo"]);
    t = run(sim, t, 1);
    expect(memo.anim).toBe("ride");
    const p = coasterPose(sim.coaster.t);
    expect(dist(memo, p)).toBeLessThan(0.4);
    expect(bodyLift(memo)).toBeGreaterThan(0.1);
    // the drop
    t = runUntil(sim, t, () => sim.coaster.t > (COASTER_DROP[0] + COASTER_DROP[1]) / 2, COASTER_RIDE_SECONDS);
    expect(memo.anim).toBe("cheer");
    expect(memo.bubble).toBe("😱");
    expect(avatarPose(memo, t).seated).toBe(true); // arms up, still sitting in the cart
    t = runUntil(sim, t, () => sim.coaster.t > COASTER_DROP[1] + 0.05, COASTER_RIDE_SECONDS);
    expect(memo.anim).toBe("ride");
    // the end
    t = runUntil(sim, t, () => !sim.coaster.running, COASTER_RIDE_SECONDS);
    expect(sim.coaster.t).toBe(0);
    expect(sim.coaster.riders).toEqual([]);
    expect(memo.task).toBeNull();
    expect(memo.anim).toBe("idle");
    expect(bodyLift(memo)).toBe(0);
    expect(memo.pitch).toBe(0);
    expect(dist(memo, zoneCenter("funfair"))).toBeLessThan(2.5);
  });

  it("one cart of 4: a second group queues for the next ride", () => {
    const sim = new VillageSim({ random: seeded() });
    const ids = ["r1", "r2", "r3", "r4", "r5", "r6"];
    sim.reconcile(world(...ids.map((id) => at(id, "funfair"))), 0);
    sim.reconcile(world(...ids.map((id) => at(id, "funfair", placeAct("ride_coaster", "ride", "funfair", 60)))), 0);
    let t = runUntil(sim, 0, () => sim.coaster.running, 30);
    run(sim, t, 3);
    t += 3;
    expect(sim.coaster.riders.length).toBeLessThanOrEqual(4);
    const first = [...sim.coaster.riders];
    const others = ids.filter((id) => !first.includes(id));
    expect(others.length).toBeGreaterThanOrEqual(2);
    for (const id of others) expect(sim.twins.get(id)!.anim).not.toBe("ride");
    // nobody stands on the same queue spot
    const held = sim.spots.filter((s) => s.kind === "coaster" && s.busyBy).map((s) => s.busyBy);
    expect(new Set(held).size).toBe(held.length);
    t = runUntil(sim, t, () => !sim.coaster.running, COASTER_RIDE_SECONDS + 1);
    t = runUntil(sim, t, () => sim.coaster.running, 10);
    expect(sim.coaster.riders.some((id) => others.includes(id))).toBe(true);
  });
});

describe("Main Street: bikes", () => {
  it("takes a bike, rides the street and back, then parks it", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "bike_rack")), 0);
    sim.reconcile(world(at("memo", "bike_rack", placeAct("ride_bike", "bike", "bike_rack", 25))), 0);
    const memo = sim.twins.get("memo")!;
    let t = runUntil(sim, 0, () => memo.anim === "bike", 30);
    const slot = sim.spots.find((s) => s.busyBy === "memo")!;
    expect(slot.kind).toBe("bike");
    expect(sim.bikesInUse()).toBe(1);
    let maxX = -Infinity;
    for (let i = 0; i < 100 && memo.anim === "bike"; i++) {
      t = run(sim, t, 0.5);
      if (memo.anim === "bike") expect(avatarPose(memo, t).walking).toBe(false);
      maxX = Math.max(maxX, memo.x);
    }
    expect(maxX).toBeGreaterThan(BIKE_ROUTE[1].x + 10); // well along the street
    expect(memo.anim).not.toBe("bike");
    expect(sim.bikesInUse()).toBe(0);
    expect(dist(memo, slot)).toBeLessThan(0.7);
  });
});

describe("Main Street: the house", () => {
  it("walks in through the door and is hidden while asleep, until the order ends", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "home")), 0);
    const order = placeAct("sleep", "sleep", "home", 150);
    sim.reconcile(world(at("memo", "home", order)), 0);
    const memo = sim.twins.get("memo")!;
    expect(memo.hidden).toBe(false);
    let t = runUntil(sim, 0, () => memo.hidden, 30);
    expect(memo.hidden).toBe(true);
    expect(sim.sleepingCount()).toBe(1);
    const door = spotsFor("home").find((s) => s.kind === "bed")!;
    expect(dist(memo, door)).toBeLessThan(0.01);
    t = run(sim, t, 200);
    expect(memo.hidden).toBe(true); // still the same order
    sim.reconcile(world(at("memo", "home")), t);
    run(sim, t, 0.2);
    expect(memo.hidden).toBe(false);
    expect(sim.sleepingCount()).toBe(0);
  });

  it("the whole village can sleep at once", () => {
    const sim = new VillageSim({ random: seeded() });
    const ids = ["s1", "s2", "s3", "s4", "s5", "s6"];
    sim.reconcile(world(...ids.map((id) => at(id, "home"))), 0);
    sim.reconcile(world(...ids.map((id) => at(id, "home", placeAct("sleep", "sleep", "home", 150)))), 0);
    runUntil(sim, 0, () => sim.sleepingCount() === ids.length, 40);
    expect(sim.sleepingCount()).toBe(ids.length);
  });
});

describe("Main Street: together", () => {
  it("'take Ravi for a coffee': both sit at the same café table, facing each other", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "maker_space"), at("ravi", "garden")), 0);
    sim.reconcile(world(
      at("memo", "maker_space", placeAct("drink_coffee", "drink", "maker_space", 40, { targetName: "Ravi" }, "2026-10-17T12:00:00Z", false)),
      at("ravi", "garden")
    ), 0);
    const memo = sim.twins.get("memo")!;
    const ravi = sim.twins.get("ravi")!;
    runUntil(sim, 0, () => memo.anim === "drink" && ravi.anim === "drink" && memo.route.length === 0 && ravi.route.length === 0, 60);
    const a = spotOf(sim, "memo")!;
    const b = spotOf(sim, "ravi")!;
    expect(a.kind).toBe("coffee");
    expect(b.kind).toBe("coffee");
    expect(a.id.slice(0, -1)).toBe(b.id.slice(0, -1)); // cafe-1a / cafe-1b: same table
    expect(a.id).not.toBe(b.id);
    const facing = Math.atan2(ravi.x - memo.x, ravi.z - memo.z);
    expect(Math.abs(Math.atan2(Math.sin(memo.yaw - facing), Math.cos(memo.yaw - facing)))).toBeLessThan(0.05);
  });

  it("a partner listed after the host in the same first snapshot still comes along", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(
      at("memo", "maker_space", placeAct("drink_coffee", "drink", "maker_space", 40, { targetName: "Ravi" }, "2026-10-17T12:00:00Z", false)),
      at("ravi", "garden")
    ), 0);
    const ravi = sim.twins.get("ravi")!;
    runUntil(sim, 0, () => ravi.anim === "drink" && ravi.route.length === 0, 60);
    expect(spotOf(sim, "ravi")?.kind).toBe("coffee");
  });

  it("'take Sena to the cinema': neighbouring seats", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "cinema"), at("sena", "event_space")), 0);
    sim.reconcile(world(
      at("memo", "cinema", placeAct("watch_movie", "watch", "cinema", 40, { targetName: "Sena", item: "popcorn" }, "2026-10-17T12:00:00Z", false)),
      at("sena", "event_space")
    ), 0);
    const memo = sim.twins.get("memo")!;
    const sena = sim.twins.get("sena")!;
    const t = runUntil(sim, 0, () => memo.anim === "watch" && sena.anim === "watch" && sena.route.length === 0, 60);
    expect(dist(memo, sena)).toBeLessThan(0.7);
    expect(avatarPose(sena, t).item).toBe("popcorn");
  });
});

// ---------------- the kitchen and the library ----------------

describe("the kitchen: prep → cook → carry → eat", () => {
  const cook = (dish: { name: string; look: DishLook } | null, extra: Partial<Act> = {}, issuedAt = "2026-10-19T12:00:00Z", auto = true) =>
    placeAct("cook", "chop", "kitchen", 125, { item: "dish", ...(dish ? { dish } : {}), ...extra }, issuedAt, auto);
  const seats = () => spotsFor("kitchen").filter((s) => s.kind === "table");
  const kc = () => zoneCenter("kitchen");
  /** inside a furniture box (relative to the kitchen's centre), with a small margin */
  const inside = (p: Pt, box: { x: number; z: number; w: number; d: number }, m = 0.05) =>
    Math.abs(p.x - kc().x - box.x) < box.w / 2 - m && Math.abs(p.z - kc().z - box.z) < box.d / 2 - m;

  it("chops at a counter, stirs at the same station's stove, carries the plate to a seat and eats there — on the dish's clock", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(at("memo", "kitchen")), 0);
    sim.reconcile(world(at("memo", "kitchen", cook({ name: "pasta", look: "pasta" }))), 0);
    const memo = sim.twins.get("memo")!;
    const t0 = runUntil(sim, 0, () => memo.anim === "chop", 30);
    expect(memo.anim).toBe("chop");
    expect(onOrderArrive).toHaveBeenCalledTimes(1);
    const counter = spotOf(sim, "memo")!;
    expect(counter.kind).toBe("counter");
    const i = Number(counter.id.split("-")[1]);
    expect(memo.yaw).toBeCloseTo(counter.yaw, 5); // facing the island
    expect(avatarPose(memo, t0)).toMatchObject({ anim: "chop", seated: false, item: null });
    expect(bodyLift(memo)).toBeCloseTo(SEAT_Y.counter, 5);
    // the whole station and a seat are claimed up front
    expect(sim.spots.filter((s) => s.busyBy === "memo").map((s) => s.kind).sort()).toEqual(["counter", "stove", "table"]);
    expect(sim.spots.find((s) => s.id === `stove-${i}`)!.busyBy).toBe("memo");
    expect(sim.kitchenState().counters[i]).toBe("pasta");
    expect(sim.kitchenState().stoves.every((l) => l === null)).toBe(true);

    let t = run(sim, t0, 24);
    expect(memo.anim).toBe("chop");
    // prep ends after 25 s: walk round the island to the stove behind it (never through the island)
    for (let k = 0; k < 200 && memo.anim !== "stir"; k++) {
      t = run(sim, t, 0.05);
      expect(inside(memo, KITCHEN.island), `in the island at ${t.toFixed(2)}`).toBe(false);
    }
    expect(memo.anim).toBe("stir");
    expect(t).toBeGreaterThan(t0 + 25 - 0.1);
    expect(spotOf(sim, "memo")?.id).toBe(`stove-${i}`);
    expect(sim.spots.find((s) => s.id === `counter-${i}`)!.busyBy).toBeNull();
    expect(sim.kitchenState().counters[i]).toBeNull();
    expect(sim.kitchenState().stoves[i]).toBe("pasta");
    expect(avatarPose(memo, t).item).toBeNull();

    // cooking ends 60 s in (prep 25 + cook 35): carry the plate
    t = run(sim, t, t0 + 59 - t);
    expect(memo.anim).toBe("stir");
    t = runUntil(sim, t, () => memo.route.length > 0, 3);
    expect(t).toBeGreaterThan(t0 + 60 - 0.1);
    expect(avatarPose(memo, t)).toMatchObject({ walking: true, item: "dish", dish: "pasta" });
    expect(sim.spots.find((s) => s.id === `stove-${i}`)!.busyBy).toBeNull();
    expect(sim.kitchenState().stoves[i]).toBeNull();
    for (let k = 0; k < 400 && memo.anim !== "eat"; k++) {
      t = run(sim, t, 0.05);
      expect(inside(memo, KITCHEN.island), `in the island at ${t.toFixed(2)}`).toBe(false);
      expect(inside(memo, KITCHEN.table), `on the table at ${t.toFixed(2)}`).toBe(false);
    }
    expect(memo.anim).toBe("eat");
    const seat = spotOf(sim, "memo")!;
    expect(seat.kind).toBe("table");
    expect(avatarPose(memo, t)).toMatchObject({ anim: "eat", seated: true, item: "dish", dish: "pasta", walking: false });
    expect(bodyLift(memo)).toBeCloseTo(SEAT_Y.table - 0.25, 5);
    const k = seats().findIndex((s) => s.id === seat.id);
    expect(sim.kitchenState().seats[k]).toBe("pasta");
    expect(sim.kitchenState().seats.filter((l) => l !== null)).toHaveLength(1);

    // eating ends 125 s in; then every spot is free again
    t = run(sim, t, t0 + 124 - t);
    expect(memo.anim).toBe("eat");
    t = run(sim, t, 2);
    expect(memo.anim).not.toBe("eat");
    expect(memo.task).toBeNull();
    expect(avatarPose(memo, t).item).toBeNull();
    expect(sim.spots.filter((s) => s.busyBy === "memo")).toHaveLength(0);
    expect(sim.kitchenState().seats.every((l) => l === null)).toBe(true);
    // stands up away from the table, not onto it
    run(sim, t, 3);
    expect(inside(memo, KITCHEN.table)).toBe(false);
  });

  it("a drink skips the stove: blend at the counter for 20 s, then drink at the table", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "kitchen")), 0);
    sim.reconcile(world(at("memo", "kitchen", cook({ name: "orange juice", look: "drink" }))), 0);
    const memo = sim.twins.get("memo")!;
    const t0 = runUntil(sim, 0, () => memo.anim === "chop", 30);
    expect(sim.spots.filter((s) => s.busyBy === "memo").map((s) => s.kind).sort()).toEqual(["counter", "table"]);
    let t = t0;
    const anims = new Set<string>();
    for (let k = 0; k < 1200 && memo.anim !== "eat"; k++) {
      t = run(sim, t, 0.05);
      anims.add(memo.anim);
      expect(sim.spots.some((s) => s.kind === "stove" && s.busyBy === "memo")).toBe(false);
    }
    expect(anims.has("stir")).toBe(false);
    expect(memo.anim).toBe("eat");
    expect(t).toBeGreaterThan(t0 + 20 - 0.1);
    expect(t).toBeLessThan(t0 + 35);
    expect(avatarPose(memo, t)).toMatchObject({ item: "dish", dish: "drink", seated: true });
    // 20 + 5 + 40 = 65 s in all
    t = run(sim, t, t0 + 64 - t);
    expect(memo.anim).toBe("eat");
    run(sim, t, 2);
    expect(memo.task).toBeNull();
  });

  it("no dish on the order: cooks a plain plate", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "kitchen")), 0);
    sim.reconcile(world(at("memo", "kitchen", cook(null))), 0);
    const memo = sim.twins.get("memo")!;
    runUntil(sim, 0, () => memo.anim === "chop", 30);
    expect(sim.kitchenState().counters.filter((l) => l !== null)).toEqual(["plate"]);
  });

  it("4 stations: a 5th cook waits off the stations, then takes one when it frees up", () => {
    const sim = new VillageSim({ random: seeded() });
    const ids = ["c1", "c2", "c3", "c4", "c5"];
    sim.reconcile(world(...ids.map((id) => at(id, "kitchen"))), 0);
    sim.reconcile(world(...ids.map((id) => at(id, "kitchen", cook({ name: "steak", look: "steak" })))), 0);
    const cooks = () => [...sim.twins.values()].filter((tw) => tw.anim === "chop");
    let t = runUntil(sim, 0, () => cooks().length === 4, 30);
    expect(cooks()).toHaveLength(4);
    const waiting = [...sim.twins.values()].find((tw) => tw.anim !== "chop")!;
    run(sim, t, 1);
    t += 1;
    expect(waiting.task?.phase).toBe("wait");
    expect(sim.spots.some((s) => s.busyBy === waiting.id)).toBe(false);
    expect(sim.kitchenState().counters.every((l) => l === "steak")).toBe(true);
    // a station frees once its cook leaves the stove (60 s): the waiting twin takes it — nobody shares a spot
    for (let k = 0; k < 900 && waiting.anim !== "chop"; k++) {
      t = run(sim, t, 0.1);
      const held = sim.spots.filter((s) => s.busyBy).map((s) => `${s.busyBy}:${s.kind}`);
      expect(new Set(held).size).toBe(held.length);
      const owners = sim.spots.filter((s) => s.busyBy).map((s) => s.id);
      expect(new Set(owners).size).toBe(owners.length);
    }
    expect(waiting.anim).toBe("chop");
    expect(spotOf(sim, waiting.id)?.kind).toBe("counter");
  });

  it("'cook pasta with Sena': neighbouring stations, then seats across the table from each other", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "kitchen"), at("sena", "network_hub")), 0);
    sim.reconcile(world(
      at("memo", "kitchen", cook({ name: "pasta", look: "pasta" }, { targetName: "Sena" }, "2026-10-19T12:00:00Z", false)),
      at("sena", "network_hub")
    ), 0);
    const memo = sim.twins.get("memo")!;
    const sena = sim.twins.get("sena")!;
    let t = runUntil(sim, 0, () => memo.anim === "chop" && sena.anim === "chop", 60);
    const a = Number(spotOf(sim, "memo")!.id.split("-")[1]);
    const b = Number(spotOf(sim, "sena")!.id.split("-")[1]);
    expect(Math.abs(a - b)).toBe(1);
    expect(sim.kitchenState().counters.filter((l) => l === "pasta")).toHaveLength(2);
    t = runUntil(sim, t, () => memo.anim === "eat" && sena.anim === "eat" && memo.route.length === 0 && sena.route.length === 0, 140);
    const sa = spotOf(sim, "memo")!;
    const sb = spotOf(sim, "sena")!;
    expect(sa.kind).toBe("table");
    expect(sb.kind).toBe("table");
    expect(sa.id.slice(0, -1)).toBe(sb.id.slice(0, -1)); // table-1a / table-1b: across from each other
    expect(sa.id).not.toBe(sb.id);
    expect(avatarPose(sena, t)).toMatchObject({ item: "dish", dish: "pasta" });
  });

  it("walking inside the kitchen never cuts through the island or the table (a second meal, a cook stopped at the stove)", () => {
    for (const [first, look] of [["table", "pasta"], ["table", "drink"], ["stove", "steak"]] as const) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const sim = new VillageSim({ random: seeded(seed) });
        const ids = ["k1", "k2", "k3", "k4"];
        sim.reconcile(world(...ids.map((id) => at(id, "kitchen"))), 0);
        sim.reconcile(world(...ids.map((id) => at(id, "kitchen", cook({ name: look, look })))), 0);
        let t = runUntil(sim, 0, () => ids.every((id) => sim.twins.get(id)!.anim === (first === "table" ? "eat" : "stir")), 140);
        if (first === "table") t = runUntil(sim, t, () => ids.every((id) => sim.twins.get(id)!.task === null), 140);
        t = run(sim, t, 2);
        sim.reconcile(world(...ids.map((id) => at(id, "kitchen", cook({ name: look, look }, {}, "2026-10-19T12:30:00Z")))), t);
        for (let k = 0; k < 1600 && !ids.every((id) => sim.twins.get(id)!.anim === "eat"); k++) {
          t = run(sim, t, 0.05);
          for (const id of ids) {
            const tw = sim.twins.get(id)!;
            if (tw.route.length === 0) continue;
            expect(inside(tw, KITCHEN.island), `${first}/${look}/${seed}: ${id} in the island at ${t.toFixed(2)}`).toBe(false);
            expect(inside(tw, KITCHEN.table), `${first}/${look}/${seed}: ${id} on the table at ${t.toFixed(2)}`).toBe(false);
          }
        }
        expect(ids.every((id) => sim.twins.get(id)!.anim === "eat"), `${first}/${look}/${seed}`).toBe(true);
      }
    }
  });

  it("a new order mid-meal frees the whole station and the seat", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "kitchen")), 0);
    sim.reconcile(world(at("memo", "kitchen", cook({ name: "burger", look: "burger" }))), 0);
    const memo = sim.twins.get("memo")!;
    const t = runUntil(sim, 0, () => memo.anim === "chop", 30);
    sim.reconcile(world(at("memo", "kitchen")), t);
    expect(sim.spots.filter((s) => s.busyBy === "memo")).toHaveLength(0);
    expect(sim.kitchenState().counters.every((l) => l === null)).toBe(true);
  });
});

describe("the library", () => {
  it("read in the library: an armchair, seated, reading a book", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "network_hub")), 0);
    sim.reconcile(world(at("memo", "library", placeAct("read_library", "read", "library", 90, { item: "book" }))), 0);
    const memo = sim.twins.get("memo")!;
    const t = runUntil(sim, 0, () => memo.anim === "read" && memo.route.length === 0, 60);
    expect(spotOf(sim, "memo")?.kind).toBe("armchair");
    expect(avatarPose(memo, t)).toMatchObject({ anim: "read", seated: true, item: "book" });
    expect(bodyLift(memo)).toBeCloseTo(SEAT_Y.armchair - 0.25, 5);
  });

  it("study: a desk seat, seated, typing on a laptop", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(at("memo", "network_hub")), 0);
    sim.reconcile(world(at("memo", "library", placeAct("study", "type", "library", 120, { item: "laptop" }))), 0);
    const memo = sim.twins.get("memo")!;
    const t = runUntil(sim, 0, () => memo.anim === "type" && memo.route.length === 0, 60);
    const desk = spotOf(sim, "memo")!;
    expect(desk.kind).toBe("desk");
    expect(memo.yaw).toBeCloseTo(desk.yaw, 5);
    expect(avatarPose(memo, t)).toMatchObject({ anim: "type", seated: true, item: "laptop" });
    expect(bodyLift(memo)).toBeCloseTo(SEAT_Y.desk - 0.25, 5);
  });

  it("8 readers and students fill 4 armchairs and 4 desks, never sharing one", () => {
    const sim = new VillageSim({ random: seeded() });
    const ids = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"];
    sim.reconcile(world(...ids.map((id) => at(id, "library"))), 0);
    sim.reconcile(world(...ids.map((id, i) => at(id, "library", i % 2
      ? placeAct("study", "type", "library", 120, { item: "laptop" })
      : placeAct("read_library", "read", "library", 90, { item: "book" })))), 0);
    runUntil(sim, 0, () => [...sim.twins.values()].every((tw) => tw.task?.phase === "do"), 60);
    const held = sim.spots.filter((s) => s.zone === "library" && s.busyBy);
    expect(held).toHaveLength(8);
    expect(held.filter((s) => s.kind === "armchair")).toHaveLength(4);
    expect(held.filter((s) => s.kind === "desk")).toHaveLength(4);
  });
});
