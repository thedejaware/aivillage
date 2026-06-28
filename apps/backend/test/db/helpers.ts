import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { makeDb, type DB } from "../../src/db/client.js";

const CREATE_SQL = `
  create extension if not exists "pgcrypto";
  create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    credits integer not null default 0,
    created_at timestamptz not null default now()
  );
  create table twins (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid references users(id),
    name text not null,
    traits jsonb not null default '[]',
    goals jsonb not null default '[]',
    avatar_sprite_url text,
    skills jsonb not null default '{"building":0,"coding":0,"art":0,"social":0}',
    reputation integer not null default 0,
    location_zone text not null default 'plaza',
    energy integer not null default 0,
    energy_updated_at timestamptz not null default now(),
    is_npc boolean not null default false
  );
  create table credit_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id),
    delta integer not null,
    reason text not null,
    created_at timestamptz not null default now()
  );
`;

export interface TestDb { db: DB; stop: () => Promise<void>; }

export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").start();
  const db = makeDb(container.getConnectionUri());
  // @ts-expect-error drizzle exposes the underlying client via session.client
  await db.session.client.unsafe(CREATE_SQL);
  return { db, stop: async () => { await container.stop(); } };
}
