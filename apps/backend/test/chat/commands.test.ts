import { describe, it, expect } from "vitest";
import type { Twin } from "@aivillage/shared";
import { ORDER_HOLD_MS, actHoldMs, findAction } from "@aivillage/shared";
import { parseCommand, applyCommand, commandAck, normalizeZone } from "../../src/chat/commands.js";

const VILLAGERS = ["Ravi", "Aiko", "Daniel Park", "Sena"];

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

describe("parseCommand: actions", () => {
  it.each([
    ["jump!", "jump", null],
    ["please wave", "wave", null],
    ["can you dance?", "dance", null],
    ["wash your hands", "wash_hands", null],
    ["hug Ravi", "hug", "Ravi"],
    ["give aiko a hug", "hug", "Aiko"],
    ["kiss Ravi on the cheek", "kiss_cheek", "Ravi"],
    ["high five Daniel Park", "high_five", "Daniel Park"],
    ["take a nap", "sleep", null],
    ["drink coffee", "drink_coffee", null]
  ])("%s → %s", (msg, action, target) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual({ type: "act", action, target });
  });

  it("'tell X …' passes a message on", () => {
    expect(parseCommand("tell Ravi dinner is ready", VILLAGERS)).toEqual({ type: "talk_to", targetName: "Ravi", message: "dinner is ready" });
  });

  it("the owner describing their own day is not an order", () => {
    expect(parseCommand("I will dance tonight", VILLAGERS)).toBeNull();
    expect(parseCommand("we hugged yesterday", VILLAGERS)).toBeNull();
  });
});

describe("applyCommand: act", () => {
  const feelings = (score: number) => () => score;

  it("a solo action is performed where the twin is", () => {
    const out = applyCommand(me, { type: "act", action: "jump", target: null }, [me, ravi], NOW);
    expect(out.changed).toBe(true);
    expect(out.twin.order).toMatchObject({ kind: "act", zone: "plaza", targetName: null, action: { id: "jump", anim: "jump" } });
    expect(Date.parse(out.twin.order!.holdUntil) - NOW.getTime()).toBe(actHoldMs(findAction("jump")!));
  });

  it("a placed action walks to its place first (wash hands → the café)", () => {
    const out = applyCommand(me, { type: "act", action: "wash_hands", target: null }, [me, ravi], NOW);
    expect(out.twin.order).toMatchObject({ zone: "maker_space", action: { id: "wash_hands" } });
    expect(out.twin.locationZone).toBe("maker_space");
  });

  it("a social action goes to the partner, who agrees when they like the twin", () => {
    const out = applyCommand(me, { type: "act", action: "hug", target: "Ravi" }, [me, ravi], NOW, feelings(30));
    expect(out.target?.id).toBe("ravi");
    expect(out.twin.order).toMatchObject({ zone: "event_space", targetName: "Ravi", action: { id: "hug", refused: false } });
  });

  it("…and refuses when they don't", () => {
    const out = applyCommand(me, { type: "act", action: "kiss_cheek", target: "Ravi" }, [me, ravi], NOW, feelings(-50));
    expect(out.twin.order!.action).toMatchObject({ refused: true });
  });

  it("unsafe or impossible requests change nothing and explain why", () => {
    const out = applyCommand(me, { type: "act", action: "punch", target: "Ravi" }, [me, ravi], NOW);
    expect(out.changed).toBe(false);
    expect(out.refusal).toMatch(/violence/);
    const fly = applyCommand(me, { type: "act", action: "fly", target: null }, [me, ravi], NOW);
    expect(fly.changed).toBe(false);
  });

  it("an unknown action becomes a mime", () => {
    const out = applyCommand(me, { type: "act", action: "play guitar", target: null, emoji: "🎸" }, [me, ravi], NOW);
    expect(out.twin.order!.action).toMatchObject({ id: "mime", label: "play guitar", emoji: "🎸" });
  });

  it("a social action with an unknown partner changes nothing", () => {
    const out = applyCommand(me, { type: "act", action: "hug", target: "Nobody" }, [me, ravi], NOW);
    expect(out.changed).toBe(false);
  });
});

describe("commandAck: act", () => {
  it("confirms actions and passes on messages", () => {
    expect(commandAck("Memo", { type: "act", action: "jump", target: null })).toMatch(/jump/i);
    expect(commandAck("Memo", { type: "talk_to", targetName: "Ravi", message: "dinner is ready" })).toContain("Ravi");
  });
});

describe("parseCommand: Main Street places", () => {
  it.each([
    ["go swimming", "swim", null],
    ["work out", "work_out", null],
    ["go to the gym", "work_out", null],
    ["ride a bike", "ride_bike", null],
    ["watch a movie", "watch_movie", null],
    ["take Sena to the cinema", "watch_movie", "Sena"],
    ["please take ravi to the pool", "swim", "Ravi"],
    ["take Aiko swimming", "swim", "Aiko"],
    ["go swimming with Sena", "swim", "Sena"],
    ["ride the rollercoaster", "ride_coaster", null],
    ["pick vegetables", "garden", null],
    ["garden", "garden", null],
    ["make juice", "drink_juice", null],
    ["go home", "sleep", null],
    ["go to sleep", "sleep", null],
    ["sunbathe", "sunbathe", null]
  ])("%s → %s", (msg, action, target) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual({ type: "act", action, target });
  });

  it("'run to X' is still a walk, 'run' alone is the treadmill", () => {
    expect(parseCommand("run to the cafe", VILLAGERS)).toEqual({ type: "go", zone: "maker_space" });
    expect(parseCommand("run", VILLAGERS)).toEqual({ type: "act", action: "run", target: null });
  });

  it("going to a new place by name", () => {
    expect(parseCommand("go to the garden", VILLAGERS)).toEqual({ type: "go", zone: "garden" });
    expect(parseCommand("walk to the house", VILLAGERS)).toEqual({ type: "go", zone: "home" });
  });
});

describe("normalizeZone: new places", () => {
  it.each([
    ["gym", "gym"], ["the pool", "pool"], ["cinema", "cinema"], ["the movies", "cinema"], ["garden", "garden"],
    ["home", "home"], ["the house", "home"], ["coaster", "funfair"], ["rollercoaster", "funfair"], ["roller coaster", "funfair"],
    ["funfair", "funfair"], ["lunapark", "funfair"], ["bike", "bike_rack"], ["the bikes", "bike_rack"], ["THE ROLLERCOASTER", "funfair"]
  ])("%s → %s", (raw, zone) => {
    expect(normalizeZone(raw)).toBe(zone);
  });
});

describe("applyCommand: energy", () => {
  const sena: Twin = { ...ravi, id: "sena", name: "Sena", locationZone: "maker_space" };
  const all = (t: Twin) => [t, ravi, sena];

  it("starting an activity spends (or restores) energy and holds for its own length", () => {
    const fresh = { ...me, stamina: 80 };
    const swim = applyCommand(fresh, { type: "act", action: "swim", target: null }, all(fresh), NOW);
    expect(swim.twin.stamina).toBe(55);
    expect(swim.twin.order).toMatchObject({ kind: "act", zone: "pool", action: { id: "swim" } });
    expect(Date.parse(swim.twin.order!.holdUntil) - NOW.getTime()).toBe(actHoldMs(findAction("swim")!));
    expect(applyCommand({ ...me, stamina: 50 }, { type: "act", action: "drink_coffee", target: null }, all(me), NOW).twin.stamina).toBe(65);
    expect(applyCommand({ ...me, stamina: 50 }, { type: "go", zone: "home" }, all(me), NOW).twin.stamina).toBe(100);
    expect(applyCommand({ ...me, stamina: 50 }, { type: "go", zone: "gym" }, all(me), NOW).twin.stamina).toBe(25);
  });

  it("a twin without stored energy counts as rested", () => {
    expect(applyCommand(me, { type: "act", action: "ride_coaster", target: null }, all(me), NOW).twin.stamina).toBe(85);
  });

  it("a tired twin refuses tiring orders with the exact line and goes to rest instead", () => {
    const tired = { ...me, stamina: 15 };
    for (const cmd of [{ type: "act" as const, action: "swim", target: null }, { type: "go" as const, zone: "gym" }, { type: "act" as const, action: "watch_movie", target: "Sena" }]) {
      const out = applyCommand(tired, cmd, all(tired), NOW, () => 50, () => 0.1);
      expect(out.reply).toBe("I'm tired, let me rest first.");
      expect(out.changed).toBe(true);
      expect(out.target).toBeNull();
      expect(out.twin.order).toMatchObject({ kind: "act", auto: true, zone: "maker_space" });
      expect(out.twin.stamina).toBeGreaterThan(15);
    }
  });

  it("an exhausted twin goes home to sleep", () => {
    const out = applyCommand({ ...me, stamina: 5 }, { type: "act", action: "ride_bike", target: null }, all(me), NOW, () => 0, () => 0.9);
    expect(out.reply).toBe("I'm tired, let me rest first.");
    expect(out.twin.order).toMatchObject({ zone: "home", auto: true, action: { id: "sleep" } });
    expect(out.twin.stamina).toBe(100);
  });

  it("restful orders always work, even when tired", () => {
    const tired = { ...me, stamina: 10 };
    const nap = applyCommand(tired, { type: "act", action: "sleep", target: null }, all(tired), NOW);
    expect(nap.reply).toBeUndefined();
    expect(nap.twin.order).toMatchObject({ zone: "home", action: { id: "sleep" } });
    expect(nap.twin.order!.auto).toBeFalsy();
    const lawn = applyCommand(tired, { type: "go", zone: "event_space" }, all(tired), NOW);
    expect(lawn.reply).toBeUndefined();
    expect(lawn.twin.stamina).toBe(20);
    expect(applyCommand(tired, { type: "act", action: "hug", target: "Ravi" }, all(tired), NOW, () => 50).reply).toBeUndefined();
  });

  it("'take Sena to the cinema': both meet AT the cinema, not where Sena is", () => {
    const out = applyCommand(me, { type: "act", action: "watch_movie", target: "Sena" }, all(me), NOW, () => 20);
    expect(out.target?.id).toBe("sena");
    expect(out.twin.locationZone).toBe("cinema");
    expect(out.twin.order).toMatchObject({ zone: "cinema", targetName: "Sena", action: { id: "watch_movie", targetName: "Sena" } });
  });

  it("…and when Sena says no, the twin goes alone", () => {
    const out = applyCommand(me, { type: "act", action: "watch_movie", target: "Sena" }, all(me), NOW, () => -60);
    expect(out.twin.order).toMatchObject({ zone: "cinema", targetName: null });
    expect(out.declinedBy?.id).toBe("sena");
  });
});
