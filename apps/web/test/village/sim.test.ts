import { describe, it, expect, vi } from "vitest";
import type { WorldState, WorldTwinView } from "@aivillage/shared";
import { DEFAULT_ZONES } from "@aivillage/shared";
import { VillageSim } from "../../lib/village/sim";
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
  id, name: id[0].toUpperCase() + id.slice(1), colorHex: 0x5b8cff, col, row, say: null, flag: null, order
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
    expect(memo.cupVisible).toBe(true);
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
