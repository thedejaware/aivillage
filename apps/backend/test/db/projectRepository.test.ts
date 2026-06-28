import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Project } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleProjectRepository } from "../../src/db/projectRepository.js";

let tdb: TestDb;
let repo: DrizzleProjectRepository;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleProjectRepository(tdb.db);
});
afterAll(async () => { await tdb.stop(); });

const proj = (id: string): Project => ({
  id, type: "fountain", zone: "plaza", participantTwinIds: ["a", "b"],
  stepsTotal: 3, stepsDone: 0, status: "active"
});

describe("DrizzleProjectRepository", () => {
  it("returns null when missing", async () => {
    expect(await repo.getById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
  it("saves and reads a project back", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    await repo.save(proj(id));
    const got = await repo.getById(id);
    expect(got).toMatchObject({ type: "fountain", zone: "plaza", stepsDone: 0, status: "active" });
    expect(got!.participantTwinIds).toEqual(["a", "b"]);
  });
  it("updates progress/status on re-save (upsert)", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    await repo.save(proj(id));
    await repo.save({ ...proj(id), stepsDone: 3, status: "complete" });
    const got = await repo.getById(id);
    expect(got!.stepsDone).toBe(3);
    expect(got!.status).toBe("complete");
  });
});
