import { describe, it, expect, vi } from "vitest";
import type { WorldState, WorldTwinView } from "@aivillage/shared";
import { DEFAULT_ZONES, DEFAULT_APPEARANCE } from "@aivillage/shared";
import { VillageSim, avatarPose, bodyLift, WALK_SPEED } from "../../lib/village/sim";
import { tileToWorld, SPOTS } from "../../lib/village/layout";

/** Deterministic PRNG so behaviour is repeatable. */
function seeded(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const view = (id: string, col: number, row: number, order: WorldTwinView["order"] = null): WorldTwinView => ({
  id, name: id[0].toUpperCase() + id.slice(1), colorHex: 0x5b8cff, col, row, say: null, flag: null, order,
  appearance: DEFAULT_APPEARANCE, isMain: false, pose: null
});
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

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
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
    sim.reconcile(world(view("memo", 3, 3)), 0);
    sim.reconcile(world(view("memo", 0, 5)), 0.1);
    const t = run(sim, 0.1, 1);
    expect(sim.twins.get("memo")!.mode).toBe("walk");
    run(sim, t, 20);
    expect(dist(sim.twins.get("memo")!, tileToWorld(0, 5))).toBeLessThan(0.01);
  });
});

describe("VillageSim owner orders", () => {
  it("go: walks to a seat at the venue, sits, and reports arrival once", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(view("memo", 3, 3)), 0);
    sim.reconcile(world(view("memo", 0, 5, goOrder("maker_space"))), 0);
    expect(sim.twins.get("memo")!.status).toBe("🚶 Heading to maker_space");
    run(sim, 0, 30);
    const memo = sim.twins.get("memo")!;
    const seat = SPOTS.find((s) => s.zone === "maker_space" && dist(s, memo) < 0.01);
    expect(seat).toBeDefined();
    expect(memo.mode).toBe("activity");
    expect(memo.anim).toBe("drink");
    expect(onOrderArrive).toHaveBeenCalledTimes(1);
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "☕ At THE CAFÉ");
    expect(memo.status).toBe("☕ At THE CAFÉ");
  });

  it("go: stays at the venue for as long as the order holds", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 0, 5, goOrder("maker_space"))), 0);
    run(sim, 0, 30);
    const seatedAt = { ...sim.twins.get("memo")! };
    run(sim, 30, 300);
    expect(dist(sim.twins.get("memo")!, seatedAt)).toBeLessThan(0.01);
  });

  it("go: server tile updates do not drag an ordered twin off its seat", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 0, 5, goOrder("maker_space"))), 0);
    run(sim, 0, 30);
    const seatedAt = { ...sim.twins.get("memo")! };
    sim.reconcile(world(view("memo", 1, 5, goOrder("maker_space"))), 30);
    run(sim, 30, 10);
    expect(dist(sim.twins.get("memo")!, seatedAt)).toBeLessThan(0.01);
  });

  it("go: takes the seat even if a free-roaming villager sits there", () => {
    const sim = new VillageSim({ random: seeded() });
    const benchSeats = SPOTS.filter((s) => s.zone === "network_hub");
    // fill every seat at the quiet corner with sitters, then order memo there
    sim.reconcile(world(view("memo", 3, 3), view("aiko", 6, 0), view("ravi", 6, 0)), 0);
    for (const [i, id] of ["aiko", "ravi"].entries()) sim.occupySpot(id, benchSeats[i].id, 0);
    sim.reconcile(world(view("memo", 6, 0, goOrder("network_hub")), view("aiko", 6, 0), view("ravi", 6, 0)), 1);
    run(sim, 1, 30);
    const memo = sim.twins.get("memo")!;
    expect(memo.mode).toBe("activity");
    expect(benchSeats.some((s) => dist(s, memo) < 0.01)).toBe(true);
  });

  it("free again: the twin goes back to roaming", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 0, 5, goOrder("maker_space"))), 0);
    run(sim, 0, 30);
    const seatedAt = { ...sim.twins.get("memo")! };
    sim.reconcile(world(view("memo", 0, 5, null)), 30);
    expect(sim.twins.get("memo")!.status).toBeNull();
    run(sim, 30, 90);
    expect(dist(sim.twins.get("memo")!, seatedAt)).toBeGreaterThan(0.05);
  });

  it("stay: arrives on the spot and never wanders", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(view("memo", 3, 3)), 0);
    const start = { ...sim.twins.get("memo")! };
    sim.reconcile(world(view("memo", 3, 3, { kind: "stay", zone: "plaza", targetName: null, label: "Staying at THE STAGE" })), 0);
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "📍 Staying at THE STAGE");
    run(sim, 0, 120);
    expect(dist(sim.twins.get("memo")!, start)).toBeLessThan(0.01);
  });

  it("talk_to: the target waits, the twin walks up to it and faces it", () => {
    const onOrderArrive = vi.fn();
    const sim = new VillageSim({ random: seeded(), onOrderArrive });
    sim.reconcile(world(view("memo", 0, 5), view("ravi", 6, 6)), 0);
    const raviStart = { ...sim.twins.get("ravi")! };
    sim.reconcile(world(view("memo", 6, 6, { kind: "talk_to", zone: "event_space", targetName: "Ravi", label: "Going to talk to Ravi" }), view("ravi", 6, 6)), 0);
    run(sim, 0, 30);
    const memo = sim.twins.get("memo")!;
    const ravi = sim.twins.get("ravi")!;
    expect(dist(ravi, raviStart)).toBeLessThan(0.01);
    expect(dist(memo, ravi)).toBeLessThan(1);
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "💬 Talking with Ravi");
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
});

// ---------------- v4: body animations, actions, saved poses ----------------

type Act = NonNullable<NonNullable<WorldTwinView["order"]>["action"]>;
const act = (a: Partial<Act> & Pick<Act, "id" | "anim">, zone = "plaza", issuedAt = "2026-10-17T12:00:00Z"): WorldTwinView["order"] => {
  const action: Act = { label: a.id, emoji: "✨", seconds: 4, place: null, targetName: null, ...a };
  return { kind: "act", zone, targetName: action.targetName, label: action.label, action, issuedAt };
};

describe("VillageSim body animations", () => {
  it("a walking twin reports a walk cycle; a standing one is idle", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(view("memo", 3, 3)), 0);
    expect(avatarPose(sim.twins.get("memo")!, 0)).toMatchObject({ anim: "idle", walking: false });
    sim.reconcile(world(view("memo", 0, 5)), 0.1);
    run(sim, 0.1, 2);
    expect(avatarPose(sim.twins.get("memo")!, 2.1)).toMatchObject({ walking: true });
  });

  it("venue activities pick a matching body animation", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(view("memo", 0, 5), view("aiko", 6, 0)), 0);
    sim.occupySpot("memo", SPOTS.find((s) => s.kind === "coffee")!.id, 0);
    sim.occupySpot("aiko", SPOTS.find((s) => s.kind === "bench")!.id, 0);
    expect(sim.twins.get("memo")!.anim).toBe("drink");
    expect(sim.twins.get("aiko")!.anim).toBe("sit");
  });

  it("animTime counts from when the animation started", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(view("memo", 0, 5)), 0);
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
    expect(onOrderArrive).toHaveBeenCalledWith("memo", "🦘 jump");
    run(sim, 1, 6);
    expect(memo.anim).toBe("idle");
    run(sim, 7, 60);
    expect(dist(memo, start)).toBeLessThan(0.01);
  });

  it("a placed action walks to its venue first (wash hands → the café)", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 3, 3)), 0);
    sim.reconcile(world(view("memo", 3, 3, act({ id: "wash_hands", anim: "wash", place: "maker_space", seconds: 6 }, "maker_space"))), 0);
    run(sim, 0, 1);
    expect(sim.twins.get("memo")!.mode).toBe("walk");
    let t = 1;
    for (let i = 0; i < 600 && sim.twins.get("memo")!.anim !== "wash"; i++) t = run(sim, t, 0.1);
    const memo = sim.twins.get("memo")!;
    expect(memo.anim).toBe("wash");
    expect(dist(memo, tileToWorld(0, 5))).toBeLessThan(1.5);
  });

  it("a social action: walks to the partner, both play it facing each other", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 0, 5), view("ravi", 6, 6)), 0);
    sim.reconcile(world(view("memo", 6, 6, act({ id: "hug", anim: "hug", emoji: "🤗", label: "hug", targetName: "Ravi", seconds: 5 }, "event_space")), view("ravi", 6, 6)), 0);
    let t = 0;
    for (let i = 0; i < 600 && sim.twins.get("memo")!.anim !== "hug"; i++) t = run(sim, t, 0.1);
    const memo = sim.twins.get("memo")!;
    const ravi = sim.twins.get("ravi")!;
    expect(memo.anim).toBe("hug");
    expect(ravi.anim).toBe("hug");
    expect(dist(memo, ravi)).toBeLessThan(0.8);
    const facing = Math.atan2(ravi.x - memo.x, ravi.z - memo.z);
    expect(Math.abs(Math.atan2(Math.sin(memo.yaw - facing), Math.cos(memo.yaw - facing)))).toBeLessThan(0.05);
    run(sim, t, 8);
    expect(ravi.anim).not.toBe("hug"); // the hug is over (Ravi may sit down nearby)
    expect(ravi.perform).toBeNull();
  });

  it("a refused social action: the partner says no, nobody hugs", () => {
    const sim = new VillageSim({ random: seeded() });
    sim.reconcile(world(view("memo", 5, 6), view("ravi", 6, 6)), 0);
    sim.reconcile(world(view("memo", 6, 6, act({ id: "kiss_cheek", anim: "kiss", label: "kiss on the cheek", targetName: "Ravi", refused: true }, "event_space")), view("ravi", 6, 6)), 0);
    let t = 0;
    for (let i = 0; i < 600 && sim.twins.get("ravi")!.bubble !== "🙅"; i++) t = run(sim, t, 0.1);
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
  it("a twin starts exactly where it was saved and stays there", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    const v = { ...view("memo", 3, 3), pose: { x: 1.25, z: -2.5, yaw: 1.1, zone: "network_hub" } };
    sim.reconcile(world(v), 0);
    run(sim, 0, 5);
    const memo = sim.twins.get("memo")!;
    expect({ x: memo.x, z: memo.z, yaw: memo.yaw }).toEqual({ x: 1.25, z: -2.5, yaw: 1.1 });
  });

  it("poses() reports where everyone is, with the nearest venue", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(view("memo", 0, 5), view("ravi", 6, 6)), 0);
    const poses = sim.poses();
    expect(poses).toHaveLength(2);
    expect(poses.find((p) => p.id === "memo")).toMatchObject({ ...tileToWorld(0, 5), zone: "maker_space" });
    expect(poses.find((p) => p.id === "ravi")).toMatchObject({ zone: "event_space" });
  });
});

describe("VillageSim v4: the AI decides where twins go", () => {
  it("idle twins stay around their venue — no random strolls across the island", () => {
    const sim = new VillageSim({ random: seeded(3) });
    sim.reconcile(world(view("memo", 6, 0)), 0);
    const home = tileToWorld(6, 0);
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
  it("sitting on the ground (blanket, or 'sit' anywhere) lowers the body to the grass; seats do not", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(view("memo", 6, 6), view("aiko", 6, 0), view("ravi", 3, 3)), 0);
    sim.occupySpot("memo", SPOTS.find((s) => s.kind === "blanket")!.id, 0);
    sim.occupySpot("aiko", SPOTS.find((s) => s.kind === "bench")!.id, 0);
    expect(bodyLift(sim.twins.get("memo")!)).toBeLessThan(-0.15);
    expect(bodyLift(sim.twins.get("aiko")!)).toBe(0);
    expect(bodyLift(sim.twins.get("ravi")!)).toBe(0);
    sim.reconcile(world(view("memo", 6, 6), view("aiko", 6, 0), view("ravi", 3, 3, act({ id: "sit", anim: "sit", seconds: 20 }))), 1);
    run(sim, 1, 0.5);
    expect(bodyLift(sim.twins.get("ravi")!)).toBeLessThan(-0.15);
  });

  it("the walk cycle follows the distance walked, so feet don't slide", () => {
    const sim = new VillageSim({ random: seeded(), ambient: false });
    sim.reconcile(world(view("memo", 3, 3), view("aiko", 3, 3)), 0);
    sim.reconcile(world(view("memo", 0, 5), view("aiko", 6, 6)), 0.1);
    run(sim, 0.1, 1.5);
    const before = [...sim.twins.values()].map((tw) => ({ tw, x: tw.x, z: tw.z, ph: tw.walkPhase }));
    run(sim, 1.6, 0.3, 0.01); // short and straight: no corner inside the window
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
