import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Memory } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleMemoryRepository } from "../../src/db/memoryRepository.js";

let tdb: TestDb;
let repo: DrizzleMemoryRepository;
let twinId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleMemoryRepository(tdb.db);
  // @ts-expect-error drizzle 0.33 exposes the raw postgres-js client via session.client
  const client = tdb.db.session.client as unknown as { unsafe: (q: string) => Promise<any[]> };
  const [u] = await client.unsafe(`insert into users (email, credits) values ('m@b.com', 0) returning id`);
  const [t] = await client.unsafe(
    `insert into twins (owner_user_id, name) values ('${u.id}', 'Mehmet') returning id`
  );
  twinId = t.id;
});
afterAll(async () => { await tdb.stop(); });

const mem = (content: string): Memory => ({
  id: "00000000-0000-0000-0000-000000000000", // ignored on insert (db default)
  twinId, kind: "event", content, importance: 1, createdAt: new Date().toISOString()
});

describe("DrizzleMemoryRepository", () => {
  it("appends and reads recent memories newest-first", async () => {
    await repo.append(mem("met Lena"));
    await repo.append(mem("started the fountain"));
    const recent = await repo.recent(twinId, 5);
    expect(recent[0].content).toBe("started the fountain");
    expect(recent.length).toBe(2);
  });
  it("respects the limit", async () => {
    const recent = await repo.recent(twinId, 1);
    expect(recent.length).toBe(1);
  });
});
