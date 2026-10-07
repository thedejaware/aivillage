import { describe, it, expect } from "vitest";
import type { Twin } from "@aivillage/shared";
import { ORDER_HOLD_MS } from "@aivillage/shared";
import { parseCommand, applyCommand, commandAck } from "../../src/chat/commands.js";

const VILLAGERS = ["Ravi", "Aiko", "Daniel Park"];

describe("parseCommand: go", () => {
  it.each([
    ["go to the cafe", "maker_space"],
    ["Go to THE LAWN", "event_space"],
    ["walk to the stage please", "plaza"],
    ["head over to the quiet corner", "network_hub"],
    ["can you go to the café?", "maker_space"],
    ["please run to the lawn!", "event_space"],
    ["Hey Memo, go to the cafe and grab a coffee", "maker_space"],
    ["kafeye git", "maker_space"]
  ])("%s → %s", (msg, zone) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual({ type: "go", zone });
  });

  it("ignores places that do not exist", () => {
    expect(parseCommand("go to the moon", VILLAGERS)).toBeNull();
  });

  it("ignores the owner talking about themselves", () => {
    expect(parseCommand("I want to go to the cafe tomorrow", VILLAGERS)).toBeNull();
    expect(parseCommand("we went to the lawn yesterday", VILLAGERS)).toBeNull();
  });

  it("ignores plain chat", () => {
    expect(parseCommand("how was your day?", VILLAGERS)).toBeNull();
    expect(parseCommand("I love coffee", VILLAGERS)).toBeNull();
  });
});

describe("parseCommand: talk_to", () => {
  it.each([
    ["talk to Ravi", "Ravi"],
    ["go talk to aiko", "Aiko"],
    ["say hi to Ravi", "Ravi"],
    ["chat with Daniel Park about the party", "Daniel Park"],
    ["go to Aiko", "Aiko"],
    ["Ravi ile konuş", "Ravi"]
  ])("%s → %s", (msg, name) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual({ type: "talk_to", targetName: name });
  });

  it("ignores unknown people", () => {
    expect(parseCommand("talk to Gandalf", VILLAGERS)).toBeNull();
  });
});

describe("parseCommand: stay / free", () => {
  it.each(["stay here", "wait here for me", "don't move", "stop!", "burada kal"])("%s → stay", (msg) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual({ type: "stay" });
  });
  it.each(["do whatever you want", "you're free now", "go live your life", "back to normal"])("%s → free", (msg) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual({ type: "free" });
  });
});

const NOW = new Date("2026-10-06T12:00:00Z");
const me: Twin = {
  id: "me", ownerUserId: "u1", name: "Memo", traits: [], goals: [], avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 }, reputation: 0,
  locationZone: "plaza", energy: 5, energyUpdatedAt: NOW.toISOString(), isNpc: false
};
const ravi: Twin = { ...me, id: "ravi", ownerUserId: null, name: "Ravi", locationZone: "event_space", isNpc: true };

describe("applyCommand", () => {
  it("go: moves the twin and creates a held order", () => {
    const out = applyCommand(me, { type: "go", zone: "maker_space" }, [me, ravi], NOW);
    expect(out.twin.locationZone).toBe("maker_space");
    expect(out.twin.order).toMatchObject({ kind: "go", zone: "maker_space", targetName: null, label: "Heading to THE CAFÉ" });
    expect(Date.parse(out.twin.order!.holdUntil) - NOW.getTime()).toBe(ORDER_HOLD_MS);
    expect(out.target).toBeNull();
  });

  it("talk_to: goes to wherever the target is", () => {
    const out = applyCommand(me, { type: "talk_to", targetName: "Ravi" }, [me, ravi], NOW);
    expect(out.twin.locationZone).toBe("event_space");
    expect(out.twin.order).toMatchObject({ kind: "talk_to", zone: "event_space", targetName: "Ravi", label: "Going to talk to Ravi" });
    expect(out.target?.id).toBe("ravi");
  });

  it("talk_to an unknown name does nothing", () => {
    const out = applyCommand(me, { type: "talk_to", targetName: "Nobody" }, [me, ravi], NOW);
    expect(out.twin).toBe(me);
    expect(out.changed).toBe(false);
  });

  it("stay: holds the current zone", () => {
    const out = applyCommand(me, { type: "stay" }, [me, ravi], NOW);
    expect(out.twin.locationZone).toBe("plaza");
    expect(out.twin.order).toMatchObject({ kind: "stay", zone: "plaza", label: "Staying at THE STAGE" });
  });

  it("free: clears the order", () => {
    const busy = applyCommand(me, { type: "stay" }, [me, ravi], NOW).twin;
    const out = applyCommand(busy, { type: "free" }, [busy, ravi], NOW);
    expect(out.twin.order).toBeNull();
    expect(out.changed).toBe(true);
  });
});

describe("commandAck", () => {
  it("writes a short in-character confirmation", () => {
    expect(commandAck("Memo", { type: "go", zone: "maker_space" })).toContain("THE CAFÉ");
    expect(commandAck("Memo", { type: "talk_to", targetName: "Ravi" })).toContain("Ravi");
    expect(commandAck("Memo", { type: "stay" }).length).toBeGreaterThan(0);
    expect(commandAck("Memo", { type: "free" }).length).toBeGreaterThan(0);
  });
});
