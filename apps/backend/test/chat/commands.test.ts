import { describe, it, expect } from "vitest";
import type { Twin } from "@aivillage/shared";
import { ORDER_HOLD_MS, actHoldMs, findAction, kitchenEnergyPhases, KITCHEN_DISHES } from "@aivillage/shared";
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

  it("starting an activity sets the energy it moves toward (slowly, after arrival) and holds for its own length", () => {
    const fresh = { ...me, stamina: 80 };
    const swim = applyCommand(fresh, { type: "act", action: "swim", target: null }, all(fresh), NOW);
    expect(swim.twin.stamina).toBe(80); // nothing changes during the walk
    expect(swim.twin.order).toMatchObject({ kind: "act", zone: "pool", action: { id: "swim" }, energyTo: 68 });
    expect(Date.parse(swim.twin.order!.holdUntil) - NOW.getTime()).toBe(actHoldMs(findAction("swim")!));
    expect(applyCommand({ ...me, stamina: 50 }, { type: "act", action: "drink_coffee", target: null }, all(me), NOW).twin.order!.energyTo).toBe(65);
    expect(applyCommand({ ...me, stamina: 50 }, { type: "go", zone: "home" }, all(me), NOW).twin.order!.energyTo).toBe(100);
    expect(applyCommand({ ...me, stamina: 50 }, { type: "go", zone: "gym" }, all(me), NOW).twin.order!.energyTo).toBe(38);
  });

  it("a twin without stored energy counts as rested", () => {
    expect(applyCommand(me, { type: "act", action: "ride_coaster", target: null }, all(me), NOW).twin.order!.energyTo).toBe(92);
  });

  it("a tired twin refuses tiring orders with the exact line and goes to rest instead", () => {
    const tired = { ...me, stamina: 15 };
    for (const cmd of [{ type: "act" as const, action: "swim", target: null }, { type: "go" as const, zone: "gym" }, { type: "act" as const, action: "watch_movie", target: "Sena" }]) {
      const out = applyCommand(tired, cmd, all(tired), NOW, () => 50, () => 0.1);
      expect(out.reply).toBe("I'm tired, let me rest first.");
      expect(out.changed).toBe(true);
      expect(out.target).toBeNull();
      // tired twins go home to sleep (rest elsewhere is slow now)
      expect(out.twin.order).toMatchObject({ kind: "act", auto: true, zone: "home", action: { id: "sleep" } });
      expect(out.twin.order!.energyTo).toBe(100);
    }
  });

  it("an exhausted twin goes home to sleep", () => {
    const out = applyCommand({ ...me, stamina: 5 }, { type: "act", action: "ride_bike", target: null }, all(me), NOW, () => 0, () => 0.9);
    expect(out.reply).toBe("I'm tired, let me rest first.");
    expect(out.twin.order).toMatchObject({ zone: "home", auto: true, action: { id: "sleep" } });
    expect(out.twin.order!.energyTo).toBe(100);
  });

  it("restful orders always work, even when tired", () => {
    const tired = { ...me, stamina: 10 };
    const nap = applyCommand(tired, { type: "act", action: "sleep", target: null }, all(tired), NOW);
    expect(nap.reply).toBeUndefined();
    expect(nap.twin.order).toMatchObject({ zone: "home", action: { id: "sleep" } });
    expect(nap.twin.order!.auto).toBeFalsy();
    const lawn = applyCommand(tired, { type: "go", zone: "event_space" }, all(tired), NOW);
    expect(lawn.reply).toBeUndefined();
    expect(lawn.twin.order!.energyTo).toBe(20);
    expect(applyCommand(tired, { type: "act", action: "hug", target: "Ravi" }, all(tired), NOW, () => 50).reply).toBeUndefined();
  });

  it("going home means going to bed: the twin goes inside and sleeps", () => {
    for (const text of ["go home", "go to the house", "go home and sleep", "rest at home", "sleep"]) {
      const cmd = parseCommand(text, ["Ravi", "Sena"]);
      expect(cmd, text).not.toBeNull();
      const out = applyCommand({ ...me, stamina: 40 }, cmd!, all(me), NOW);
      expect(out.twin.order, text).toMatchObject({ kind: "act", zone: "home", action: { id: "sleep" }, energyTo: 100 });
    }
    // the plain command too (the AI's chat replies use it)
    expect(applyCommand(me, { type: "go", zone: "home" }, all(me), NOW).twin.order).toMatchObject({ kind: "act", action: { id: "sleep" } });
  });

  it("a new order keeps the energy gained so far", () => {
    const sleeping = { ...me, stamina: 30, order: { kind: "act" as const, zone: "home", targetName: null, label: "sleep", issuedAt: new Date(NOW.getTime() - 120_000).toISOString(), holdUntil: new Date(NOW.getTime() + 600_000).toISOString(), energyTo: 100, arrivedAt: new Date(NOW.getTime() - 100_000).toISOString() } };
    const out = applyCommand(sleeping, { type: "go", zone: "event_space" }, all(sleeping), NOW);
    expect(out.twin.stamina).toBe(55); // 100 s asleep → +25
    expect(out.twin.order!.energyTo).toBe(65);
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

describe("parseCommand: the kitchen", () => {
  const cook = (name: string, look: string, target: string | null = null) =>
    ({ type: "act", action: "cook", target, dish: { name, look } });

  it.each([
    ["cook pasta", cook("pasta", "pasta")],
    ["cook me pasta", cook("pasta", "pasta")],
    ["please cook some spaghetti", cook("spaghetti", "pasta")],
    ["make a hamburger", cook("hamburger", "burger")],
    ["prepare a steak", cook("steak", "steak")],
    ["bake a cake", cook("cake", "dessert")],
    ["make a smoothie", cook("smoothie", "drink")],
    ["make juice in the kitchen", cook("juice", "drink")],
    ["cook sushi", cook("sushi", "plate")],
    ["cook pasta with Sena", cook("pasta", "pasta", "Sena")],
    ["make pasta in the kitchen with ravi", cook("pasta", "pasta", "Ravi")]
  ])("%s → cook", (msg, cmd) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual(cmd);
  });

  it("no dish named → the twin picks one later", () => {
    for (const msg of ["cook", "cook something", "cook a meal", "cook dinner", "go to the kitchen", "eat in the kitchen", "make food"]) {
      expect(parseCommand(msg, VILLAGERS), msg).toEqual({ type: "act", action: "cook", target: null });
    }
    expect(parseCommand("cook with Sena", VILLAGERS)).toEqual({ type: "act", action: "cook", target: "Sena" });
    expect(parseCommand("take Sena to the kitchen", VILLAGERS)).toEqual({ type: "act", action: "cook", target: "Sena" });
  });

  it("the café keeps all its words", () => {
    for (const [msg, id] of [
      ["juice", "drink_juice"], ["make juice", "drink_juice"], ["drink juice", "drink_juice"], ["have a juice", "drink_juice"],
      ["eat", "eat"], ["have lunch", "eat"], ["have dinner", "eat"], ["coffee", "drink_coffee"]
    ]) {
      expect(parseCommand(msg, VILLAGERS), msg).toEqual({ type: "act", action: id, target: null });
    }
  });

  it("other 'make' phrases are not cooking", () => {
    expect(parseCommand("make a phone call", VILLAGERS)).toEqual({ type: "act", action: "phone_call", target: null });
    expect(parseCommand("make a wish", VILLAGERS)).toBeNull();
    expect(parseCommand("I cooked pasta yesterday", VILLAGERS)).toBeNull();
    expect(parseCommand("I went to the kitchen", VILLAGERS)).toBeNull();
  });
});

describe("parseCommand: the library", () => {
  it.each([
    ["read in the library", "read_library"],
    ["go to the library", "read_library"],
    ["read a book in the library", "read_library"],
    ["study", "study"],
    ["do homework", "study"],
    ["work on the laptop", "study"],
    ["study in the library", "study"],
    ["read a book", "read"],
    ["work out", "work_out"]
  ])("%s → %s", (msg, action) => {
    expect(parseCommand(msg, VILLAGERS)).toEqual({ type: "act", action, target: null });
  });

  it("'take Sena to the library'", () => {
    expect(parseCommand("take Sena to the library", VILLAGERS)).toEqual({ type: "act", action: "read_library", target: "Sena" });
  });
});

describe("applyCommand: the kitchen", () => {
  const sena: Twin = { ...ravi, id: "sena", name: "Sena", locationZone: "maker_space" };
  const all = (t: Twin) => [t, ravi, sena];
  const cookPasta = { type: "act" as const, action: "cook", target: null, dish: { name: "pasta", look: "pasta" as const } };

  it("a cook order carries the dish and the kitchen's energy phases, not energyTo", () => {
    const out = applyCommand({ ...me, stamina: 60 }, cookPasta, all(me), NOW);
    const o = out.twin.order!;
    expect(o).toMatchObject({ kind: "act", zone: "kitchen", action: { id: "cook", dish: { name: "pasta", look: "pasta" } } });
    expect(o.action!.label).toContain("pasta");
    expect(o.energyPhases).toEqual(kitchenEnergyPhases("pasta"));
    expect(o.energyTo ?? null).toBeNull();
    expect(Date.parse(o.holdUntil) - NOW.getTime()).toBe(actHoldMs(findAction("cook")!));
    expect(out.twin.locationZone).toBe("kitchen");
  });

  it("'cook sushi': the label says sushi, the look is a plain plate", () => {
    const out = applyCommand(me, parseCommand("cook sushi", VILLAGERS)!, all(me), NOW);
    expect(out.twin.order!.action!.dish).toEqual({ name: "sushi", look: "plate" });
    expect(out.twin.order!.label).toContain("sushi");
  });

  it("no dish named → a dish from the menu", () => {
    const out = applyCommand(me, { type: "act", action: "cook", target: null }, all(me), NOW, () => 0, () => 0);
    expect(out.twin.order!.action!.dish).toEqual(KITCHEN_DISHES[0]);
    expect(out.twin.order!.energyPhases).toEqual(kitchenEnergyPhases(KITCHEN_DISHES[0].look));
  });

  it("a tired twin asked to cook says the exact line and goes home to sleep", () => {
    const out = applyCommand({ ...me, stamina: 15 }, cookPasta, all(me), NOW);
    expect(out.reply).toBe("I'm tired, let me rest first.");
    expect(out.twin.order).toMatchObject({ zone: "home", auto: true, action: { id: "sleep" } });
  });

  it("'cook pasta with Sena': Sena comes along to the kitchen and cooks the same dish", () => {
    const out = applyCommand(me, parseCommand("cook pasta with Sena", VILLAGERS)!, all(me), NOW, () => 20);
    expect(out.target?.id).toBe("sena");
    expect(out.twin.order).toMatchObject({ zone: "kitchen", targetName: "Sena", action: { id: "cook", targetName: "Sena", dish: { name: "pasta" } } });
  });

  it("a full kitchen (4 cooking) can't take a 5th twin", () => {
    const cooks = [1, 2, 3, 4].map((i) => ({
      ...ravi, id: `c${i}`, name: `C${i}`,
      order: { kind: "act" as const, zone: "kitchen", targetName: null, label: "cook", issuedAt: NOW.toISOString(), holdUntil: new Date(NOW.getTime() + 60_000).toISOString() }
    }));
    const out = applyCommand(me, cookPasta, [me, ...cooks], NOW);
    expect(out.changed).toBe(false);
    expect(out.refusal).toMatch(/kitchen is full/);
  });

  it("the library: energyTo as usual (reading up, studying down)", () => {
    const read = applyCommand({ ...me, stamina: 50 }, { type: "act", action: "read_library", target: null }, all(me), NOW);
    expect(read.twin.order).toMatchObject({ zone: "library", energyTo: 52 });
    const study = applyCommand({ ...me, stamina: 50 }, { type: "act", action: "study", target: null }, all(me), NOW);
    expect(study.twin.order).toMatchObject({ zone: "library", energyTo: 48 });
    expect(study.twin.order!.energyPhases ?? null).toBeNull();
  });

  it("a tired twin asked to study goes home; reading is fine", () => {
    expect(applyCommand({ ...me, stamina: 15 }, { type: "act", action: "study", target: null }, all(me), NOW).reply).toBe("I'm tired, let me rest first.");
    expect(applyCommand({ ...me, stamina: 15 }, { type: "act", action: "read_library", target: null }, all(me), NOW).reply).toBeUndefined();
  });
});

describe("commandAck: cooking", () => {
  it("names the dish", () => {
    expect(commandAck("Memo", { type: "act", action: "cook", target: null, dish: { name: "pasta", look: "pasta" } })).toContain("On it — cooking pasta!");
    expect(commandAck("Memo", { type: "act", action: "study", target: null })).toMatch(/On it — study/);
  });
});
