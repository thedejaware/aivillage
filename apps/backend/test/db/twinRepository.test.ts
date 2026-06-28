import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Twin } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";

let tdb: TestDb;
let repo: DrizzleTwinRepository;
let userId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleTwinRepository(tdb.db);
  // @ts-expect-error underlying client
  const [u] = await tdb.db.session.client.unsafe(
    `insert into users (email, credits) values ('a@b.com', 100) returning id`
  );
  userId = u.id;
});

afterAll(async () => { await tdb.stop(); });

function newTwin(id: string): Twin {
  return {
    id, ownerUserId: userId, name: "Mehmet", traits: ["curious"], goals: ["build"],
    avatarSpriteUrl: null, skills: { building: 1, coding: 0, art: 0, social: 2 },
    reputation: 3, locationZone: "maker_space", energy: 4,
    energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
  };
}

describe("DrizzleTwinRepository", () => {
  it("returns null for a missing twin", async () => {
    expect(await repo.getById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("saves a new twin and reads it back faithfully", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    await repo.save(newTwin(id));
    const got = await repo.getById(id);
    expect(got).not.toBeNull();
    expect(got!.name).toBe("Mehmet");
    expect(got!.skills.social).toBe(2);
    expect(got!.energy).toBe(4);
    expect(got!.locationZone).toBe("maker_space");
  });

  it("updates an existing twin on save (upsert)", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    await repo.save(newTwin(id));
    await repo.save({ ...newTwin(id), energy: 1, locationZone: "plaza" });
    const got = await repo.getById(id);
    expect(got!.energy).toBe(1);
    expect(got!.locationZone).toBe("plaza");
  });
});
