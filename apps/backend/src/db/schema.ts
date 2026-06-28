import { pgTable, text, integer, boolean, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import type { Skills } from "@aivillage/shared";

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
  isNpc: boolean("is_npc").notNull().default(false)
});

export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
