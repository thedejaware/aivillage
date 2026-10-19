import type { ConversationView } from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { getDb } from "../db/appDb.js";
import { DrizzleConversationRepository } from "../db/conversationRepository.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** ?limit (default 50, 1–200) and ?before (an ISO time; junk is ignored). */
export function parseConversationQuery(q: { limit?: unknown; before?: unknown }): { limit: number; before: string | undefined } {
  const n = Number(q.limit);
  const limit = q.limit === undefined || !Number.isFinite(n) ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
  const before = typeof q.before === "string" && !Number.isNaN(Date.parse(q.before)) ? q.before : undefined;
  return { limit, before };
}

/** GET /api/conversations: past conversations, newest first. */
export async function listConversations(
  q: { limit?: unknown; before?: unknown },
  db: DB = getDb()
): Promise<{ conversations: ConversationView[] }> {
  const { limit, before } = parseConversationQuery(q);
  return { conversations: await new DrizzleConversationRepository(db).recent(limit, before) };
}
