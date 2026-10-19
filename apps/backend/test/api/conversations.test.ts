import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "../db/helpers.js";
import { DrizzleConversationRepository } from "../../src/db/conversationRepository.js";
import { listConversations, parseConversationQuery } from "../../src/api/conversations.js";

let tdb: TestDb;
const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 12, min)).toISOString();

beforeAll(async () => {
  tdb = await startTestDb();
  const repo = new DrizzleConversationRepository(tdb.db);
  for (let i = 1; i <= 4; i++) {
    await repo.add({
      createdAt: at(i), zone: "plaza", kind: "chat",
      twins: [{ id: "a", name: "Kwame", colorHex: 1 }],
      lines: [{ speaker: "Kwame", text: `t${i}` }], moment: null
    });
  }
});
afterAll(async () => { await tdb.stop(); });

describe("GET /api/conversations", () => {
  it("returns conversations newest first", async () => {
    const out = await listConversations({}, tdb.db);
    expect(out.conversations.map((c) => c.lines[0].text)).toEqual(["t4", "t3", "t2", "t1"]);
  });

  it("honours limit and before", async () => {
    const out = await listConversations({ limit: "2", before: at(3) }, tdb.db);
    expect(out.conversations.map((c) => c.lines[0].text)).toEqual(["t2", "t1"]);
  });
});

describe("parseConversationQuery", () => {
  it("defaults to 50, caps at 200, ignores junk", () => {
    expect(parseConversationQuery({})).toEqual({ limit: 50, before: undefined });
    expect(parseConversationQuery({ limit: "999" }).limit).toBe(200);
    expect(parseConversationQuery({ limit: "0" }).limit).toBe(1);
    expect(parseConversationQuery({ limit: "abc" }).limit).toBe(50);
    expect(parseConversationQuery({ before: "not a date" }).before).toBeUndefined();
    expect(parseConversationQuery({ before: at(2) }).before).toBe(at(2));
  });
});
