import { desc, lt, notInArray } from "drizzle-orm";
import { colorForId, CONVERSATIONS_KEPT, type ConversationView } from "@aivillage/shared";
import type { DB } from "./client.js";
import { conversations } from "./schema.js";

export type NewConversation = Omit<ConversationView, "id" | "createdAt"> & { createdAt?: string };

/** The twins of a conversation, with the colour the world view gives them. */
export function twinRefs(twins: { id: string; name: string }[]): ConversationView["twins"] {
  return twins.map((t) => ({ id: t.id, name: t.name, colorHex: colorForId(t.id) }));
}

export class DrizzleConversationRepository {
  constructor(private readonly db: DB, private readonly keep = CONVERSATIONS_KEPT) {}

  /** Save one conversation, then drop the oldest beyond `keep`. */
  async add(c: NewConversation): Promise<ConversationView> {
    const [row] = await this.db.insert(conversations).values({
      // set here (ms precision) so a row's ISO time is an exact paging cursor
      createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
      zone: c.zone,
      kind: c.kind,
      twins: c.twins,
      lines: c.lines,
      moment: c.moment
    }).returning();
    await this.prune(this.keep);
    return toView(row);
  }

  /** Newest first. `before` (ISO) pages to older ones. */
  async recent(limit: number, before?: string): Promise<ConversationView[]> {
    const rows = await this.db
      .select().from(conversations)
      .where(before ? lt(conversations.createdAt, new Date(before)) : undefined)
      .orderBy(desc(conversations.createdAt), desc(conversations.id))
      .limit(limit);
    return rows.map(toView);
  }

  /** Delete all but the newest `keep` conversations (one statement). */
  async prune(keep: number = CONVERSATIONS_KEPT): Promise<void> {
    const newest = this.db
      .select({ id: conversations.id }).from(conversations)
      .orderBy(desc(conversations.createdAt), desc(conversations.id))
      .limit(keep);
    await this.db.delete(conversations).where(notInArray(conversations.id, newest));
  }
}

function toView(r: typeof conversations.$inferSelect): ConversationView {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    zone: r.zone,
    kind: r.kind,
    twins: r.twins,
    lines: r.lines,
    moment: r.moment
  };
}
