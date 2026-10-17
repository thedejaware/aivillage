/**
 * Integration: owner chat → the twin ACTUALLY does what it was told.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { LlmClient, ToolTurn } from "@aivillage/shared";
import { startTestDb, type TestDb } from "../db/helpers.js";
import { chatWithTwin, releaseTwin } from "../../src/chat/twinChat.js";
import { CannedLlmClient } from "../../src/sim/cannedLlm.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";

let tdb: TestDb;
let userId: string;
let mineId: string;
let raviId: string;

/** A Claude-like brain that answers every turn with the given tool turn. */
const toolBrain = (turn: ToolTurn): LlmClient => ({
  generate: async () => "",
  generateWithTools: async () => turn
});

beforeAll(async () => {
  tdb = await startTestDb();
  // @ts-expect-error drizzle exposes raw client via session.client
  const client = tdb.db.session.client as { unsafe: (q: string) => Promise<{ id: string }[]> };
  const [u] = await client.unsafe(`insert into users (email) values ('owner@x.com') returning id`);
  userId = u.id;
  const [mine] = await client.unsafe(
    `insert into twins (name, owner_user_id, is_npc, energy, location_zone) values ('Memo', '${userId}', false, 5, 'plaza') returning id`
  );
  const [ravi] = await client.unsafe(
    `insert into twins (name, is_npc, energy, location_zone) values ('Ravi', true, 5, 'event_space') returning id`
  );
  mineId = mine.id;
  raviId = ravi.id;
});

afterAll(async () => {
  await tdb.stop();
});

const mine = async () => (await new DrizzleTwinRepository(tdb.db).getById(mineId))!;

describe("chatWithTwin commands", () => {
  it("executes a tool call: go_to moves the twin and holds the order", async () => {
    const out = await chatWithTwin(userId, "head to the lawn", toolBrain({
      text: "Off to the lawn!",
      toolCalls: [{ name: "go_to", input: { place: "event_space" } }]
    }), tdb.db);
    expect(out.reply).toBe("Off to the lawn!");
    expect(out.command).toEqual({ type: "go", zone: "event_space" });
    expect(out.worldChanged).toBe(true);
    const t = await mine();
    expect(t.locationZone).toBe("event_space");
    expect(t.order?.kind).toBe("go");
  });

  it("still obeys when the model forgets to call the tool", async () => {
    const out = await chatWithTwin(userId, "go to the cafe", toolBrain({ text: "Sure thing!", toolCalls: [] }), tdb.db);
    expect(out.reply).toBe("Sure thing!");
    expect(out.command).toEqual({ type: "go", zone: "maker_space" });
    expect((await mine()).locationZone).toBe("maker_space");
  });

  it("talk_to walks to the villager and reports who it is", async () => {
    const out = await chatWithTwin(userId, "go say hi", toolBrain({
      text: "",
      toolCalls: [{ name: "talk_to", input: { name: "Ravi" } }]
    }), tdb.db);
    expect(out.targetTwinId).toBe(raviId);
    expect(out.reply).toContain("Ravi"); // no spoken text → short acknowledgement
    const t = await mine();
    expect(t.locationZone).toBe("event_space");
    expect(t.order).toMatchObject({ kind: "talk_to", targetName: "Ravi" });
  });

  it("works on the offline canned brain too", async () => {
    const canned = new CannedLlmClient([JSON.stringify({ verb: "work", target: null, narrative: "x" })]);
    const out = await chatWithTwin(userId, "walk to the stage", canned, tdb.db);
    expect(out.reply).toBe("On my way to THE STAGE!");
    expect((await mine()).locationZone).toBe("plaza");
  });

  it("'do whatever you want' releases the twin", async () => {
    const out = await chatWithTwin(userId, "ok, do whatever you want", toolBrain({ text: "Yay!", toolCalls: [] }), tdb.db);
    expect(out.command).toEqual({ type: "free" });
    expect(out.order).toBeNull();
    expect((await mine()).order).toBeNull();
  });

  it("plain conversation changes nothing in the world", async () => {
    const before = await mine();
    const out = await chatWithTwin(userId, "how was your day?", toolBrain({ text: "Lovely!", toolCalls: [] }), tdb.db);
    expect(out.command).toBeNull();
    expect(out.worldChanged).toBe(false);
    expect((await mine()).locationZone).toBe(before.locationZone);
  });
});

describe("releaseTwin", () => {
  it("clears the owner order without a chat turn", async () => {
    await chatWithTwin(userId, "stay here", toolBrain({ text: "ok", toolCalls: [] }), tdb.db);
    expect((await mine()).order?.kind).toBe("stay");
    expect(await releaseTwin(userId, tdb.db)).toBe(true);
    expect((await mine()).order).toBeNull();
    expect(await releaseTwin(userId, tdb.db)).toBe(false); // nothing to release
  });
});

describe("chatWithTwin actions", () => {
  // @ts-expect-error drizzle exposes raw client via session.client
  const sql = () => tdb.db.session.client as { unsafe: (q: string) => Promise<Record<string, unknown>[]> };

  it("a hug Ravi agrees to brings them closer and both remember it", async () => {
    await sql().unsafe(`delete from relationships; insert into relationships (from_twin_id, to_twin_id, score) values ('${raviId}', '${mineId}', 40)`);
    const out = await chatWithTwin(userId, "hug Ravi", toolBrain({ text: "", toolCalls: [] }), tdb.db);
    expect(out.order).toMatchObject({ kind: "act", targetName: "Ravi", action: { id: "hug", refused: false } });
    const rel = await sql().unsafe(`select score from relationships where from_twin_id = '${mineId}' and to_twin_id = '${raviId}'`);
    expect(Number(rel[0].score)).toBeGreaterThan(0);
    const mem = await sql().unsafe(`select content from memories where twin_id = '${raviId}' and kind = 'act'`);
    expect(String(mem[0]?.content)).toContain("hug");
  });

  it("a cheek kiss Ravi refuses hurts a little and is remembered", async () => {
    await sql().unsafe(`delete from relationships; insert into relationships (from_twin_id, to_twin_id, score) values ('${raviId}', '${mineId}', -40)`);
    const out = await chatWithTwin(userId, "kiss Ravi on the cheek", toolBrain({ text: "", toolCalls: [] }), tdb.db);
    expect(out.order!.action).toMatchObject({ id: "kiss_cheek", refused: true });
    const rel = await sql().unsafe(`select score from relationships where from_twin_id = '${mineId}' and to_twin_id = '${raviId}'`);
    expect(Number(rel[0].score)).toBeLessThan(0);
  });

  it("something against the rules is refused in character and changes nothing", async () => {
    const out = await chatWithTwin(userId, "punch Ravi", toolBrain({
      text: "Sure!", toolCalls: [{ name: "do_action", input: { action: "punch", target: "Ravi" } }]
    }), tdb.db);
    expect(out.worldChanged).toBe(false);
    expect(out.reply).toMatch(/violence/);
  });
});

describe("chatWithTwin: energy", () => {
  // @ts-expect-error drizzle exposes raw client via session.client
  const sql = () => tdb.db.session.client as { unsafe: (q: string) => Promise<Record<string, unknown>[]> };

  it("a tired twin answers exactly \"I'm tired, let me rest first.\" and goes to rest by itself", async () => {
    await sql().unsafe(`update twins set stamina = 12, owner_order = null where id = '${mineId}'`);
    const out = await chatWithTwin(userId, "go swimming", toolBrain({
      text: "Yes! Swimming now!", toolCalls: [{ name: "do_action", input: { action: "swim" } }]
    }), tdb.db);
    expect(out.reply).toBe("I'm tired, let me rest first.");
    expect(out.worldChanged).toBe(true);
    const t = await mine();
    expect(t.order).toMatchObject({ kind: "act", auto: true });
    expect(["maker_space", "network_hub"]).toContain(t.order!.zone);
    expect(t.stamina).toBeGreaterThan(12);
  });

  it("an order spends energy when it starts", async () => {
    await sql().unsafe(`update twins set stamina = 90, owner_order = null where id = '${mineId}'`);
    await chatWithTwin(userId, "ride the rollercoaster", toolBrain({ text: "Wheee!", toolCalls: [] }), tdb.db);
    expect(await mine()).toMatchObject({ stamina: 75, locationZone: "funfair", order: { kind: "act", zone: "funfair" } });
  });

  it("'take Ravi to the cinema': Ravi comes along when he likes the twin", async () => {
    await sql().unsafe(`update twins set stamina = 90, owner_order = null; delete from relationships;
      insert into relationships (from_twin_id, to_twin_id, score) values ('${raviId}', '${mineId}', 30)`);
    const out = await chatWithTwin(userId, "take Ravi to the cinema", toolBrain({ text: "", toolCalls: [] }), tdb.db);
    expect(out.order).toMatchObject({ zone: "cinema", targetName: "Ravi", action: { id: "watch_movie" } });
    const ravi = (await new DrizzleTwinRepository(tdb.db).getById(raviId))!;
    expect(ravi).toMatchObject({ locationZone: "cinema", stamina: 85, order: { auto: true, zone: "cinema", targetName: "Memo", action: { id: "watch_movie" } } });
  });

  it("…and goes alone when Ravi says no", async () => {
    await sql().unsafe(`update twins set stamina = 90, owner_order = null; delete from relationships;
      insert into relationships (from_twin_id, to_twin_id, score) values ('${raviId}', '${mineId}', -60)`);
    const out = await chatWithTwin(userId, "take Ravi to the cinema", toolBrain({ text: "", toolCalls: [] }), tdb.db);
    expect(out.order).toMatchObject({ zone: "cinema", targetName: null });
    expect((await new DrizzleTwinRepository(tdb.db).getById(raviId))!.order).toBeNull();
    expect(out.reply).toMatch(/Ravi/);
  });
});

describe("chatWithTwin without an AI set up", () => {
  it("still follows simple orders", async () => {
    const out = await chatWithTwin(userId, "go to the lawn", null, tdb.db);
    expect(out.command).toEqual({ type: "go", zone: "event_space" });
    expect(out.reply).toBe("On my way to THE LAWN!");
  });
  it("points the player to Settings for real conversation", async () => {
    const out = await chatWithTwin(userId, "how are you?", null, tdb.db);
    expect(out.reply).toMatch(/Settings/);
  });
});
