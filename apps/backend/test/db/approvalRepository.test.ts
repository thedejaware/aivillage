import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleApprovalRepository } from "../../src/db/approvalRepository.js";

let tdb: TestDb;
let repo: DrizzleApprovalRepository;
let userId: string;
let twinId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleApprovalRepository(tdb.db);
  // @ts-expect-error drizzle 0.33 exposes the raw postgres-js client via session.client
  const client = tdb.db.session.client as unknown as { unsafe: (q: string) => Promise<any[]> };
  const [u] = await client.unsafe(`insert into users (email, credits) values ('owner@test.com', 0) returning id`);
  const [t] = await client.unsafe(
    `insert into twins (owner_user_id, name) values ('${u.id}', 'TestTwin') returning id`
  );
  userId = u.id;
  twinId = t.id;
});

afterAll(async () => { await tdb.stop(); });

describe("DrizzleApprovalRepository", () => {
  it("create returns an Approval with pending status and null resolvedAt/consumedAt", async () => {
    const approval = await repo.create({
      userId,
      twinId,
      kind: "start_project",
      payload: { projectType: "fountain", zone: "plaza" },
    });
    expect(approval.id).toBeTruthy();
    expect(approval.userId).toBe(userId);
    expect(approval.twinId).toBe(twinId);
    expect(approval.kind).toBe("start_project");
    expect(approval.payload).toEqual({ projectType: "fountain", zone: "plaza" });
    expect(approval.status).toBe("pending");
    expect(approval.createdAt).toBeTruthy();
    expect(approval.resolvedAt).toBeNull();
    expect(approval.consumedAt).toBeNull();
  });

  it("listPendingByUser returns only pending approvals for the user", async () => {
    // create a second approval for this user
    await repo.create({
      userId,
      twinId,
      kind: "start_project",
      payload: { projectType: "garden", zone: "east" },
    });
    const pending = await repo.listPendingByUser(userId);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    expect(pending.every(a => a.status === "pending")).toBe(true);
    expect(pending.every(a => a.userId === userId)).toBe(true);
  });

  it("resolve(approved=true) sets status to approved and resolvedAt, returns the updated row", async () => {
    const created = await repo.create({
      userId,
      twinId,
      kind: "start_project",
      payload: { projectType: "mural", zone: "south" },
    });
    const resolved = await repo.resolve(created.id, true);
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe("approved");
    expect(resolved!.resolvedAt).not.toBeNull();
    expect(resolved!.consumedAt).toBeNull();
  });

  it("nextActionableForTwin returns the approved non-consumed approval", async () => {
    const created = await repo.create({
      userId,
      twinId,
      kind: "start_project",
      payload: { projectType: "arcade_game", zone: "arcade" },
    });
    await repo.resolve(created.id, true);
    const actionable = await repo.nextActionableForTwin(twinId);
    expect(actionable).not.toBeNull();
    expect(actionable!.status).toBe("approved");
    expect(actionable!.consumedAt).toBeNull();
  });

  it("markConsumed makes nextActionableForTwin skip that approval", async () => {
    // consume all current actionable approvals so we get a clean slate
    let actionable = await repo.nextActionableForTwin(twinId);
    while (actionable) {
      await repo.markConsumed(actionable.id);
      actionable = await repo.nextActionableForTwin(twinId);
    }
    const result = await repo.nextActionableForTwin(twinId);
    expect(result).toBeNull();
  });

  it("resolve(approved=false) sets status to declined and is not actionable", async () => {
    const created = await repo.create({
      userId,
      twinId,
      kind: "start_project",
      payload: { projectType: "workshop", zone: "north" },
    });
    const resolved = await repo.resolve(created.id, false);
    expect(resolved!.status).toBe("declined");
    expect(resolved!.resolvedAt).not.toBeNull();
    // a declined approval is not actionable
    const actionable = await repo.nextActionableForTwin(twinId);
    // might be null or some other approval; just ensure the declined one isn't returned
    if (actionable) {
      expect(actionable.id).not.toBe(created.id);
    }
  });

  it("hasPendingForTwin returns true when there is a pending approval", async () => {
    // create a fresh pending one
    await repo.create({
      userId,
      twinId,
      kind: "start_project",
      payload: { projectType: "stage", zone: "main" },
    });
    const result = await repo.hasPendingForTwin(twinId);
    expect(result).toBe(true);
  });

  it("hasPendingForTwin returns false when no pending approvals", async () => {
    // @ts-expect-error drizzle 0.33 exposes the raw postgres-js client via session.client
    const client = tdb.db.session.client as unknown as { unsafe: (q: string) => Promise<any[]> };
    const [u2] = await client.unsafe(`insert into users (email, credits) values ('other@test.com', 0) returning id`);
    const [t2] = await client.unsafe(
      `insert into twins (owner_user_id, name) values ('${u2.id}', 'OtherTwin') returning id`
    );
    const result = await repo.hasPendingForTwin(t2.id);
    expect(result).toBe(false);
  });

  it("resolve on an already-resolved approval returns null", async () => {
    const created = await repo.create({
      userId,
      twinId,
      kind: "start_project",
      payload: { projectType: "observatory", zone: "hill" },
    });
    await repo.resolve(created.id, true); // first resolve
    const second = await repo.resolve(created.id, false); // already resolved
    expect(second).toBeNull();
  });

  it("resolve on a non-existent id returns null", async () => {
    const result = await repo.resolve("00000000-0000-0000-0000-000000000000", true);
    expect(result).toBeNull();
  });
});
