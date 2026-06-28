# AiVillage Wave 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the AiVillage monorepo and build the two foundational, fully-tested backend pillars — the **economy domain module** (energy, credits, cost) and the **data layer** (Postgres schema + typed repositories) — that every later wave depends on.

**Architecture:** A pnpm-workspace monorepo. A `@aivillage/shared` package holds domain types and frozen module interfaces. The Node/TS backend (`apps/backend`) implements the economy as **pure functions** (no I/O — ideal for TDD) and the data layer with **Drizzle ORM** over Postgres. Economy logic and persistence are kept separate so the domain is testable without a database.

**Tech Stack:** TypeScript (strict) · pnpm workspaces · Vitest · Drizzle ORM + postgres-js · Postgres (Railway in prod; Docker via @testcontainers/postgresql in tests).

**Scope note:** This is Wave 0 of 4. It deliberately excludes agent brains, simulation runner, projects lifecycle, approvals, web UI, and the PixiJS renderer — those are Waves 1–3 (the renderer spike runs as a parallel sibling plan). Wave 0 is "done" when the economy and data modules are implemented, all tests are green, and interfaces are frozen.

**Prerequisites for the implementer:**
- Node ≥ 20 and pnpm ≥ 9 installed.
- Docker Desktop running (required only for the data-layer integration tests in Tasks 8–9).

---

### Task 1: Scaffold the pnpm monorepo and tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/vitest.config.ts`
- Create: `apps/backend/src/index.ts`

- [ ] **Step 1: Create the workspace root files**

`package.json`:
```json
{
  "name": "aivillage",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": false,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 2: Create the `@aivillage/shared` package**

`packages/shared/package.json`:
```json
{
  "name": "@aivillage/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:
```ts
export const SHARED_PACKAGE = "@aivillage/shared";
```

- [ ] **Step 3: Create the `apps/backend` package**

`apps/backend/package.json`:
```json
{
  "name": "@aivillage/backend",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@aivillage/shared": "workspace:*",
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.4"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.13.0",
    "drizzle-kit": "^0.24.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`apps/backend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`apps/backend/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000
  }
});
```

`apps/backend/src/index.ts`:
```ts
export const BACKEND_PACKAGE = "@aivillage/backend";
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: resolves and links `@aivillage/shared` into `@aivillage/backend` with no errors.

- [ ] **Step 5: Verify the toolchain runs**

Run: `pnpm -r typecheck`
Expected: PASS (no type errors).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json packages apps pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo (shared + backend) with TS, Vitest, Drizzle"
```

---

### Task 2: Define shared domain types, economy constants, and frozen interfaces

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/interfaces.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the domain types**

`packages/shared/src/types.ts`:
```ts
export type SkillName = "building" | "coding" | "art" | "social";
export type Skills = Record<SkillName, number>; // level per skill

export interface Twin {
  id: string;
  ownerUserId: string | null; // null => NPC twin
  name: string;
  traits: string[];
  goals: string[];
  avatarSpriteUrl: string | null;
  skills: Skills;
  reputation: number;
  locationZone: string;
  energy: number;
  energyUpdatedAt: string; // ISO timestamp
  isNpc: boolean;
}

export interface Wallet {
  userId: string;
  credits: number;
}

export type ProjectType =
  | "fountain" | "mural" | "noodle_stand" | "arcade_game"
  | "garden" | "observatory" | "stage" | "workshop";

export interface ProjectCost {
  energyCost: number;
  creditCost: number;
}

/** Daily energy granted to every twin. This cap is the per-user inference ceiling. */
export const DAILY_ENERGY = 5;
```

- [ ] **Step 2: Write the frozen module interfaces (ports)**

`packages/shared/src/interfaces.ts`:
```ts
import type { Twin, Wallet } from "./types.js";

/** Persistence boundary for twins. Implemented by the data layer (Drizzle). */
export interface TwinRepository {
  getById(id: string): Promise<Twin | null>;
  save(twin: Twin): Promise<void>;
}

/** Persistence boundary for the credit wallet + ledger. */
export interface WalletRepository {
  getByUserId(userId: string): Promise<Wallet | null>;
  /** Atomically apply a delta and append a ledger row. Returns the new wallet. */
  applyDelta(userId: string, delta: number, reason: string): Promise<Wallet>;
}
```

- [ ] **Step 3: Re-export from the package index**

`packages/shared/src/index.ts`:
```ts
export const SHARED_PACKAGE = "@aivillage/shared";
export * from "./types.js";
export * from "./interfaces.js";
```

- [ ] **Step 4: Verify it typechecks**

Run: `pnpm --filter @aivillage/shared typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): domain types, DAILY_ENERGY, frozen repo interfaces"
```

---

### Task 3: Economy — energy grant & spend (pure functions, TDD)

**Files:**
- Create: `apps/backend/test/economy/energy.test.ts`
- Create: `apps/backend/src/economy/energy.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/test/economy/energy.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DAILY_ENERGY, type Twin } from "@aivillage/shared";
import { grantDailyEnergy, spendBeat, utcDay } from "../../src/economy/energy.js";

function makeTwin(over: Partial<Twin> = {}): Twin {
  return {
    id: "t1", ownerUserId: "u1", name: "Mehmet", traits: [], goals: [],
    avatarSpriteUrl: null, skills: { building: 0, coding: 0, art: 0, social: 0 },
    reputation: 0, locationZone: "plaza", energy: 0,
    energyUpdatedAt: "2026-06-27T10:00:00.000Z", isNpc: false, ...over
  };
}

describe("utcDay", () => {
  it("extracts the YYYY-MM-DD date", () => {
    expect(utcDay("2026-06-28T23:59:00.000Z")).toBe("2026-06-28");
  });
});

describe("grantDailyEnergy", () => {
  it("refills energy to the cap on a new UTC day", () => {
    const twin = makeTwin({ energy: 1, energyUpdatedAt: "2026-06-27T10:00:00.000Z" });
    const out = grantDailyEnergy(twin, new Date("2026-06-28T08:00:00.000Z"));
    expect(out.energy).toBe(DAILY_ENERGY);
    expect(out.energyUpdatedAt).toBe("2026-06-28T08:00:00.000Z");
  });

  it("does NOT refill twice on the same UTC day", () => {
    const twin = makeTwin({ energy: 2, energyUpdatedAt: "2026-06-28T01:00:00.000Z" });
    const out = grantDailyEnergy(twin, new Date("2026-06-28T20:00:00.000Z"));
    expect(out.energy).toBe(2);
    expect(out.energyUpdatedAt).toBe("2026-06-28T01:00:00.000Z");
  });
});

describe("spendBeat", () => {
  it("decrements energy and reports ok when energy is available", () => {
    const r = spendBeat(makeTwin({ energy: 3 }));
    expect(r.ok).toBe(true);
    expect(r.twin.energy).toBe(2);
  });

  it("refuses and leaves energy at 0 when empty", () => {
    const r = spendBeat(makeTwin({ energy: 0 }));
    expect(r.ok).toBe(false);
    expect(r.twin.energy).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aivillage/backend test energy`
Expected: FAIL — cannot find module `../../src/economy/energy.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/backend/src/economy/energy.ts`:
```ts
import { DAILY_ENERGY, type Twin } from "@aivillage/shared";

export function utcDay(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

/** Refill energy to the daily cap once per UTC day. Pure. */
export function grantDailyEnergy(twin: Twin, now: Date): Twin {
  const nowIso = now.toISOString();
  if (utcDay(twin.energyUpdatedAt) === utcDay(nowIso)) return twin;
  return { ...twin, energy: DAILY_ENERGY, energyUpdatedAt: nowIso };
}

export interface SpendResult { ok: boolean; twin: Twin; }

/** Spend one beat of energy. Pure. */
export function spendBeat(twin: Twin): SpendResult {
  if (twin.energy <= 0) return { ok: false, twin };
  return { ok: true, twin: { ...twin, energy: twin.energy - 1 } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aivillage/backend test energy`
Expected: PASS (6 assertions across 4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/economy/energy.ts apps/backend/test/economy/energy.test.ts
git commit -m "feat(economy): daily energy grant + beat spend (pure, TDD)"
```

---

### Task 4: Economy — credit wallet (canAfford / charge / refund, TDD)

**Files:**
- Create: `apps/backend/test/economy/credits.test.ts`
- Create: `apps/backend/src/economy/credits.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/test/economy/credits.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Wallet } from "@aivillage/shared";
import { canAfford, charge, refund } from "../../src/economy/credits.js";

const wallet = (credits: number): Wallet => ({ userId: "u1", credits });

describe("canAfford", () => {
  it("is true when credits >= amount", () => {
    expect(canAfford(wallet(20), 20)).toBe(true);
    expect(canAfford(wallet(21), 20)).toBe(true);
  });
  it("is false when credits < amount", () => {
    expect(canAfford(wallet(19), 20)).toBe(false);
  });
});

describe("charge", () => {
  it("deducts and reports ok when affordable", () => {
    const r = charge(wallet(50), 20);
    expect(r.ok).toBe(true);
    expect(r.wallet.credits).toBe(30);
  });
  it("refuses and leaves the wallet untouched when too poor", () => {
    const r = charge(wallet(10), 20);
    expect(r.ok).toBe(false);
    expect(r.wallet.credits).toBe(10);
  });
  it("throws on a negative amount", () => {
    expect(() => charge(wallet(10), -1)).toThrow();
  });
});

describe("refund", () => {
  it("adds credits back", () => {
    expect(refund(wallet(10), 5).credits).toBe(15);
  });
  it("throws on a negative amount", () => {
    expect(() => refund(wallet(10), -1)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aivillage/backend test credits`
Expected: FAIL — cannot find module `../../src/economy/credits.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/backend/src/economy/credits.ts`:
```ts
import type { Wallet } from "@aivillage/shared";

export function canAfford(wallet: Wallet, amount: number): boolean {
  return wallet.credits >= amount;
}

export interface ChargeResult { ok: boolean; wallet: Wallet; }

export function charge(wallet: Wallet, amount: number): ChargeResult {
  if (amount < 0) throw new Error("amount must be >= 0");
  if (wallet.credits < amount) return { ok: false, wallet };
  return { ok: true, wallet: { ...wallet, credits: wallet.credits - amount } };
}

export function refund(wallet: Wallet, amount: number): Wallet {
  if (amount < 0) throw new Error("amount must be >= 0");
  return { ...wallet, credits: wallet.credits + amount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aivillage/backend test credits`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/economy/credits.ts apps/backend/test/economy/credits.test.ts
git commit -m "feat(economy): credit wallet canAfford/charge/refund (pure, TDD)"
```

---

### Task 5: Economy — inference cost estimator (TDD)

**Files:**
- Create: `apps/backend/test/economy/cost.test.ts`
- Create: `apps/backend/src/economy/cost.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/test/economy/cost.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { estimateUsd, USD_PER_1K_TOKENS } from "../../src/economy/cost.js";

describe("estimateUsd", () => {
  it("uses the default rate", () => {
    expect(estimateUsd(1000)).toBeCloseTo(USD_PER_1K_TOKENS, 8);
  });
  it("scales linearly with tokens", () => {
    expect(estimateUsd(2500, 0.01)).toBeCloseTo(0.025, 8);
  });
  it("returns 0 for 0 tokens", () => {
    expect(estimateUsd(0)).toBe(0);
  });
  it("throws on negative tokens", () => {
    expect(() => estimateUsd(-1)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aivillage/backend test cost`
Expected: FAIL — cannot find module `../../src/economy/cost.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/backend/src/economy/cost.ts`:
```ts
/** Placeholder blended rate; tune from real `beats.token_cost` data later. */
export const USD_PER_1K_TOKENS = 0.01;

export function estimateUsd(tokens: number, ratePer1k = USD_PER_1K_TOKENS): number {
  if (tokens < 0) throw new Error("tokens must be >= 0");
  return (tokens / 1000) * ratePer1k;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aivillage/backend test cost`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/economy/cost.ts apps/backend/test/economy/cost.test.ts
git commit -m "feat(economy): inference cost estimator (pure, TDD)"
```

---

### Task 6: Economy — project cost catalog + affordability check (TDD)

**Files:**
- Create: `apps/backend/test/economy/projectCost.test.ts`
- Create: `apps/backend/src/economy/projectCost.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/test/economy/projectCost.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Wallet, Twin } from "@aivillage/shared";
import { projectCost, canStartProject } from "../../src/economy/projectCost.js";

const wallet = (credits: number): Wallet => ({ userId: "u1", credits });
const twin = (energy: number): Twin => ({
  id: "t1", ownerUserId: "u1", name: "Mehmet", traits: [], goals: [],
  avatarSpriteUrl: null, skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0, locationZone: "plaza", energy,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
});

describe("projectCost", () => {
  it("returns cost for a known cheap project", () => {
    expect(projectCost("mural")).toEqual({ energyCost: 2, creditCost: 0 });
  });
  it("charges credits for a big/joint project", () => {
    expect(projectCost("observatory")).toEqual({ energyCost: 6, creditCost: 20 });
  });
  it("throws on an unknown type", () => {
    // @ts-expect-error invalid type on purpose
    expect(() => projectCost("castle")).toThrow();
  });
});

describe("canStartProject", () => {
  it("true when energy and credits both suffice", () => {
    expect(canStartProject("observatory", twin(6), wallet(20)).ok).toBe(true);
  });
  it("false (reason energy) when energy too low", () => {
    const r = canStartProject("observatory", twin(5), wallet(20));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("energy");
  });
  it("false (reason credits) when credits too low", () => {
    const r = canStartProject("observatory", twin(6), wallet(19));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("credits");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aivillage/backend test projectCost`
Expected: FAIL — cannot find module `../../src/economy/projectCost.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/backend/src/economy/projectCost.ts`:
```ts
import type { ProjectType, ProjectCost, Twin, Wallet } from "@aivillage/shared";
import { canAfford } from "./credits.js";

const CATALOG: Record<ProjectType, ProjectCost> = {
  fountain:     { energyCost: 3, creditCost: 0 },
  mural:        { energyCost: 2, creditCost: 0 },
  noodle_stand: { energyCost: 3, creditCost: 0 },
  arcade_game:  { energyCost: 4, creditCost: 0 },
  garden:       { energyCost: 2, creditCost: 0 },
  observatory:  { energyCost: 6, creditCost: 20 }, // big/joint
  stage:        { energyCost: 5, creditCost: 10 },
  workshop:     { energyCost: 4, creditCost: 0 }
};

export function projectCost(type: ProjectType): ProjectCost {
  const c = CATALOG[type];
  if (!c) throw new Error(`unknown project type: ${type}`);
  return c;
}

export interface StartCheck { ok: boolean; reason?: "energy" | "credits"; }

export function canStartProject(type: ProjectType, twin: Twin, wallet: Wallet): StartCheck {
  const cost = projectCost(type);
  if (twin.energy < cost.energyCost) return { ok: false, reason: "energy" };
  if (!canAfford(wallet, cost.creditCost)) return { ok: false, reason: "credits" };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aivillage/backend test projectCost`
Expected: PASS.

- [ ] **Step 5: Run the full economy suite & commit**

Run: `pnpm --filter @aivillage/backend test`
Expected: PASS (energy, credits, cost, projectCost).

```bash
git add apps/backend/src/economy/projectCost.ts apps/backend/test/economy/projectCost.test.ts
git commit -m "feat(economy): project cost catalog + canStartProject (pure, TDD)"
```

---

### Task 7: Data — Drizzle schema for core tables

**Files:**
- Create: `apps/backend/src/db/schema.ts`
- Create: `apps/backend/drizzle.config.ts`
- Create: `apps/backend/test/db/schema.test.ts`

- [ ] **Step 1: Write the failing test** (asserts schema shape so a rename breaks the build)

`apps/backend/test/db/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { users, twins, creditLedger } from "../../src/db/schema.js";

describe("schema", () => {
  it("exposes the expected tables and key columns", () => {
    expect(Object.keys(users)).toEqual(expect.arrayContaining(["id", "email", "credits"]));
    expect(Object.keys(twins)).toEqual(
      expect.arrayContaining(["id", "ownerUserId", "energy", "energyUpdatedAt", "isNpc"])
    );
    expect(Object.keys(creditLedger)).toEqual(
      expect.arrayContaining(["id", "userId", "delta", "reason"])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aivillage/backend test schema`
Expected: FAIL — cannot find module `../../src/db/schema.js`.

- [ ] **Step 3: Write the schema**

`apps/backend/src/db/schema.ts`:
```ts
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
```

`apps/backend/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aivillage/backend test schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle.config.ts apps/backend/test/db/schema.test.ts
git commit -m "feat(data): Drizzle schema for users, twins, credit_ledger"
```

---

### Task 8: Data — DB client + TwinRepository (integration test, testcontainers)

**Files:**
- Create: `apps/backend/src/db/client.ts`
- Create: `apps/backend/test/db/helpers.ts`
- Create: `apps/backend/src/db/twinRepository.ts`
- Create: `apps/backend/test/db/twinRepository.test.ts`

> **Note:** These tests start a throwaway Postgres in Docker. Docker Desktop must be running.

- [ ] **Step 1: Write the DB client and a test helper**

`apps/backend/src/db/client.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DB = ReturnType<typeof makeDb>;

export function makeDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  return drizzle(sql, { schema });
}
```

`apps/backend/test/db/helpers.ts`:
```ts
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
  // @ts-expect-error drizzle exposes the underlying client via $client
  await db.$client.unsafe(CREATE_SQL);
  return { db, stop: async () => { await container.stop(); } };
}
```

- [ ] **Step 2: Write the failing repository test**

`apps/backend/test/db/twinRepository.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Twin } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";

let tdb: TestDb;
let repo: DrizzleTwinRepository;
let userId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleTwinRepository(tdb.db);
  // @ts-expect-error underlying client
  const [u] = await tdb.db.$client.unsafe(
    `insert into users (email, credits) values ('a@b.com', 100) returning id`
  );
  userId = u.id;
});

afterAll(async () => { await tdb.stop(); });

function newTwin(id: string): Twin {
  return {
    id, ownerUserId: userId, name: "Mehmet", traits: ["curious"], goals: ["build"],
    avatarSpriteUrl: null, skills: { building: 1, coding: 0, art: 0, social: 2 },
    reputation: 3, locationZone: "maker_space", energy: 4,
    energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
  };
}

describe("DrizzleTwinRepository", () => {
  it("returns null for a missing twin", async () => {
    expect(await repo.getById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("saves a new twin and reads it back faithfully", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    await repo.save(newTwin(id));
    const got = await repo.getById(id);
    expect(got).not.toBeNull();
    expect(got!.name).toBe("Mehmet");
    expect(got!.skills.social).toBe(2);
    expect(got!.energy).toBe(4);
    expect(got!.locationZone).toBe("maker_space");
  });

  it("updates an existing twin on save (upsert)", async () => {
    const id = "22222222-2222-2222-2222-222222222222";
    await repo.save(newTwin(id));
    await repo.save({ ...newTwin(id), energy: 1, locationZone: "plaza" });
    const got = await repo.getById(id);
    expect(got!.energy).toBe(1);
    expect(got!.locationZone).toBe("plaza");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @aivillage/backend test twinRepository`
Expected: FAIL — cannot find module `../../src/db/twinRepository.js`.

- [ ] **Step 4: Write minimal implementation**

`apps/backend/src/db/twinRepository.ts`:
```ts
import { eq } from "drizzle-orm";
import type { Twin, TwinRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { twins } from "./schema.js";

export class DrizzleTwinRepository implements TwinRepository {
  constructor(private readonly db: DB) {}

  async getById(id: string): Promise<Twin | null> {
    const rows = await this.db.select().from(twins).where(eq(twins.id, id)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      ownerUserId: r.ownerUserId,
      name: r.name,
      traits: r.traits,
      goals: r.goals,
      avatarSpriteUrl: r.avatarSpriteUrl,
      skills: r.skills,
      reputation: r.reputation,
      locationZone: r.locationZone,
      energy: r.energy,
      energyUpdatedAt: r.energyUpdatedAt.toISOString(),
      isNpc: r.isNpc
    };
  }

  async save(twin: Twin): Promise<void> {
    const row = {
      id: twin.id,
      ownerUserId: twin.ownerUserId,
      name: twin.name,
      traits: twin.traits,
      goals: twin.goals,
      avatarSpriteUrl: twin.avatarSpriteUrl,
      skills: twin.skills,
      reputation: twin.reputation,
      locationZone: twin.locationZone,
      energy: twin.energy,
      energyUpdatedAt: new Date(twin.energyUpdatedAt),
      isNpc: twin.isNpc
    };
    await this.db.insert(twins).values(row).onConflictDoUpdate({ target: twins.id, set: row });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aivillage/backend test twinRepository`
Expected: PASS (3 tests). First run is slow (pulls the Postgres image).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/client.ts apps/backend/src/db/twinRepository.ts apps/backend/test/db/helpers.ts apps/backend/test/db/twinRepository.test.ts
git commit -m "feat(data): DB client + DrizzleTwinRepository with upsert (integration TDD)"
```

---

### Task 9: Data — WalletRepository with atomic delta + ledger (integration test)

**Files:**
- Create: `apps/backend/src/db/walletRepository.ts`
- Create: `apps/backend/test/db/walletRepository.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/test/db/walletRepository.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleWalletRepository } from "../../src/db/walletRepository.js";

let tdb: TestDb;
let repo: DrizzleWalletRepository;
let userId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleWalletRepository(tdb.db);
  // @ts-expect-error underlying client
  const [u] = await tdb.db.$client.unsafe(
    `insert into users (email, credits) values ('w@b.com', 50) returning id`
  );
  userId = u.id;
});

afterAll(async () => { await tdb.stop(); });

describe("DrizzleWalletRepository", () => {
  it("reads the starting balance", async () => {
    const w = await repo.getByUserId(userId);
    expect(w!.credits).toBe(50);
  });

  it("applies a negative delta and appends a ledger row", async () => {
    const w = await repo.applyDelta(userId, -20, "start:observatory");
    expect(w.credits).toBe(30);
    // @ts-expect-error underlying client
    const ledger = await tdb.db.$client.unsafe(
      `select delta, reason from credit_ledger where user_id = '${userId}' order by created_at`
    );
    expect(ledger.at(-1)).toMatchObject({ delta: -20, reason: "start:observatory" });
  });

  it("applies a positive delta (refund/purchase)", async () => {
    const w = await repo.applyDelta(userId, 10, "purchase:pack");
    expect(w.credits).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aivillage/backend test walletRepository`
Expected: FAIL — cannot find module `../../src/db/walletRepository.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/backend/src/db/walletRepository.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aivillage/backend test walletRepository`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full backend suite & commit**

Run: `pnpm --filter @aivillage/backend test`
Expected: PASS (economy unit tests + data integration tests).

```bash
git add apps/backend/src/db/walletRepository.ts apps/backend/test/db/walletRepository.test.ts
git commit -m "feat(data): DrizzleWalletRepository with atomic delta + ledger (integration TDD)"
```

---

### Task 10: Wave 0 gate — full green build + interface freeze note

**Files:**
- Create: `docs/superpowers/INTERFACES.md`

- [ ] **Step 1: Run the entire workspace test + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: ALL PASS.

- [ ] **Step 2: Record the frozen interfaces for downstream waves**

`docs/superpowers/INTERFACES.md`:
```markdown
# Frozen Module Interfaces (as of Wave 0)

Downstream waves code against these. Changing a signature requires updating consumers + tests.

## Economy (pure functions — apps/backend/src/economy)
- `grantDailyEnergy(twin, now) -> Twin`
- `spendBeat(twin) -> { ok, twin }`
- `canAfford(wallet, amount) -> boolean`
- `charge(wallet, amount) -> { ok, wallet }`
- `refund(wallet, amount) -> Wallet`
- `estimateUsd(tokens, ratePer1k?) -> number`
- `projectCost(type) -> { energyCost, creditCost }`
- `canStartProject(type, twin, wallet) -> { ok, reason? }`

## Data ports (packages/shared/src/interfaces.ts)
- `TwinRepository { getById, save }` — impl: `DrizzleTwinRepository`
- `WalletRepository { getByUserId, applyDelta }` — impl: `DrizzleWalletRepository`

## Next wave dependencies
Wave 1 (agent-core, projects, world-render, onboarding) imports the economy
functions and the repository ports above. Do not break them without a migration note here.
```

- [ ] **Step 3: Commit the Wave 0 gate**

```bash
git add docs/superpowers/INTERFACES.md
git commit -m "docs: freeze Wave 0 interfaces; Wave 0 foundations complete"
```

---

## Self-Review

**Spec coverage (Wave 0 portion):**
- Economy — energy cap (§6) → Tasks 3, 6 ✓
- Economy — credits wallet + "1 credit per X / big-project" rule (§6) → Tasks 4, 6 ✓
- Economy — cost accounting (§6, §11.2) → Task 5 ✓
- Data model — users, twins, credit_ledger (§9) → Tasks 7–9 ✓
- Module boundaries / frozen interfaces (§8, §14.3 Wave 0) → Tasks 2, 10 ✓
- NPC/real-player parity (§7.2): twins table carries `isNpc` + nullable `ownerUserId` so the same record/repo serves both → Task 7 ✓ (parity *behavior* test belongs to Wave 1's simulation, noted there)
- Out of Wave 0 by design: agent-core, simulation runner, projects lifecycle, approvals, web-ui, PixiJS renderer (Waves 1–3). The renderer spike (§11.1) is a **parallel sibling plan**, written next.

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every step has real code and exact commands. The only intentional tunables (`USD_PER_1K_TOKENS`, `DAILY_ENERGY`) are explicit constants with comments, not placeholders.

**Type consistency:** `Twin`, `Wallet`, `Skills`, `ProjectType`, `ProjectCost` defined once in `@aivillage/shared` (Task 2) and reused verbatim in Tasks 3–9. Repo classes implement the exact `TwinRepository` / `WalletRepository` ports. Schema column names (`ownerUserId`, `energyUpdatedAt`, `isNpc`) match the test assertions in Task 7 and the row mapping in Task 8.
