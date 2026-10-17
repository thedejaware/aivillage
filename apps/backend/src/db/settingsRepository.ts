import { eq } from "drizzle-orm";
import type { Chattiness, VillageSettings } from "@aivillage/shared";
import type { DB } from "./client.js";
import { villageSettings } from "./schema.js";

const ROW_ID = "local";
const CHATTINESS: Chattiness[] = ["calm", "normal", "busy"];

/** The village's AI choice + chattiness (single row). */
export class DrizzleSettingsRepository {
  constructor(private readonly db: DB) {}

  async get(): Promise<VillageSettings | null> {
    const r = (await this.db.select().from(villageSettings).where(eq(villageSettings.id, ROW_ID)).limit(1))[0];
    if (!r) return null;
    return {
      provider: r.provider,
      model: r.model,
      apiKey: r.apiKey,
      baseUrl: r.baseUrl,
      chattiness: CHATTINESS.includes(r.chattiness as Chattiness) ? (r.chattiness as Chattiness) : "normal"
    };
  }

  async save(s: VillageSettings): Promise<void> {
    const row = { id: ROW_ID, ...s, updatedAt: new Date() };
    await this.db.insert(villageSettings).values(row).onConflictDoUpdate({ target: villageSettings.id, set: row });
  }
}

/** Show a key without revealing it: "••••1234". */
export function maskKey(key: string | null): string | null {
  if (!key) return null;
  return key.length > 8 ? `••••${key.slice(-4)}` : "••••";
}
