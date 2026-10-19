import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { colorForId } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleConversationRepository, twinRefs } from "../../src/db/conversationRepository.js";

let tdb: TestDb;
let repo: DrizzleConversationRepository;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleConversationRepository(tdb.db);
});
afterAll(async () => { await tdb.stop(); });
beforeEach(async () => {
  // @ts-expect-error drizzle 0.33 exposes the raw postgres-js client via session.client
  await tdb.db.session.client.unsafe("delete from conversations");
});

const twins = [
  { id: "a1", name: "Kwame", colorHex: 0xff9a5b },
  { id: "b2", name: "Sena", colorHex: 0x3ddc97 }
];
const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 12, min)).toISOString();
const talk = (text: string, createdAt?: string) => ({
  zone: "maker_space", kind: "chat" as const, twins,
  lines: [{ speaker: "Kwame", text }, { speaker: "Sena", text: "hey" }],
  moment: null, ...(createdAt ? { createdAt } : {})
});

describe("DrizzleConversationRepository", () => {
  it("adds a conversation and returns it with an id and a time", async () => {
    const saved = await repo.add({ ...talk("hi"), moment: "Kwame and Sena became friends" });
    expect(saved.id).toMatch(/[0-9a-f-]{36}/);
    expect(new Date(saved.createdAt).toString()).not.toBe("Invalid Date");
    expect(saved).toMatchObject({
      zone: "maker_space", kind: "chat", twins,
      lines: [{ speaker: "Kwame", text: "hi" }, { speaker: "Sena", text: "hey" }],
      moment: "Kwame and Sena became friends"
    });
    expect(await repo.recent(10)).toEqual([saved]);
  });

  it("lists newest first and respects the limit", async () => {
    await repo.add(talk("first", at(1)));
    await repo.add(talk("second", at(2)));
    await repo.add(talk("third", at(3)));
    const all = await repo.recent(10);
    expect(all.map((c) => c.lines[0].text)).toEqual(["third", "second", "first"]);
    expect((await repo.recent(2)).map((c) => c.lines[0].text)).toEqual(["third", "second"]);
  });

  it("pages older conversations with a `before` cursor", async () => {
    for (let i = 1; i <= 5; i++) await repo.add(talk(`t${i}`, at(i)));
    const page1 = await repo.recent(2);
    expect(page1.map((c) => c.lines[0].text)).toEqual(["t5", "t4"]);
    const page2 = await repo.recent(2, page1[1].createdAt);
    expect(page2.map((c) => c.lines[0].text)).toEqual(["t3", "t2"]);
    const page3 = await repo.recent(2, page2[1].createdAt);
    expect(page3.map((c) => c.lines[0].text)).toEqual(["t1"]);
  });

  it("prune keeps only the newest `keep` conversations", async () => {
    for (let i = 1; i <= 5; i++) await repo.add(talk(`t${i}`, at(i)));
    await repo.prune(2);
    expect((await repo.recent(10)).map((c) => c.lines[0].text)).toEqual(["t5", "t4"]);
  });

  it("add prunes automatically down to CONVERSATIONS_KEPT", async () => {
    const small = new DrizzleConversationRepository(tdb.db, 3);
    for (let i = 1; i <= 5; i++) await small.add(talk(`t${i}`, at(i)));
    expect((await repo.recent(10)).map((c) => c.lines[0].text)).toEqual(["t5", "t4", "t3"]);
  });
});

describe("twinRefs", () => {
  it("gives each twin the colour the world view uses", () => {
    expect(twinRefs([{ id: "x9", name: "Aiko" }])).toEqual([{ id: "x9", name: "Aiko", colorHex: colorForId("x9") }]);
  });
});
