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
  create table projects (
    id uuid primary key default gen_random_uuid(),
    type text not null,
    zone text not null,
    participant_twin_ids jsonb not null default '[]',
    steps_total integer not null,
    steps_done integer not null default 0,
    status text not null default 'active',
    created_at timestamptz not null default now()
  );
  create table structures (
    id uuid primary key default gen_random_uuid(),
    project_id uuid,
    type text not null,
    zone text not null,
    built_by_twin_id uuid,
    created_at timestamptz not null default now()
  );
  create table memories (
    id uuid primary key default gen_random_uuid(),
    twin_id uuid not null references twins(id),
    kind text not null,
    content text not null,
    importance integer not null default 0,
    created_at timestamptz not null default now()
  );
  create table approvals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id),
    twin_id uuid not null references twins(id),
    kind text not null,
    payload jsonb not null,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    consumed_at timestamptz
  );
  create table relationships (
    id uuid primary key default gen_random_uuid(),
    from_twin_id uuid not null references twins(id),
    to_twin_id uuid not null references twins(id),
    score integer not null default 0,
    updated_at timestamptz not null default now()
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
