import { describe, it, expect, vi } from "vitest";
import { PLACES, PLAN_STEPS, type LlmClient, type Twin, type OwnerOrder } from "@aivillage/shared";
import {
  buildNextStepPrompt, parseNextStep, parseNextSteps, planNextSteps, ruleNextStep, placeOptions,
  type NextStepContext
} from "../../src/agent/nextStepPlanner.js";

/** room at a place (the tests follow the layout, not fixed numbers) */
const cap = (zone: string) => PLACES.find((p) => p.zone === zone)!.capacity;

const NOW = new Date("2026-10-17T12:00:00Z");

const mk = (id: string, extra: Partial<Twin> = {}): Twin => ({
  id, ownerUserId: null, name: id, traits: ["sporty"], goals: ["make friends"], avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 }, reputation: 0, locationZone: "plaza",
  energy: 5, energyUpdatedAt: NOW.toISOString(), isNpc: true, ...extra
});

const busyAt = (zone: string, auto = true): OwnerOrder => ({
  kind: "act", zone, targetName: null, label: "x", auto,
  issuedAt: "2026-10-17T11:59:00Z", holdUntil: "2026-10-17T12:05:00Z"
});

const ctxFor = (stamina: number, others: Twin[] = [], extra: Partial<NextStepContext> = {}): NextStepContext => ({
  stamina,
  lastDid: "swim at THE POOL",
  lastZone: "pool",
  places: placeOptions(others, "me", NOW),
  nearbyTwinNames: ["Sena", "Ravi"],
  relationships: [{ name: "Sena", label: "friend" }],
  ownerFacts: ["Owner loves films"],
  ...extra
});

const me = mk("me", { name: "Memo" });
const llmSaying = (raw: string): LlmClient => ({ generate: vi.fn(async () => raw) });

describe("placeOptions (free room per place)", () => {
  it("counts twins with an active order at a place against its capacity", () => {
    const swimmers = [1, 2, 3, 4, 5].map((i) => mk(`s${i}`, { order: busyAt("pool") }));
    const opts = placeOptions(swimmers, "me", NOW);
    const pool = opts.find((p) => p.zone === "pool")!;
    expect(pool.free).toBe(PLACES.find((p) => p.zone === "pool")!.capacity - 5);
  });

  it("a full place is left out; expired orders and the twin itself don't count", () => {
    const riders = [1, 2, 3, 4].map((i) => mk(`r${i}`, { order: busyAt("funfair") }));
    const expired = mk("old", { order: { ...busyAt("cinema"), holdUntil: "2026-10-17T11:00:00Z" } });
    const opts = placeOptions([...riders, expired, mk("me", { order: busyAt("gym") })], "me", NOW);
    expect(opts.some((p) => p.zone === "funfair")).toBe(false);
    expect(opts.find((p) => p.zone === "cinema")!.free).toBe(cap("cinema"));
    expect(opts.find((p) => p.zone === "gym")!.free).toBe(cap("gym"));
  });

  it("lists every place's activities with their energy effect", () => {
    const opts = placeOptions([], "me", NOW);
    expect(opts.map((p) => p.zone).sort()).toEqual(PLACES.map((p) => p.zone).sort());
    const pool = opts.find((p) => p.zone === "pool")!;
    expect(pool.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "swim", stamina: -25 }),
      expect.objectContaining({ id: "sunbathe", stamina: 10 })
    ]));
    expect(opts.find((p) => p.zone === "home")!.actions[0]).toMatchObject({ id: "sleep" });
  });
});

describe("buildNextStepPrompt", () => {
  it("names the twin's energy, what it just did, the places with room and the reply format", () => {
    const p = buildNextStepPrompt(me, ctxFor(64));
    expect(p).toContain("Memo");
    expect(p).toContain("64/100");
    expect(p).toContain("swim at THE POOL");
    expect(p).toContain("cinema");
    expect(p).toContain("watch_movie");
    expect(p).toContain("-25");
    expect(p).toMatch(/below 20/);
    expect(p).toMatch(/rest/i);
    expect(p).toContain("Sena");
    expect(p).toContain("Owner loves films");
    expect(p).toContain('"zone"');
    expect(p).toContain('"partner"');
  });

  it("never offers a full place", () => {
    const riders = [1, 2, 3, 4].map((i) => mk(`r${i}`, { order: busyAt("funfair") }));
    const p = buildNextStepPrompt(me, ctxFor(80, riders));
    expect(p).not.toContain("ride_coaster");
  });

  it("tells a tired twin to rest and offers only restful things", () => {
    const p = buildNextStepPrompt(me, ctxFor(12));
    expect(p).toMatch(/tired/i);
    expect(p).not.toContain("work_out");
    expect(p).toContain("sleep");
  });

  it("to-do-list mode: asks for a short plan of PLAN_STEPS activities as a JSON array", () => {
    expect(PLAN_STEPS).toBe(3);
    const p = buildNextStepPrompt(me, ctxFor(80));
    expect(p).toMatch(/3 activities/);
    expect(p).toMatch(/JSON array/);
    expect(buildNextStepPrompt(me, ctxFor(80), 1)).not.toMatch(/JSON array/);
  });
});

describe("parseNextStep", () => {
  const ctx = ctxFor(80);

  it("reads a valid step", () => {
    expect(parseNextStep('{"zone":"cinema","action":"watch_movie","partner":"Sena","narrative":"Memo drags Sena to the cinema."}', ctx))
      .toEqual({ zone: "cinema", action: "watch_movie", partner: "Sena", narrative: "Memo drags Sena to the cinema." });
  });

  it("tolerates fences, display names and an action without its zone", () => {
    expect(parseNextStep('```json\n{"zone":"THE GYM","action":"run","partner":null,"narrative":"x"}\n```', ctx)).toMatchObject({ zone: "gym", action: "run" });
    expect(parseNextStep('{"action":"swim","narrative":"x"}', ctx)).toMatchObject({ zone: "pool", action: "swim", partner: null });
  });

  it("a zone with an action from elsewhere gets the place's own activity", () => {
    expect(parseNextStep('{"zone":"garden","action":"swim","partner":null,"narrative":"x"}', ctx)).toMatchObject({ zone: "garden", action: "garden" });
  });

  it("drops an unknown partner", () => {
    expect(parseNextStep('{"zone":"pool","action":"swim","partner":"Gandalf","narrative":"x"}', ctx)!.partner).toBeNull();
  });

  it("returns null for junk, unknown places and full places", () => {
    expect(parseNextStep("I think I'll swim!", ctx)).toBeNull();
    expect(parseNextStep('{"zone":"moon","action":"fly"}', ctx)).toBeNull();
    expect(parseNextStep("{not json", ctx)).toBeNull();
    const riders = [1, 2, 3, 4].map((i) => mk(`r${i}`, { order: busyAt("funfair") }));
    expect(parseNextStep('{"zone":"funfair","action":"ride_coaster","partner":null,"narrative":"x"}', ctxFor(80, riders))).toBeNull();
  });

  it("drops the partner when only one spot is left", () => {
    const lifters = Array.from({ length: cap("gym") - 1 }, (_, i) => mk(`g${i}`, { order: busyAt("gym") }));
    expect(parseNextStep('{"zone":"gym","action":"work_out","partner":"Sena","narrative":"x"}', ctxFor(80, lifters))).toMatchObject({ zone: "gym", partner: null });
  });

  it("reads a list of steps and drops the invalid ones", () => {
    const steps = parseNextSteps('Here is my plan: [{"zone":"pool","action":"swim","partner":null,"narrative":"a"},{"zone":"moon","action":"x"},{"zone":"maker_space","action":"eat","partner":null,"narrative":"b"}]', ctx);
    expect(steps.map((s) => s.action)).toEqual(["swim", "eat"]);
    expect(parseNextSteps('{"steps":[{"zone":"gym","action":"run"}]}', ctx).map((s) => s.action)).toEqual(["run"]);
    expect(parseNextSteps('{"zone":"gym","action":"run"}', ctx).map((s) => s.action)).toEqual(["run"]);
    expect(parseNextSteps("[1, 2, null]", ctx)).toEqual([]);
    expect(parseNextSteps("nope", ctx)).toEqual([]);
  });
});

describe("ruleNextStep (no AI)", () => {
  it("a rested twin picks a free place that fits its energy, not the one it just left", () => {
    for (let i = 0; i < 40; i++) {
      const r = i / 40;
      const step = ruleNextStep(me, ctxFor(90), () => r);
      expect(step.zone).not.toBe("pool");
      expect(PLACES.some((p) => p.zone === step.zone)).toBe(true);
      expect(step.narrative).toContain("Memo");
    }
  });

  it("never drops a twin below the tired line", () => {
    for (let i = 0; i < 40; i++) {
      const step = ruleNextStep(me, ctxFor(30), () => i / 40);
      const place = PLACES.find((p) => p.zone === step.zone)!;
      expect(step.zone === "home" || 30 + place.stamina >= 20 || step.action === "sunbathe").toBe(true);
    }
  });

  it("a tired twin rests (café or quiet corner), an exhausted one goes home to sleep", () => {
    const tired = ruleNextStep(me, ctxFor(15), () => 0.1);
    expect(["maker_space", "network_hub"]).toContain(tired.zone);
    expect(ruleNextStep(me, ctxFor(5), () => 0.1)).toMatchObject({ zone: "home", action: "sleep" });
  });

  it("never picks a full place", () => {
    const crowd = [
      ...Array.from({ length: cap("maker_space") }, (_, i) => mk(`c${i}`, { order: busyAt("maker_space") })),
      ...[1, 2].map((i) => mk(`q${i}`, { order: busyAt("network_hub") }))
    ];
    const step = ruleNextStep(me, ctxFor(15, crowd), () => 0.1);
    expect(["maker_space", "network_hub"]).not.toContain(step.zone);
    expect(step.zone === "home" || step.zone === "event_space" || step.action === "sunbathe").toBe(true);
  });

  it("after gardening, fresh juice at the café", () => {
    expect(ruleNextStep(me, ctxFor(60, [], { lastZone: "garden", lastDid: "work in the garden" }), () => 0.5))
      .toMatchObject({ zone: "maker_space", action: "drink_juice" });
  });
});

describe("planNextSteps (to-do list: one AI call → PLAN_STEPS activities)", () => {
  const plan3 = '[{"zone":"cinema","action":"watch_movie","partner":"Sena","narrative":"Movie night!"},' +
    '{"zone":"maker_space","action":"eat","partner":null,"narrative":"b"},{"zone":"pool","action":"swim","partner":null,"narrative":"c"}]';

  it("asks the AI once and returns the whole plan in order", async () => {
    const llm = llmSaying(plan3);
    const steps = await planNextSteps(me, ctxFor(80), llm);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({ zone: "cinema", action: "watch_movie", partner: "Sena", narrative: "Movie night!" });
    expect(steps.map((s) => s.zone)).toEqual(["cinema", "maker_space", "pool"]);
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps at most PLAN_STEPS and accepts a single step too", async () => {
    const five = `[${Array(5).fill('{"zone":"event_space","action":"sit","partner":null,"narrative":"x"}').join(",")}]`;
    expect(await planNextSteps(me, ctxFor(80), llmSaying(five))).toHaveLength(PLAN_STEPS);
    expect(await planNextSteps(me, ctxFor(80), llmSaying('{"zone":"gym","action":"run","partner":null,"narrative":"x"}'))).toHaveLength(1);
  });

  it("a failed AI call still gives a rule-based step (never frozen)", async () => {
    const llm: LlmClient = { generate: async () => { throw new Error("rate limited"); } };
    const steps = await planNextSteps(me, ctxFor(80), llm, { random: () => 0.3 });
    expect(steps).toHaveLength(1);
    expect(PLACES.some((p) => p.zone === steps[0].zone)).toBe(true);
  });

  it("junk from the AI still gives a rule-based step", async () => {
    const steps = await planNextSteps(me, ctxFor(80), llmSaying("¯\\_(ツ)_/¯"), { random: () => 0.3 });
    expect(steps).toHaveLength(1);
    expect(steps[0].narrative).toContain("Memo");
  });

  it("a tiring step for a tired twin becomes a rest step and ends the plan", async () => {
    const plan = '[{"zone":"gym","action":"work_out","partner":null,"narrative":"pump!"},{"zone":"pool","action":"swim","partner":null,"narrative":"x"}]';
    const steps = await planNextSteps(me, ctxFor(12), llmSaying(plan), { random: () => 0.1 });
    expect(steps).toHaveLength(1);
    expect(["maker_space", "network_hub", "home"]).toContain(steps[0].zone);
  });

  it("energy is projected along the plan: the step that would tire the twin becomes rest", async () => {
    const plan = '[{"zone":"gym","action":"work_out","partner":null,"narrative":"a"},{"zone":"pool","action":"swim","partner":null,"narrative":"b"},{"zone":"cinema","action":"watch_movie","partner":null,"narrative":"c"}]';
    const steps = await planNextSteps(me, ctxFor(40), llmSaying(plan), { random: () => 0.1 });
    // 40 → gym 15 (tired) → the swim becomes rest, the plan stops there
    expect(steps.map((s) => s.zone)).toEqual(["gym", "maker_space"]);
  });

  it("a restful AI step for a tired twin is kept", async () => {
    const steps = await planNextSteps(me, ctxFor(12), llmSaying('[{"zone":"event_space","action":"sit","partner":null,"narrative":"rest"}]'));
    expect(steps[0]).toMatchObject({ zone: "event_space", action: "sit" });
  });
});
