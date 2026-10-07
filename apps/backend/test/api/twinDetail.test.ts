import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { colorForId } from "@aivillage/shared";
import { startTestDb, type TestDb } from "../db/helpers.js";
import { twinDetail } from "../../src/api/twinDetail.js";

let tdb: TestDb;
let ownerId: string;
let memoId: string;
let raviId: string;
let aikoId: string;

const NOW = new Date("2026-10-06T12:00:00Z");

beforeAll(async () => {
  tdb = await startTestDb();
  // @ts-expect-error drizzle exposes raw client via session.client
  const sql = tdb.db.session.client as { unsafe: (q: string) => Promise<{ id: string }[]> };
  const [u] = await sql.unsafe(`insert into users (email) values ('o@x.com') returning id`);
  ownerId = u.id;
  const order = JSON.stringify({
    kind: "go", zone: "maker_space", targetName: null, label: "Heading to THE CAFÉ",
    issuedAt: "2026-10-06T11:58:00Z", holdUntil: "2026-10-06T12:08:00Z"
  });
  const [m] = await sql.unsafe(
    `insert into twins (name, owner_user_id, is_npc, energy, reputation, location_zone, traits, goals, owner_order)
     values ('Memo', '${ownerId}', false, 3, 7, 'maker_space', '["charming"]', '["be loved"]', '${order}'::jsonb) returning id`
  );
  const [r] = await sql.unsafe(`insert into twins (name, is_npc, location_zone) values ('Ravi', true, 'event_space') returning id`);
  const [a] = await sql.unsafe(`insert into twins (name, is_npc, location_zone) values ('Aiko', true, 'plaza') returning id`);
  memoId = m.id;
  raviId = r.id;
  aikoId = a.id;
  // Ravi adores Memo, Aiko dislikes Ravi; Memo calls Ravi a friend.
  await sql.unsafe(`insert into relationships (from_twin_id, to_twin_id, score) values
    ('${raviId}', '${memoId}', 40), ('${aikoId}', '${raviId}', -30), ('${memoId}', '${raviId}', 25)`);
  await sql.unsafe(`insert into memories (twin_id, kind, content, importance) values
    ('${memoId}', 'chat', 'Memo and Ravi laughed at the café', 1),
    ('${memoId}', 'owner_fact', 'Owner loves tea', 3)`);
});

afterAll(async () => {
  await tdb.stop();
});

describe("twinDetail", () => {
  it("returns the inspector view of a villager", async () => {
    const d = (await twinDetail(memoId, ownerId, tdb.db, NOW))!;
    expect(d).toMatchObject({
      id: memoId, name: "Memo", colorHex: colorForId(memoId), isNpc: false, isMine: true,
      traits: ["charming"], goals: ["be loved"], zone: "maker_space", zoneLabel: "THE CAFÉ",
      reputation: 7, energy: 3, popularity: 40, rank: 1, villagerCount: 3,
      orderStatus: "🚶 Heading to THE CAFÉ"
    });
    expect(d.relationships).toEqual([{ name: "Ravi", label: expect.any(String), score: 25 }]);
  });

  it("keeps the owner's private facts out of the public life feed", async () => {
    const d = (await twinDetail(memoId, null, tdb.db, NOW))!;
    expect(d.recent.map((m) => m.content)).toEqual(["Memo and Ravi laughed at the café"]);
    expect(d.isMine).toBe(false);
  });

  it("ranks the least popular last and hides expired orders", async () => {
    const d = (await twinDetail(raviId, ownerId, tdb.db, new Date("2026-10-06T13:00:00Z")))!;
    expect(d.rank).toBe(3);
    expect(d.popularity).toBe(-2); // Math.round(mean of 25 and -30)
    expect(d.orderStatus).toBeNull();
    const memo = (await twinDetail(memoId, ownerId, tdb.db, new Date("2026-10-06T13:00:00Z")))!;
    expect(memo.orderStatus).toBeNull();
  });

  it("returns null for an unknown twin", async () => {
    expect(await twinDetail("00000000-0000-0000-0000-000000000000", null, tdb.db, NOW)).toBeNull();
  });
});
