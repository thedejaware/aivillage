import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, index } from "drizzle-orm/pg-core";
import type { Skills, OwnerOrder, Appearance, TwinPose, ConversationView } from "@aivillage/shared";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  credits: integer("credits").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const twins = pgTable("twins", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  name: text("name").notNull(),
  traits: jsonb("traits").$type<string[]>().notNull().default([]),
  goals: jsonb("goals").$type<string[]>().notNull().default([]),
  avatarSpriteUrl: text("avatar_sprite_url"),
  skills: jsonb("skills").$type<Skills>().notNull().default({ building: 0, coding: 0, art: 0, social: 0 }),
  reputation: integer("reputation").notNull().default(0),
  locationZone: text("location_zone").notNull().default("plaza"),
  energy: integer("energy").notNull().default(0),
  energyUpdatedAt: timestamp("energy_updated_at", { withTimezone: true }).notNull().defaultNow(),
  isNpc: boolean("is_npc").notNull().default(false),
  /** the owner's current order; null = living autonomously */
  ownerOrder: jsonb("owner_order").$type<OwnerOrder | null>(),
  /** avatar builder choices */
  appearance: jsonb("appearance").$type<Appearance | null>(),
  /** "main" (the player's own twin) or "villager" */
  role: text("role").notNull().default("villager"),
  /** false = deactivated: hidden from the village, data kept */
  active: boolean("active").notNull().default(true),
  /** exact spot saved by the browser (resume where the player left) */
  pose: jsonb("pose").$type<TwinPose | null>(),
  /** tiredness 0–100 ("Energy" in the UI); old rows default to fully rested */
  stamina: integer("stamina").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  zone: text("zone").notNull(),
  participantTwinIds: jsonb("participant_twin_ids").$type<string[]>().notNull().default([]),
  stepsTotal: integer("steps_total").notNull(),
  stepsDone: integer("steps_done").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const structures = pgTable("structures", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id"),
  type: text("type").notNull(),
  zone: text("zone").notNull(),
  builtByTwinId: uuid("built_by_twin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  twinId: uuid("twin_id").notNull().references(() => twins.id),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  importance: integer("importance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const relationships = pgTable("relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromTwinId: uuid("from_twin_id").notNull().references(() => twins.id),
  toTwinId: uuid("to_twin_id").notNull().references(() => twins.id),
  score: integer("score").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  twinId: uuid("twin_id").notNull().references(() => twins.id),
  role: text("role").notNull(), // 'owner' | 'twin'
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  twinId: uuid("twin_id").notNull().references(() => twins.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<{ projectType: string; zone: string } | { move: string; targetName: string }>().notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  consumedAt: timestamp("consumed_at", { withTimezone: true })
});

/** The local village's settings: one row (id = "local"). The AI key stays on the player's machine. */
export const villageSettings = pgTable("village_settings", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  apiKey: text("api_key"),
  baseUrl: text("base_url"),
  chattiness: text("chattiness").notNull().default("normal"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

/** Every conversation between twins, in full, for the "Talks" tab (only the newest CONVERSATIONS_KEPT are kept). */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** zone id where it happened; null if unknown */
    zone: text("zone"),
    /** "chat" | "talk" | "bigmove" */
    kind: text("kind").$type<ConversationView["kind"]>().notNull(),
    twins: jsonb("twins").$type<ConversationView["twins"]>().notNull(),
    lines: jsonb("lines").$type<ConversationView["lines"]>().notNull(),
    moment: text("moment")
  },
  (t) => ({ createdAtIdx: index("conversations_created_at_idx").on(t.createdAt) })
);
