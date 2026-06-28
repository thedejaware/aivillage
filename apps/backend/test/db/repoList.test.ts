import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Twin, Structure } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";
import { DrizzleStructureRepository } from "../../src/db/structureRepository.js";

let tdb: TestDb;
beforeAll(async () => { tdb = await startTestDb(); });
afterAll(async () => { await tdb.stop(); });

const twin = (id: string, name: string): Twin => ({
  id, ownerUserId: null, name, traits: [], goals: [], avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 }, reputation: 0,
  locationZone: "plaza", energy: 5, energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: true
});

describe("DrizzleTwinRepository.listAll", () => {
  it("returns all saved twins", async () => {
    const repo = new DrizzleTwinRepository(tdb.db);
    await repo.save(twin("55555555-5555-5555-5555-555555555555", "Ada"));
    await repo.save(twin("66666666-6666-6666-6666-666666666666", "Bo"));
    const all = await repo.listAll();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.map((t) => t.name)).toEqual(expect.arrayContaining(["Ada", "Bo"]));
  });
});

describe("DrizzleStructureRepository", () => {
  it("saves structures and lists them back (projectId optional)", async () => {
    const repo = new DrizzleStructureRepository(tdb.db);
    const s = (type: Structure["type"], zone: string): Structure => ({ id: "ignored", projectId: "ignored", type, zone });
    await repo.save(s("fountain", "plaza"));
    await repo.save(s("workshop", "maker_space"));
    const all = await repo.listAll();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.map((x) => x.type)).toEqual(expect.arrayContaining(["fountain", "workshop"]));
  });
});
