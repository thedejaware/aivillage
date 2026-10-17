import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DEFAULT_APPEARANCE, withGender, type Twin } from "@aivillage/shared";
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

  it("persists the owner order and clears it again", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    const order = {
      kind: "go" as const, zone: "maker_space", targetName: null, label: "Heading to THE CAFÉ",
      issuedAt: "2026-10-06T12:00:00.000Z", holdUntil: "2026-10-06T12:10:00.000Z"
    };
    await repo.save({ ...newTwin(id), order });
    expect((await repo.getById(id))!.order).toEqual(order);
    expect((await repo.listAll()).find((t) => t.id === id)!.order).toEqual(order);
    await repo.save({ ...newTwin(id), order: null });
    expect((await repo.getById(id))!.order).toBeNull();
  });

  it("persists look, role, active flag and saved pose", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    const appearance = { ...withGender(DEFAULT_APPEARANCE, "male"), skin: "tan", face: "wink", hair: "afro", hairColor: "black", accessory: "cap", outfit: "hoodie", outfitColor: "red", facialHair: "full_beard" };
    const pose = { x: 1.5, z: -0.25, yaw: 2, zone: "maker_space" };
    await repo.save({ ...newTwin(id), appearance, role: "main", active: true, pose });
    expect(await repo.getById(id)).toMatchObject({ appearance, role: "main", active: true, pose });
  });

  it("listAll returns only twins living in the village; listEverything includes deactivated ones", async () => {
    const id = "55555555-5555-5555-5555-555555555555";
    await repo.save({ ...newTwin(id), active: false });
    expect((await repo.listAll()).some((t) => t.id === id)).toBe(false);
    expect((await repo.listEverything()).some((t) => t.id === id)).toBe(true);
    expect((await repo.getById(id))!.active).toBe(false);
  });

  it("defaults: villager, active, no pose", async () => {
    const id = "66666666-6666-6666-6666-666666666666";
    await repo.save(newTwin(id));
    expect(await repo.getById(id)).toMatchObject({ role: "villager", active: true, pose: null });
  });

  it("updates an existing twin on save (upsert)", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    await repo.save(newTwin(id));
    await repo.save({ ...newTwin(id), energy: 1, locationZone: "plaza" });
    const got = await repo.getById(id);
    expect(got!.energy).toBe(1);
    expect(got!.locationZone).toBe("plaza");
  });

  it("persists stamina (energy 0–100)", async () => {
    const id = "77777777-7777-7777-7777-777777777777";
    await repo.save({ ...newTwin(id), stamina: 35 });
    expect((await repo.getById(id))!.stamina).toBe(35);
    await repo.save({ ...newTwin(id), stamina: 80 });
    expect((await repo.listAll()).find((t) => t.id === id)!.stamina).toBe(80);
  });

  it("old rows without stamina read as fully rested (100)", async () => {
    // @ts-expect-error underlying client
    const [row] = await tdb.db.session.client.unsafe(`insert into twins (name) values ('Old') returning id`);
    expect((await repo.getById(row.id))!.stamina).toBe(100);
    const id = "88888888-8888-8888-8888-888888888888";
    await repo.save(newTwin(id)); // a Twin object without stamina
    expect((await repo.getById(id))!.stamina).toBe(100);
  });
});
