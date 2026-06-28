import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleWalletRepository } from "../../src/db/walletRepository.js";

let tdb: TestDb;
let repo: DrizzleWalletRepository;
let userId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleWalletRepository(tdb.db);
  // @ts-expect-error underlying client
  const [u] = await tdb.db.session.client.unsafe(
    `insert into users (email, credits) values ('w@b.com', 50) returning id`
  );
  userId = u.id;
});

afterAll(async () => { await tdb.stop(); });

describe("DrizzleWalletRepository", () => {
  it("reads the starting balance", async () => {
    const w = await repo.getByUserId(userId);
    expect(w!.credits).toBe(50);
  });

  it("applies a negative delta and appends a ledger row", async () => {
    const w = await repo.applyDelta(userId, -20, "start:observatory");
    expect(w.credits).toBe(30);
    // @ts-expect-error underlying client
    const ledger = await tdb.db.session.client.unsafe(
      `select delta, reason from credit_ledger where user_id = '${userId}' order by created_at`
    );
    expect(ledger.at(-1)).toMatchObject({ delta: -20, reason: "start:observatory" });
  });

  it("applies a positive delta (refund/purchase)", async () => {
    const w = await repo.applyDelta(userId, 10, "purchase:pack");
    expect(w.credits).toBe(40);
  });
});
