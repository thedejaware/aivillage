import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleRelationshipRepository } from "../../src/db/relationshipRepository.js";

let tdb: TestDb;
let repo: DrizzleRelationshipRepository;
let twinAId: string;
let twinBId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleRelationshipRepository(tdb.db);
  // @ts-expect-error drizzle 0.33 exposes the raw postgres-js client via session.client
  const client = tdb.db.session.client as unknown as { unsafe: (q: string) => Promise<any[]> };
  const [u] = await client.unsafe(`insert into users (email, credits) values ('rel-owner@test.com', 0) returning id`);
  const [tA] = await client.unsafe(
    `insert into twins (owner_user_id, name) values ('${u.id}', 'TwinA') returning id`
  );
  const [tB] = await client.unsafe(
    `insert into twins (owner_user_id, name) values ('${u.id}', 'TwinB') returning id`
  );
  twinAId = tA.id;
  twinBId = tB.id;
});

afterAll(async () => { await tdb.stop(); });

describe("DrizzleRelationshipRepository", () => {
  it("get returns null when no relationship exists", async () => {
    const result = await repo.get(twinAId, twinBId);
    expect(result).toBeNull();
  });

  it("applyDelta creates a new row with clamped delta when none exists", async () => {
    const rel = await repo.applyDelta(twinAId, twinBId, 10);
    expect(rel.fromTwinId).toBe(twinAId);
    expect(rel.toTwinId).toBe(twinBId);
    expect(rel.score).toBe(10);
    expect(rel.updatedAt).toBeTruthy();
  });

  it("applyDelta accumulates scores on existing row", async () => {
    // score is already 10 from previous test; add 5 more
    const rel = await repo.applyDelta(twinAId, twinBId, 5);
    expect(rel.score).toBe(15);
  });

  it("get returns the current relationship after delta applied", async () => {
    const rel = await repo.get(twinAId, twinBId);
    expect(rel).not.toBeNull();
    expect(rel!.score).toBe(15);
    expect(rel!.fromTwinId).toBe(twinAId);
    expect(rel!.toTwinId).toBe(twinBId);
  });

  it("applyDelta clamps score at +100", async () => {
    // current score = 15; push it way over cap
    const rel = await repo.applyDelta(twinAId, twinBId, 200);
    expect(rel.score).toBe(100);
  });

  it("applyDelta clamps score at -100", async () => {
    // score is 100; push down well below -100
    const rel = await repo.applyDelta(twinAId, twinBId, -300);
    expect(rel.score).toBe(-100);
  });

  it("listFrom returns only the outgoing relationships for that twin", async () => {
    // reset A->B to a known value
    await repo.applyDelta(twinAId, twinBId, 50); // -100 + 50 = -50

    // add B->A as well to make sure it doesn't bleed through
    await repo.applyDelta(twinBId, twinAId, 20);

    const fromA = await repo.listFrom(twinAId);
    expect(fromA.length).toBeGreaterThanOrEqual(1);
    expect(fromA.every(r => r.fromTwinId === twinAId)).toBe(true);
    // B->A must not appear
    expect(fromA.find(r => r.fromTwinId === twinBId)).toBeUndefined();
  });

  it("listAll returns all relationship rows", async () => {
    const all = await repo.listAll();
    // we have at least A->B and B->A
    expect(all.length).toBeGreaterThanOrEqual(2);
    const atob = all.find(r => r.fromTwinId === twinAId && r.toTwinId === twinBId);
    const btoa = all.find(r => r.fromTwinId === twinBId && r.toTwinId === twinAId);
    expect(atob).toBeDefined();
    expect(btoa).toBeDefined();
  });
});
