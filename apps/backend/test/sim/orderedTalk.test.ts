import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "../db/helpers.js";
import { CannedLlmClient } from "../../src/sim/cannedLlm.js";
import { talkOnArrival } from "../../src/sim/orderedTalk.js";
import { DrizzleRelationshipRepository } from "../../src/db/relationshipRepository.js";
import { DrizzleMemoryRepository } from "../../src/db/memoryRepository.js";

let tdb: TestDb;
let memoId: string;
let raviId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  // @ts-expect-error drizzle exposes raw client via session.client
  const client = tdb.db.session.client as { unsafe: (q: string) => Promise<{ id: string }[]> };
  const [m] = await client.unsafe(`insert into twins (name, is_npc, location_zone) values ('Memo', false, 'event_space') returning id`);
  const [r] = await client.unsafe(`insert into twins (name, is_npc, location_zone) values ('Ravi', true, 'event_space') returning id`);
  memoId = m.id;
  raviId = r.id;
});

afterAll(async () => {
  await tdb.stop();
});

const convo = JSON.stringify({
  lines: [
    { speaker: "Memo", text: "My owner sent me to say hi!" },
    { speaker: "Ravi", text: "Well, hi back." },
    { speaker: "Memo", text: "Coffee later?" }
  ],
  deltaAtoB: 4,
  deltaBtoA: 3,
  moment: null
});

describe("talkOnArrival", () => {
  it("plays the conversation line by line, next to the target", async () => {
    const frames = await talkOnArrival(memoId, raviId, new CannedLlmClient([convo]), tdb.db);
    expect(frames.length).toBe(3);
    const says = frames.map((f) => {
      const speaker = f.twins.find((t) => t.say && t.say.includes(["My owner", "Well, hi", "Coffee"][frames.indexOf(f)]));
      return speaker?.name;
    });
    expect(says).toEqual(["Memo", "Ravi", "Memo"]);
    // both stand at THE LAWN (event_space = col 6, row 6)
    for (const t of frames[0].twins) {
      expect(Math.abs(t.col - 6)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(t.row - 6)).toBeLessThanOrEqual(1.5);
    }
  });

  it("shifts feelings both ways and leaves a memory for both twins", async () => {
    const rel = new DrizzleRelationshipRepository(tdb.db);
    expect((await rel.get(memoId, raviId))?.score).toBe(4);
    expect((await rel.get(raviId, memoId))?.score).toBe(3);
    const mem = new DrizzleMemoryRepository(tdb.db);
    expect((await mem.recent(memoId, 5)).some((m) => m.kind === "chat")).toBe(true);
    expect((await mem.recent(raviId, 5)).some((m) => m.kind === "chat")).toBe(true);
  });

  it("returns no frames when the brain fails, instead of throwing", async () => {
    const frames = await talkOnArrival(memoId, raviId, new CannedLlmClient(["not json"]), tdb.db);
    expect(frames).toEqual([]);
  });
});
