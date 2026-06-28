# AiVillage Wave 1a — Agent Brain + Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give twins a brain and projects a lifecycle — `agent-core` (memory + an LLM-backed beat planner, Claude mocked in tests) and `projects` (start → advance → complete, with rewards and persistence) — all TDD.

**Architecture:** Pure domain logic + thin persistence, same shape as Wave 0. The planner depends on an injected `LlmClient` port (mocked in unit tests, real Claude later). New domain types + repository ports live in `@aivillage/shared`. To keep the two teammates conflict-free, the **lead** adds all shared types, the new Drizzle tables, and the test-DB table DDL **first**; teammates then build on disjoint files.

**Tech Stack:** Same as Wave 0 (TypeScript, pnpm, Vitest, Drizzle + postgres-js, testcontainers/Colima). Run pnpm as `pnpm` (shim installed) — fall back to `corepack pnpm` if missing. DB tests need the Colima env vars (see `docs/superpowers/INTERFACES.md`).

**Scope:** Wave 1a = `agent-core` + `projects` only. OUT (Wave 1b): `world-render` wiring to real state, `onboarding`/avatar generation (needs an image-model decision). The simulation runner that *drives* beats is Wave 2.

**Prereqs:** Wave 0 complete (`@aivillage/shared` exports Twin/Wallet/etc.; economy + data layer green). Docker (Colima) running for DB tests.

---

## Foundation (LEAD does these first, then spawns teammates)

### Task F1: Shared types + ports for projects and agent-core

**Files:**
- Modify: `packages/shared/src/types.ts` (append)
- Modify: `packages/shared/src/interfaces.ts` (append)

- [ ] **Step 1: Append domain types** to `packages/shared/src/types.ts`:

```ts
// --- Wave 1a additions ---
export type ProjectStatus = "active" | "complete";

export interface Project {
  id: string;
  type: ProjectType;
  zone: string;
  participantTwinIds: string[];
  stepsTotal: number;
  stepsDone: number;
  status: ProjectStatus;
}

export interface Reward {
  skill: SkillName;
  xp: number;
  reputation: number;
}

export interface Structure {
  id: string;
  projectId: string;
  type: ProjectType;
  zone: string;
}

export type Verb = "work" | "socialize" | "move";

export interface BeatResult {
  verb: Verb;
  target: string | null; // a zone name, a twin name, or null
  narrative: string;
}

export interface Memory {
  id: string;
  twinId: string;
  kind: string;
  content: string;
  importance: number;
  createdAt: string; // ISO timestamp
}
```

- [ ] **Step 2: Append ports** to `packages/shared/src/interfaces.ts`:

```ts
import type { Project, Memory } from "./types.js";

/** The model boundary. Unit tests inject a fake; production wraps Claude. */
export interface LlmClient {
  /** Return the model's raw text completion for a prompt. */
  generate(prompt: string): Promise<string>;
}

export interface ProjectRepository {
  getById(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
}

export interface MemoryRepository {
  append(memory: Memory): Promise<void>;
  recent(twinId: string, limit: number): Promise<Memory[]>;
}
```

> Note: `interfaces.ts` already imports `Twin, Wallet` from `./types.js`. Add `Project, Memory` to that existing import line instead of duplicating it.

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter @aivillage/shared typecheck`
Expected: PASS.

```bash
git add packages/shared/src
git commit -m "feat(shared): Wave 1a types (Project, Reward, Structure, Memory, BeatResult) + LlmClient/Project/Memory ports"
```

### Task F2: New Drizzle tables + test-DB DDL

**Files:**
- Modify: `apps/backend/src/db/schema.ts` (append tables)
- Modify: `apps/backend/test/db/helpers.ts` (extend `CREATE_SQL`)

- [ ] **Step 1: Append tables** to `apps/backend/src/db/schema.ts`:

```ts
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
  projectId: uuid("project_id").notNull().references(() => projects.id),
  type: text("type").notNull(),
  zone: text("zone").notNull(),
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
```

- [ ] **Step 2: Extend `CREATE_SQL`** in `apps/backend/test/db/helpers.ts` — add these statements to the end of the existing template string (before the closing backtick):

```sql
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
    project_id uuid not null references projects(id),
    type text not null,
    zone text not null,
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
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm --filter @aivillage/backend typecheck`
Expected: PASS.

```bash
git add apps/backend/src/db/schema.ts apps/backend/test/db/helpers.ts
git commit -m "feat(data): projects, structures, memories tables + test DDL"
```

---

## Teammate: `projects-builder` (owns `src/projects/*`, `test/projects/*`, `src/db/projectRepository.ts`, `test/db/projectRepository.test.ts`)

### Task P1: Project lifecycle (pure, TDD)

**Files:**
- Create: `apps/backend/test/projects/lifecycle.test.ts`
- Create: `apps/backend/src/projects/lifecycle.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { startProject, advance, isComplete } from "../../src/projects/lifecycle.js";

describe("startProject", () => {
  it("creates an active project at 0 progress", () => {
    const p = startProject("p1", "fountain", "plaza", ["t1"], 3);
    expect(p).toMatchObject({ id: "p1", type: "fountain", zone: "plaza", stepsDone: 0, status: "active" });
  });
  it("throws if stepsTotal < 1", () => {
    expect(() => startProject("p1", "fountain", "plaza", ["t1"], 0)).toThrow();
  });
});

describe("advance", () => {
  it("increments progress and stays active before the end", () => {
    const p = advance(startProject("p1", "fountain", "plaza", ["t1"], 3));
    expect(p.stepsDone).toBe(1);
    expect(p.status).toBe("active");
  });
  it("completes on the final step and does not overshoot", () => {
    let p = startProject("p1", "fountain", "plaza", ["t1"], 2);
    p = advance(advance(advance(p)));
    expect(p.stepsDone).toBe(2);
    expect(p.status).toBe("complete");
    expect(isComplete(p)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL** `pnpm --filter @aivillage/backend test lifecycle`

- [ ] **Step 3: Implement** `apps/backend/src/projects/lifecycle.ts`:

```ts
import type { Project, ProjectType } from "@aivillage/shared";

export function startProject(
  id: string, type: ProjectType, zone: string, participantTwinIds: string[], stepsTotal = 3
): Project {
  if (stepsTotal < 1) throw new Error("stepsTotal must be >= 1");
  return { id, type, zone, participantTwinIds, stepsTotal, stepsDone: 0, status: "active" };
}

export function advance(project: Project): Project {
  if (project.status === "complete") return project;
  const stepsDone = Math.min(project.stepsDone + 1, project.stepsTotal);
  const status = stepsDone >= project.stepsTotal ? "complete" : "active";
  return { ...project, stepsDone, status };
}

export function isComplete(project: Project): boolean {
  return project.status === "complete";
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(projects): lifecycle start/advance/isComplete (pure, TDD)` (+ Co-Authored-By trailer).

### Task P2: Reward application (pure, TDD)

**Files:**
- Create: `apps/backend/test/projects/reward.test.ts`
- Create: `apps/backend/src/projects/reward.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import type { Twin } from "@aivillage/shared";
import { rewardFor, applyReward } from "../../src/projects/reward.js";

const twin = (): Twin => ({
  id: "t1", ownerUserId: "u1", name: "Mehmet", traits: [], goals: [],
  avatarSpriteUrl: null, skills: { building: 1, coding: 0, art: 0, social: 0 },
  reputation: 2, locationZone: "plaza", energy: 5,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
});

describe("rewardFor", () => {
  it("maps a build-type project to the building skill", () => {
    expect(rewardFor("fountain")).toMatchObject({ skill: "building" });
  });
  it("maps an arcade_game to coding", () => {
    expect(rewardFor("arcade_game").skill).toBe("coding");
  });
});

describe("applyReward", () => {
  it("adds xp to the right skill and bumps reputation", () => {
    const out = applyReward(twin(), { skill: "building", xp: 10, reputation: 2 });
    expect(out.skills.building).toBe(11);
    expect(out.reputation).toBe(4);
  });
});
```

- [ ] **Step 2: Run → FAIL** `pnpm --filter @aivillage/backend test reward`

- [ ] **Step 3: Implement** `apps/backend/src/projects/reward.ts`:

```ts
import type { Twin, Reward, SkillName, ProjectType } from "@aivillage/shared";

const SKILL_BY_TYPE: Record<ProjectType, SkillName> = {
  fountain: "building", mural: "art", noodle_stand: "building", arcade_game: "coding",
  garden: "art", observatory: "building", stage: "social", workshop: "coding"
};

export function rewardFor(type: ProjectType): Reward {
  return { skill: SKILL_BY_TYPE[type], xp: 10, reputation: 2 };
}

export function applyReward(twin: Twin, reward: Reward): Twin {
  const skills = { ...twin.skills, [reward.skill]: twin.skills[reward.skill] + reward.xp };
  return { ...twin, skills, reputation: twin.reputation + reward.reputation };
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(projects): reward mapping + applyReward (pure, TDD)`.

### Task P3: ProjectRepository (Drizzle, integration TDD)

**Files:**
- Create: `apps/backend/test/db/projectRepository.test.ts`
- Create: `apps/backend/src/db/projectRepository.ts`

- [ ] **Step 1: Failing test** (export Colima env vars before running — see INTERFACES.md):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Project } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleProjectRepository } from "../../src/db/projectRepository.js";

let tdb: TestDb;
let repo: DrizzleProjectRepository;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleProjectRepository(tdb.db);
});
afterAll(async () => { await tdb.stop(); });

const proj = (id: string): Project => ({
  id, type: "fountain", zone: "plaza", participantTwinIds: ["a", "b"],
  stepsTotal: 3, stepsDone: 0, status: "active"
});

describe("DrizzleProjectRepository", () => {
  it("returns null when missing", async () => {
    expect(await repo.getById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
  it("saves and reads a project back", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    await repo.save(proj(id));
    const got = await repo.getById(id);
    expect(got).toMatchObject({ type: "fountain", zone: "plaza", stepsDone: 0, status: "active" });
    expect(got!.participantTwinIds).toEqual(["a", "b"]);
  });
  it("updates progress/status on re-save (upsert)", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    await repo.save(proj(id));
    await repo.save({ ...proj(id), stepsDone: 3, status: "complete" });
    const got = await repo.getById(id);
    expect(got!.stepsDone).toBe(3);
    expect(got!.status).toBe("complete");
  });
});
```

- [ ] **Step 2: Run → FAIL** (env vars exported) `pnpm --filter @aivillage/backend test projectRepository`

- [ ] **Step 3: Implement** `apps/backend/src/db/projectRepository.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Project, ProjectType, ProjectStatus, ProjectRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { projects } from "./schema.js";

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: DB) {}

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      type: r.type as ProjectType,
      zone: r.zone,
      participantTwinIds: r.participantTwinIds,
      stepsTotal: r.stepsTotal,
      stepsDone: r.stepsDone,
      status: r.status as ProjectStatus
    };
  }

  async save(project: Project): Promise<void> {
    const row = {
      id: project.id,
      type: project.type,
      zone: project.zone,
      participantTwinIds: project.participantTwinIds,
      stepsTotal: project.stepsTotal,
      stepsDone: project.stepsDone,
      status: project.status
    };
    await this.db.insert(projects).values(row).onConflictDoUpdate({ target: projects.id, set: row });
  }
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(data): DrizzleProjectRepository with upsert (integration TDD)`.

WHEN DONE: message the lead with green status + commit hashes + `test projects` and `test projectRepository` results.

---

## Teammate: `brain-builder` (owns `src/agent/*`, `test/agent/*`, `src/db/memoryRepository.ts`, `test/db/memoryRepository.test.ts`)

### Task B1: In-memory MemoryStore (TDD)

**Files:**
- Create: `apps/backend/test/agent/memoryStore.test.ts`
- Create: `apps/backend/src/agent/memoryStore.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import type { Memory } from "@aivillage/shared";
import { InMemoryMemoryStore } from "../../src/agent/memoryStore.js";

const mem = (id: string, twinId: string, content: string): Memory => ({
  id, twinId, kind: "event", content, importance: 0, createdAt: "2026-06-28T00:00:00.000Z"
});

describe("InMemoryMemoryStore", () => {
  it("returns the most recent memories for a twin, newest first", () => {
    const s = new InMemoryMemoryStore();
    s.append(mem("m1", "t1", "first"));
    s.append(mem("m2", "t1", "second"));
    s.append(mem("m3", "t2", "other twin"));
    const recent = s.recent("t1", 5);
    expect(recent.map((m) => m.content)).toEqual(["second", "first"]);
  });
  it("respects the limit", () => {
    const s = new InMemoryMemoryStore();
    for (let i = 0; i < 5; i++) s.append(mem("m" + i, "t1", "c" + i));
    expect(s.recent("t1", 2).map((m) => m.content)).toEqual(["c4", "c3"]);
  });
});
```

- [ ] **Step 2: Run → FAIL** `pnpm --filter @aivillage/backend test memoryStore`

- [ ] **Step 3: Implement** `apps/backend/src/agent/memoryStore.ts`:

```ts
import type { Memory } from "@aivillage/shared";

export class InMemoryMemoryStore {
  private items: Memory[] = [];

  append(memory: Memory): void {
    this.items.push(memory);
  }

  recent(twinId: string, limit: number): Memory[] {
    return this.items.filter((m) => m.twinId === twinId).slice(-limit).reverse();
  }
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(agent): in-memory MemoryStore (TDD)`.

### Task B2: Beat planner with mocked LlmClient (TDD)

**Files:**
- Create: `apps/backend/test/agent/planner.test.ts`
- Create: `apps/backend/src/agent/planner.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import type { Twin, LlmClient } from "@aivillage/shared";
import { buildPrompt, parseBeat, planBeat } from "../../src/agent/planner.js";

const twin = (): Twin => ({
  id: "t1", ownerUserId: "u1", name: "Mehmet", traits: ["chaotic inventor"], goals: ["build a fountain"],
  avatarSpriteUrl: null, skills: { building: 1, coding: 0, art: 0, social: 0 },
  reputation: 0, locationZone: "plaza", energy: 5,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z", isNpc: false
});

const fakeLlm = (out: string): LlmClient => ({ generate: async () => out });

describe("buildPrompt", () => {
  it("includes the twin name, zone, and nearby names", () => {
    const p = buildPrompt(twin(), { nearbyTwinNames: ["Lena"], recentMemories: [] });
    expect(p).toContain("Mehmet");
    expect(p).toContain("plaza");
    expect(p).toContain("Lena");
  });
});

describe("parseBeat", () => {
  it("parses a clean JSON object", () => {
    const r = parseBeat('{"verb":"work","target":"plaza","narrative":"Working on the fountain."}');
    expect(r).toEqual({ verb: "work", target: "plaza", narrative: "Working on the fountain." });
  });
  it("tolerates surrounding prose around the JSON", () => {
    const r = parseBeat('Sure!\n{"verb":"move","target":"event_space","narrative":"Heading over."}\nDone.');
    expect(r.verb).toBe("move");
  });
  it("throws on an invalid verb", () => {
    expect(() => parseBeat('{"verb":"fly","target":null,"narrative":"x"}')).toThrow();
  });
  it("throws when no JSON is present", () => {
    expect(() => parseBeat("no json here")).toThrow();
  });
});

describe("planBeat", () => {
  it("calls the llm and returns a parsed BeatResult", async () => {
    const r = await planBeat(twin(), { nearbyTwinNames: [], recentMemories: [] },
      fakeLlm('{"verb":"socialize","target":"Lena","narrative":"Say hi."}'));
    expect(r).toEqual({ verb: "socialize", target: "Lena", narrative: "Say hi." });
  });
});
```

- [ ] **Step 2: Run → FAIL** `pnpm --filter @aivillage/backend test planner`

- [ ] **Step 3: Implement** `apps/backend/src/agent/planner.ts`:

```ts
import type { Twin, BeatResult, Verb, LlmClient, Memory } from "@aivillage/shared";

export interface PlanContext {
  nearbyTwinNames: string[];
  recentMemories: Memory[];
}

export function buildPrompt(twin: Twin, ctx: PlanContext): string {
  const memo = ctx.recentMemories.map((m) => `- ${m.content}`).join("\n") || "- (nothing yet)";
  return [
    `You are ${twin.name}, a resident of AiVillage. Traits: ${twin.traits.join(", ") || "none"}. Goals: ${twin.goals.join(", ") || "none"}.`,
    `You are at zone "${twin.locationZone}". Nearby: ${ctx.nearbyTwinNames.join(", ") || "no one"}.`,
    `Recent memories:\n${memo}`,
    `Choose ONE action for this beat. Respond ONLY with strict JSON: {"verb":"work|socialize|move","target":<zone-or-name-or-null>,"narrative":<short sentence>}.`
  ].join("\n");
}

const VALID_VERBS: Verb[] = ["work", "socialize", "move"];

export function parseBeat(raw: string): BeatResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON object found in LLM response");
  const obj = JSON.parse(match[0]) as { verb?: string; target?: string | null; narrative?: string };
  if (!obj.verb || !VALID_VERBS.includes(obj.verb as Verb)) {
    throw new Error(`invalid verb: ${String(obj.verb)}`);
  }
  return { verb: obj.verb as Verb, target: obj.target ?? null, narrative: String(obj.narrative ?? "") };
}

export async function planBeat(twin: Twin, ctx: PlanContext, llm: LlmClient): Promise<BeatResult> {
  const raw = await llm.generate(buildPrompt(twin, ctx));
  return parseBeat(raw);
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(agent): beat planner with injected LlmClient (TDD)`.

### Task B3: MemoryRepository (Drizzle, integration TDD)

**Files:**
- Create: `apps/backend/test/db/memoryRepository.test.ts`
- Create: `apps/backend/src/db/memoryRepository.ts`

- [ ] **Step 1: Failing test** (export Colima env vars before running):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Memory } from "@aivillage/shared";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleMemoryRepository } from "../../src/db/memoryRepository.js";

let tdb: TestDb;
let repo: DrizzleMemoryRepository;
let twinId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleMemoryRepository(tdb.db);
  const client = tdb.db.session.client as unknown as (q: string) => Promise<any[]>;
  const [u] = await client(`insert into users (email, credits) values ('m@b.com', 0) returning id`);
  const [t] = await client(
    `insert into twins (owner_user_id, name) values ('${u.id}', 'Mehmet') returning id`
  );
  twinId = t.id;
});
afterAll(async () => { await tdb.stop(); });

const mem = (content: string): Memory => ({
  id: "00000000-0000-0000-0000-000000000000", // ignored on insert (db default)
  twinId, kind: "event", content, importance: 1, createdAt: new Date().toISOString()
});

describe("DrizzleMemoryRepository", () => {
  it("appends and reads recent memories newest-first", async () => {
    await repo.append(mem("met Lena"));
    await repo.append(mem("started the fountain"));
    const recent = await repo.recent(twinId, 5);
    expect(recent[0].content).toBe("started the fountain");
    expect(recent.length).toBe(2);
  });
  it("respects the limit", async () => {
    const recent = await repo.recent(twinId, 1);
    expect(recent.length).toBe(1);
  });
});
```

> Note: `tdb.db.session.client` is the raw postgres-js tagged-template client (drizzle 0.33). The helper uses it the same way.

- [ ] **Step 2: Run → FAIL** `pnpm --filter @aivillage/backend test memoryRepository`

- [ ] **Step 3: Implement** `apps/backend/src/db/memoryRepository.ts`:

```ts
import { eq, desc } from "drizzle-orm";
import type { Memory, MemoryRepository } from "@aivillage/shared";
import type { DB } from "./client.js";
import { memories } from "./schema.js";

export class DrizzleMemoryRepository implements MemoryRepository {
  constructor(private readonly db: DB) {}

  async append(memory: Memory): Promise<void> {
    await this.db.insert(memories).values({
      twinId: memory.twinId,
      kind: memory.kind,
      content: memory.content,
      importance: memory.importance
    });
  }

  async recent(twinId: string, limit: number): Promise<Memory[]> {
    const rows = await this.db
      .select().from(memories)
      .where(eq(memories.twinId, twinId))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      twinId: r.twinId,
      kind: r.kind,
      content: r.content,
      importance: r.importance,
      createdAt: r.createdAt.toISOString()
    }));
  }
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(data): DrizzleMemoryRepository append/recent (integration TDD)`.

WHEN DONE: message the lead with green status + commit hashes + `test agent` and `test memoryRepository` results.

---

## Task G: Wave 1a gate (LEAD)

- [ ] **Step 1:** With Colima env vars exported, run `pnpm -r test` and `pnpm -r typecheck` — ALL must pass (Wave 0 + Wave 1a).
- [ ] **Step 2:** Append the new interfaces to `docs/superpowers/INTERFACES.md` (projects lifecycle/reward fns; planner `buildPrompt/parseBeat/planBeat`; `InMemoryMemoryStore`; `LlmClient`, `ProjectRepository`, `MemoryRepository` ports + their Drizzle impls).
- [ ] **Step 3:** Commit `docs: freeze Wave 1a interfaces; brain + projects complete` and push.

---

## Self-Review

**Spec coverage (Wave 1a portion):** agent-core memory (§7.1) → B1, B3; agent-core planner / one bounded LLM call per beat (§7.1) → B2; projects lifecycle + rewards + structures (§5.2) → P1, P2, F2; persistence (§9 projects/structures/memories) → F2, P3, B3; LLM mocked in unit tests (§12) → B2 fake client. Deferred (stated): world-render wiring, onboarding/avatars, the simulation runner (Wave 1b/2).

**Placeholder scan:** none — all steps have real test + impl code and exact commands.

**Type consistency:** `Project`, `Reward`, `Structure`, `Memory`, `BeatResult`, `Verb`, `LlmClient`, `ProjectRepository`, `MemoryRepository` defined once in F1 and reused verbatim. Repo classes implement the F1 ports. New schema columns (`participantTwinIds`, `stepsTotal`, `twinId`) match the repo mappings and the test DDL in F2. `tdb.db.session.client` matches the Wave 0 helper convention.
