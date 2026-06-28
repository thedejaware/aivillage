import { eq, sql } from "drizzle-orm";
import type { Wallet, WalletRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { users, creditLedger } from "./schema.js";

export class DrizzleWalletRepository implements WalletRepository {
  constructor(private readonly db: DB) {}

  async getByUserId(userId: string): Promise<Wallet | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const r = rows[0];
    return r ? { userId: r.id, credits: r.credits } : null;
  }

  /** Atomically update the balance and append a ledger row in one transaction. */
  async applyDelta(userId: string, delta: number, reason: string): Promise<Wallet> {
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${delta}` })
        .where(eq(users.id, userId))
        .returning({ id: users.id, credits: users.credits });
      const u = updated[0];
      if (!u) throw new Error(`unknown user: ${userId}`);
      await tx.insert(creditLedger).values({ userId, delta, reason });
      return { userId: u.id, credits: u.credits };
    });
  }
}
