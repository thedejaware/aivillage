import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MAX_TWINS, DEFAULT_APPEARANCE } from "@aivillage/shared";
import { startTestDb, type TestDb } from "../db/helpers.js";
import {
  ensureLocalOwner, villageInfo, createTwin, updateTwin, deactivateTwin, activateTwin, deleteTwin, VillageError
} from "../../src/village/village.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";

let tdb: TestDb;
beforeEach(async () => { tdb = await startTestDb(); });
afterEach(async () => { await tdb.stop(); });

// @ts-expect-error drizzle exposes the raw client
const sql = () => tdb.db.session.client as { unsafe: (q: string) => Promise<Record<string, unknown>[]> };
const look = { ...DEFAULT_APPEARANCE, hair: "afro" };

describe("local owner", () => {
  it("is created once and reused", async () => {
    const a = await ensureLocalOwner(tdb.db);
    const b = await ensureLocalOwner(tdb.db);
    expect(a).toBe(b);
    expect((await sql().unsafe("select count(*)::int as n from users"))[0].n).toBe(1);
  });
});

describe("createTwin", () => {
  it("the first main twin becomes the active main", async () => {
    const t = await createTwin(tdb.db, { name: "  Mehmet Akin ", appearance: look, role: "main", personality: "curious", goal: "make friends" });
    expect(t).toMatchObject({ name: "Mehmet Akin", role: "main", active: true, appearance: look, traits: ["curious"], goals: ["make friends"] });
    const info = await villageInfo(tdb.db);
    expect(info.mainTwinId).toBe(t.id);
    expect(t.ownerUserId).toBe(info.ownerId);
  });
  it("a second main twin is created deactivated (only one main is active)", async () => {
    const first = await createTwin(tdb.db, { name: "Memo", appearance: look, role: "main" });
    const second = await createTwin(tdb.db, { name: "Memo 2", appearance: look, role: "main" });
    expect(second.active).toBe(false);
    expect((await villageInfo(tdb.db)).mainTwinId).toBe(first.id);
  });
  it("villagers belong to nobody and live in the village", async () => {
    const v = await createTwin(tdb.db, { name: "Mom", appearance: look, role: "villager" });
    expect(v).toMatchObject({ role: "villager", active: true, ownerUserId: null, isNpc: true });
  });
  it("needs a name", async () => {
    await expect(createTwin(tdb.db, { name: "   ", appearance: look, role: "villager" })).rejects.toBeInstanceOf(VillageError);
  });
  it(`stops at ${MAX_TWINS} twins living in the village`, async () => {
    for (let i = 0; i < MAX_TWINS; i++) await createTwin(tdb.db, { name: `V${i}`, appearance: look, role: "villager" });
    await expect(createTwin(tdb.db, { name: "One too many", appearance: look, role: "villager" })).rejects.toMatchObject({ code: "limit" });
  });
  it("cleans unknown appearance values", async () => {
    const t = await createTwin(tdb.db, { name: "X", appearance: { hair: "dragon-scales" } as never, role: "villager" });
    expect(t.appearance!.hair).toBe(DEFAULT_APPEARANCE.hair);
  });
});

describe("updateTwin", () => {
  it("changes name, look, traits and goals", async () => {
    const t = await createTwin(tdb.db, { name: "Mom", appearance: look, role: "villager" });
    const u = await updateTwin(tdb.db, t.id, { name: "Mum", appearance: { ...look, outfit: "suit" }, traits: ["warm"], goals: ["cook"] });
    expect(u).toMatchObject({ name: "Mum", traits: ["warm"], goals: ["cook"] });
    expect(u.appearance!.outfit).toBe("suit");
  });
});

describe("deactivate / activate", () => {
  it("deactivating hides the twin but keeps its data", async () => {
    const t = await createTwin(tdb.db, { name: "Memo", appearance: look, role: "main" });
    await sql().unsafe(`insert into memories (twin_id, kind, content) values ('${t.id}', 'chat', 'hello')`);
    await deactivateTwin(tdb.db, t.id);
    const repo = new DrizzleTwinRepository(tdb.db);
    expect((await repo.listAll()).length).toBe(0);
    expect((await repo.getById(t.id))!.active).toBe(false);
    expect((await sql().unsafe("select count(*)::int as n from memories"))[0].n).toBe(1);
    expect((await villageInfo(tdb.db)).mainTwinId).toBeNull();
  });
  it("activating a main twin swaps out the current main", async () => {
    const a = await createTwin(tdb.db, { name: "A", appearance: look, role: "main" });
    const b = await createTwin(tdb.db, { name: "B", appearance: look, role: "main" });
    await activateTwin(tdb.db, b.id);
    const repo = new DrizzleTwinRepository(tdb.db);
    expect((await repo.getById(a.id))!.active).toBe(false);
    expect((await villageInfo(tdb.db)).mainTwinId).toBe(b.id);
  });
  it("cannot bring a villager back into a full village", async () => {
    const gone = await createTwin(tdb.db, { name: "Gone", appearance: look, role: "villager" });
    await deactivateTwin(tdb.db, gone.id);
    for (let i = 0; i < MAX_TWINS; i++) await createTwin(tdb.db, { name: `V${i}`, appearance: look, role: "villager" });
    await expect(activateTwin(tdb.db, gone.id)).rejects.toMatchObject({ code: "limit" });
  });
});

describe("deleteTwin", () => {
  it("removes the twin and everything about it", async () => {
    const me = await createTwin(tdb.db, { name: "Memo", appearance: look, role: "main" });
    const mom = await createTwin(tdb.db, { name: "Mom", appearance: look, role: "villager" });
    const owner = (await villageInfo(tdb.db)).ownerId;
    await sql().unsafe(`
      insert into memories (twin_id, kind, content) values ('${mom.id}', 'chat', 'x'), ('${me.id}', 'chat', 'y');
      insert into relationships (from_twin_id, to_twin_id, score) values ('${mom.id}', '${me.id}', 10), ('${me.id}', '${mom.id}', 20);
      insert into chat_messages (twin_id, role, content) values ('${mom.id}', 'owner', 'hi');
      insert into approvals (user_id, twin_id, kind, payload) values ('${owner}', '${mom.id}', 'social_move', '{}');
    `);
    await deleteTwin(tdb.db, mom.id);
    expect(await new DrizzleTwinRepository(tdb.db).getById(mom.id)).toBeNull();
    for (const table of ["memories", "chat_messages", "approvals"]) {
      expect((await sql().unsafe(`select count(*)::int as n from ${table} where twin_id = '${mom.id}'`))[0].n, table).toBe(0);
    }
    expect((await sql().unsafe(`select count(*)::int as n from relationships`))[0].n).toBe(0);
    expect((await sql().unsafe(`select count(*)::int as n from memories`))[0].n).toBe(1); // Memo's own memory stays
  });
  it("unknown twin → not_found", async () => {
    await expect(deleteTwin(tdb.db, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("savePoses", () => {
  it("stores each twin's exact spot and venue", async () => {
    const { savePoses } = await import("../../src/village/village.js");
    const t = await createTwin(tdb.db, { name: "Memo", appearance: look, role: "main" });
    await savePoses(tdb.db, [{ id: t.id, x: -3.2, z: 1.4, yaw: 1.1, zone: "maker_space" }, { id: "00000000-0000-0000-0000-000000000000", x: 0, z: 0, yaw: 0, zone: "plaza" }]);
    const saved = await new DrizzleTwinRepository(tdb.db).getById(t.id);
    expect(saved!.pose).toEqual({ x: -3.2, z: 1.4, yaw: 1.1, zone: "maker_space" });
    expect(saved!.locationZone).toBe("maker_space");
  });
});
