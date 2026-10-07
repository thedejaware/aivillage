import { describe, it, expect } from "vitest";
import type { Twin, OwnerOrder } from "../src/index.js";
import { isOrderActive, orderStatus, toWorldState, DEFAULT_ZONES } from "../src/index.js";

const NOW = new Date("2026-10-06T12:00:00Z");

const order = (holdUntil: string): OwnerOrder => ({
  kind: "go",
  zone: "maker_space",
  targetName: null,
  label: "Heading to THE CAFÉ",
  issuedAt: "2026-10-06T11:55:00Z",
  holdUntil
});

const twin = (o: OwnerOrder | null): Twin => ({
  id: "t1",
  ownerUserId: "u1",
  name: "Memo",
  traits: [],
  goals: [],
  avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0,
  locationZone: "maker_space",
  energy: 5,
  energyUpdatedAt: NOW.toISOString(),
  isNpc: false,
  order: o
});

describe("isOrderActive", () => {
  it("is false for no order", () => {
    expect(isOrderActive(null, NOW)).toBe(false);
    expect(isOrderActive(undefined, NOW)).toBe(false);
  });
  it("is true while the hold has not expired", () => {
    expect(isOrderActive(order("2026-10-06T12:05:00Z"), NOW)).toBe(true);
  });
  it("is false once the hold has expired", () => {
    expect(isOrderActive(order("2026-10-06T11:59:59Z"), NOW)).toBe(false);
  });
});

describe("toWorldState order view", () => {
  it("exposes an active owner order on the twin view", () => {
    const ws = toWorldState({ zones: DEFAULT_ZONES, twins: [twin(order("2026-10-06T12:05:00Z"))], structures: [], now: NOW });
    expect(ws.twins[0].order).toEqual({ kind: "go", zone: "maker_space", targetName: null, label: "Heading to THE CAFÉ" });
  });
  it("hides an expired order", () => {
    const ws = toWorldState({ zones: DEFAULT_ZONES, twins: [twin(order("2026-10-06T11:00:00Z"))], structures: [], now: NOW });
    expect(ws.twins[0].order).toBeNull();
  });
  it("is null for twins without an order", () => {
    const ws = toWorldState({ zones: DEFAULT_ZONES, twins: [twin(null)], structures: [], now: NOW });
    expect(ws.twins[0].order).toBeNull();
  });
});

describe("orderStatus", () => {
  const go = { kind: "go" as const, zone: "maker_space", targetName: null, label: "Heading to THE CAFÉ" };
  const talk = { kind: "talk_to" as const, zone: "event_space", targetName: "Ravi", label: "Going to talk to Ravi" };
  const stay = { kind: "stay" as const, zone: "plaza", targetName: null, label: "Staying at THE STAGE" };

  it("shows the walk while on the way", () => {
    expect(orderStatus(go, false)).toBe("🚶 Heading to THE CAFÉ");
    expect(orderStatus(talk, false)).toBe("🚶 Going to talk to Ravi");
  });
  it("shows what the twin is doing once it arrived", () => {
    expect(orderStatus(go, true)).toBe("☕ At THE CAFÉ");
    expect(orderStatus({ ...go, zone: "event_space" }, true)).toBe("🌸 At THE LAWN");
    expect(orderStatus(talk, true)).toBe("💬 Talking with Ravi");
  });
  it("stay is the same before and after", () => {
    expect(orderStatus(stay, false)).toBe("📍 Staying at THE STAGE");
    expect(orderStatus(stay, true)).toBe("📍 Staying at THE STAGE");
  });
});

describe("toWorldState asOf", () => {
  it("stamps the snapshot with the time its data was read", () => {
    const ws = toWorldState({ zones: DEFAULT_ZONES, twins: [twin(null)], structures: [], now: NOW });
    expect(ws.asOf).toBe("2026-10-06T12:00:00.000Z");
  });
});
