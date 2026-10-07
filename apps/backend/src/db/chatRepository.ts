import { eq, desc } from "drizzle-orm";
import type { DB } from "./client.js";
import { chatMessages } from "./schema.js";

export type ChatRole = "owner" | "twin";

export interface ChatMessage {
  id: string;
  twinId: string;
  role: ChatRole;
  content: string;
  createdAt: string; // ISO
}

export class DrizzleChatRepository {
  constructor(private readonly db: DB) {}

  async append(twinId: string, role: ChatRole, content: string): Promise<void> {
    await this.db.insert(chatMessages).values({ twinId, role, content });
  }

  /** Last `limit` messages in chronological order (oldest first). */
  async recent(twinId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await this.db
      .select().from(chatMessages)
      .where(eq(chatMessages.twinId, twinId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows
      .map((r) => ({
        id: r.id,
        twinId: r.twinId,
        role: r.role as ChatRole,
        content: r.content,
        createdAt: r.createdAt.toISOString()
      }))
      .reverse();
  }
}
