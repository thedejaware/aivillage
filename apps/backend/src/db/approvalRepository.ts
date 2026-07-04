import { and, eq, isNull, desc } from "drizzle-orm";
import type { Approval, ApprovalStatus, ApprovalRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { approvals } from "./schema.js";

type ApprovalRow = typeof approvals.$inferSelect;

function toApproval(r: ApprovalRow): Approval {
  return {
    id: r.id,
    userId: r.userId,
    twinId: r.twinId,
    kind: r.kind,
    payload: r.payload as Approval["payload"],
    status: r.status as ApprovalStatus,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    consumedAt: r.consumedAt ? r.consumedAt.toISOString() : null,
  };
}

export class DrizzleApprovalRepository implements ApprovalRepository {
  constructor(private readonly db: DB) {}

  async create(a: {
    userId: string;
    twinId: string;
    kind: string;
    payload: Approval["payload"];
  }): Promise<Approval> {
    const rows = await this.db
      .insert(approvals)
      .values({
        userId: a.userId,
        twinId: a.twinId,
        kind: a.kind,
        payload: a.payload,
      })
      .returning();
    return toApproval(rows[0]!);
  }

  async listPendingByUser(userId: string): Promise<Approval[]> {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.userId, userId), eq(approvals.status, "pending")));
    return rows.map(toApproval);
  }

  async resolve(id: string, approved: boolean): Promise<Approval | null> {
    // Only resolve if the approval exists and is still pending
    const existing = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, id), eq(approvals.status, "pending")))
      .limit(1);
    if (!existing[0]) return null;

    const rows = await this.db
      .update(approvals)
      .set({
        status: approved ? "approved" : "declined",
        resolvedAt: new Date(),
      })
      .where(eq(approvals.id, id))
      .returning();
    return rows[0] ? toApproval(rows[0]) : null;
  }

  async nextActionableForTwin(twinId: string): Promise<Approval | null> {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.twinId, twinId),
          eq(approvals.status, "approved"),
          isNull(approvals.consumedAt)
        )
      )
      .orderBy(desc(approvals.createdAt))
      .limit(1);
    return rows[0] ? toApproval(rows[0]) : null;
  }

  async hasPendingForTwin(twinId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.twinId, twinId), eq(approvals.status, "pending")))
      .limit(1);
    return rows.length > 0;
  }

  async markConsumed(id: string): Promise<void> {
    await this.db
      .update(approvals)
      .set({ consumedAt: new Date() })
      .where(eq(approvals.id, id));
  }
}
