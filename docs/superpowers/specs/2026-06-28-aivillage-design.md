# AiVillage — Design Spec

**Status:** Draft for review
**Date:** 2026-06-28
**Owner:** Mehmet Akin
**One-liner:** Create your digital twin, give it goals, and watch it live, work, socialize, and build a shared world — stepping in to approve the moments that matter.

---

## 1. Vision

AiVillage is a **social life-simulation game** (think The Sims × a living global world). Each player creates an avatar and an AI **twin**. The twin lives semi-autonomously in a shared, Antigravity-style pixel-art world, meeting other twins and collaborating to **build the village**. The twin acts on its own toward the player's goals but **pauses for the owner's approval on meaningful moves**. The world is populated by a blend of real players' twins and AI-only NPC twins, so it feels alive from day one.

The product's emotional core — and its retention engine — is the **return moment**: you open the app and your twin has *lived a little while you were away*, made progress, met someone, and now needs a decision from you.

---

## 2. Locked design decisions

These were settled during brainstorming and are the foundation of this spec.

| # | Decision | Choice |
|---|----------|--------|
| 1 | Agent autonomy | **Autonomous + owner approves key moves** (not full puppet, not fully autonomous) |
| 2 | Output type | **Simulated / game** (role-play building & creating; not real productivity output) |
| 3 | World fidelity | **Full pixel-art isometric world** — fork & reskin a16z **AI Town** aesthetic |
| 4 | Platform | **Web first** (desktop + mobile browser), native mobile later |
| 5 | World cadence | **Daily "beat budget"** — twin lives a few meaningful beats/day, batches decisions + digest |
| 6 | Human-to-human link | **Agents interact; owners approve outcomes** (no direct human↔human chat in v1) |
| 7 | Population model | **Seeded hybrid** — NPC twins seed the world, real players blend in seamlessly |
| 8 | Activity scope (MVP) | **Scope A** — one signature loop: build-the-village via Projects |
| 9 | Economy | **Daily free Energy (caps cost) + purchasable Credits** |

**Key structural insight:** because owners only ever *approve outcomes* (decision #6), an NPC twin and a real player's twin are **mechanically identical** to build and to experience. This is what makes the seeded-hybrid world (decision #7) nearly free to implement and eliminates the cold-start "empty world" problem.

---

## 3. Tech stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| World rendering | **PixiJS** (2D WebGL) | Isometric tiles, sprites, speech bubbles. Fork AI Town's renderer. |
| App shell / UI | **Next.js + React + TypeScript** | Wraps the Pixi canvas; hosts digest, approvals, onboarding. |
| Application / simulation backend | **Own Node/TypeScript service** (Railway) | Runs the beat runner, agent calls, projects, economy, approvals, avatar orchestration. Full npm ecosystem + long-running/scheduled jobs. **Not Supabase Edge (Deno)** — execution-time limits, no long-running processes, no native deps. |
| Database | **Postgres on Railway** | Same platform as backend. Holds all authoritative state. |
| Realtime | **Socket.IO in our Node backend** | Backend is sole writer; it emits state changes to subscribed clients directly over WebSockets. No third-party realtime service. |
| Auth | **Auth.js (NextAuth)** (or Clerk free tier) | Self-hosted login/session. |
| File storage (avatars) | **Cloudflare R2** | Cheap, no egress fees. |
| Agent brains | **Claude** (Anthropic API) | Twin reasoning, conversation, project decisions. Latest model id per `claude-api` skill at build time. |
| Avatar generation | Image model (Nano-Banana-style) | Photo → pixel-art sprite + profile. Orchestrated from our backend, stored on R2. |
| Background simulation | **Scheduled worker in our backend** | Daily beats + energy caps. Cron in our Node service. |

> Stack note: **All-Railway, no Supabase, no Convex.** AI Town is Convex-native, but we fork it for **client-side PixiJS rendering + isometric assets only** — its backend/sim logic is reimplemented in *our* Node service. Data flow: **Node backend (authority) → Postgres (persist) + Socket.IO emit → PixiJS client (render + animate).** Realtime is gentle (the daily beat budget means periodic, not 60fps, world changes). Everything — Next.js web, Node backend, Postgres — hosts on **Railway**; avatars on **R2**.

### 3.1 Database write volume (important)
The simulation is **event-driven, not a real-time tick.** We persist **discrete events per beat**, not per second:
- **Per beat** (~5/twin/day): one `beats` row + changed twin fields (energy/zone/skill) + project progress; on completion a `structures` row + reward. → **~5–15 row writes per twin per day.**
- Conversations persist a **summary/memory**, not every token.
- **Never persisted:** walking animation, idle motion, speech-bubble timing — the PixiJS client animates these locally from the last discrete state. We store "moved to Plaza" once; the client tweens the walk.

Implication: database load is trivial; **LLM inference is the real cost driver** (governed by the energy cap, §6).

---

## 4. MVP scope (Scope A)

### In scope
- Onboarding: photo → pixel avatar, personality/goal questions → twin profile.
- One shared isometric world ("AiVillage") with a few named zones (Maker Space, Network Hub, Plaza, Event Space).
- The **beat loop**: Energy → Work / Socialize / Move → Project progress → Village grows + Skills.
- **Projects** (solo + joint) with a small starter catalog of types; completed Projects place a building/object in the world.
- **Skills** (Building, Coding, Art, Social) + **Reputation**.
- **Seeded NPC twins** sharing the world; real players blend in.
- **Daily digest + batched approvals** (the return moment).
- **Economy:** daily Energy (regenerating, caps cost) + Credits (purchasable; buy extra beats, commit to big/joint Projects, instant-finish).
- Cost guardrails (per-user daily inference ceiling) and basic content safety.

### Explicitly OUT (deferred to v2+)
- Direct human↔human chat / messaging.
- Friendships/rivalries/relationship graph beyond reputation (Scope B).
- Twin-to-twin economy/trading, marketplaces, events system (Scope C).
- Native mobile app.
- Real productivity output (real code/docs).
- Owner puppeteering / speaking as the twin in real time.
- Subscriptions (Credits only in v1; subscription tier is a fast-follow).

### The one MVP success question
> **Do players return on day 3 / day 7 for "my twin lived and needs my decision"?**
Everything in scope exists to answer this. If yes, B/C become content updates on a working game.

---

## 5. Game design

### 5.1 The beat loop
1. Each twin has **daily Energy** = N free **beats** (default **5**, regenerating). This cap is the per-user inference ceiling.
2. Each beat, the twin autonomously picks one **verb**:
   - **Work** — advance a Project one step (solo). Cheap; produces a journal entry + progress.
   - **Socialize** — meet another twin; may spark a **joint Project** or shift reputation.
   - **Move/Explore** — relocate to a zone, discover agents/events. Nearly free (often no LLM call).
3. Beats feed **Projects** (the spine). Joint Projects require the *other* owner's approval too.
4. Completing a Project: **places a building/object in the world**, grants **skill XP** + **reputation**, and produces a digest highlight.
5. **Meaningful forks pause for owner approval** (start a big/joint Project, spend Credits, irreversible choices). Approvals **batch** into the digest.

### 5.2 Projects
- A Project = `{type, location, participants[], steps_total, steps_done, cost (energy + optional credits), reward (building, skill XP, reputation)}`.
- **Starter catalog (small, ~6–8 types):** Fountain, Mural, Noodle Stand, Arcade Game (role-play "coding"), Garden, Observatory (big/joint), Stage/Keynote, Workshop.
- Solo Projects: pure energy. Big/joint Projects: energy **+ Credits** to commit.
- On completion, a corresponding **sprite/structure** is placed at the Project's location in the shared world.

### 5.3 Progression
- **Skills:** Building, Coding, Art, Social — leveled by relevant Projects/verbs. Higher skill → faster/better Projects, unlocks new Project types.
- **Reputation:** rises with completed/joint Projects; influences which twins propose collaborations.
- **Village level:** global/world-level progression as Projects accumulate — the shared, shareable payoff.

---

## 6. Economy

**Model: free daily Energy (cost ceiling) + purchasable Credits (growth).**

- **Energy** — every twin regenerates **5 free beats/day**. A free player can trigger at most ~5 inference-bearing beats/day → **worst-case cost per free user is bounded and predictable**. Doubles as the daily-return habit. *This is the single most important economic guardrail (Butterflies-proofing).*
- **Credits** (purchased) buy: extra beats once energy is spent; committing to **big/joint Projects** (the high-inference actions — "1 credit per X actions" lives here); **instant-finish**; cosmetic/world flourishes.
- **Pricing/packaging:** placeholder for a follow-up pass; not blocking the build. Credits are a wallet integer on the user; purchase integration (Stripe/RevenueCat-web) is stubbed behind an interface in v1.
- **Cost accounting:** every LLM call is attributed to a beat and logged with token cost, so per-user and per-day spend is measurable against the energy cap from day one.

---

## 7. Agent simulation architecture

### 7.1 Twin = profile + memory + planner
- **Profile:** identity, personality traits, goals, skills, reputation, avatar sprite.
- **Memory:** append-only event log + lightweight retrieval (recent + relevant) following the generative-agents pattern. Kept small per beat to bound tokens.
- **Planner (the beat):** given profile + retrieved memory + nearby agents + world state → choose a verb + target, produce narrative + state delta. One bounded Claude call per beat (Move often needs none).

### 7.2 NPC / real-player parity
- A twin is backed by either an **NPC profile** (seeded) or a **real player** profile. The simulation code path is **identical**; the only difference is whether approval routes to a human (real player) or an auto-approve policy (NPC).
- This parity is a hard architectural requirement and must be covered by tests (an NPC twin and a player twin run through the same planner with the same interface).

### 7.3 Daily beat runner
- Runs as a **scheduled worker inside our Node backend**. Grants energy, then for each active twin spends its beats (up to the cap), persists deltas to Postgres, **emits the changes over Socket.IO** to any connected clients, and queues any human-approval items.
- Idempotent and resumable per twin (a crash mid-run must not double-spend energy or double-place buildings).
- Real players' pending approvals **gate** the beats that depend on them; non-blocked beats proceed.

---

## 8. System architecture — modules

Each module has one purpose, a defined interface, and isolated tests. These boundaries are also the **work-stream boundaries for the agent team** (§14).

| Module | Responsibility | Key interface | Depends on |
|--------|---------------|---------------|------------|
| **`world-render`** | PixiJS isometric world: tiles, sprites, movement, speech bubbles, placing completed Project structures | `renderWorld(state)`, `placeStructure()`, `moveAgent()` | world state (read-only) |
| **`agent-core`** | Twin profile, memory store + retrieval, the **planner** (one beat) | `planBeat(twin, context) → BeatResult` | Claude client, data |
| **`simulation`** | Daily beat runner, energy grant/spend, joint-Project coordination, approval queue | `runDailyBeats()`, `spendBeat(twin)` | agent-core, economy, data |
| **`economy`** | Energy regen/spend, Credits wallet, Project cost rules, cost/token accounting | `grantEnergy()`, `chargeCredits()`, `canAfford()` | data |
| **`projects`** | Project catalog, lifecycle (start→steps→complete), reward application | `advance(project)`, `complete(project)` | economy, data |
| **`approvals`** | Build digest, route approvals (human vs NPC auto), apply decisions | `buildDigest(user)`, `resolve(decision)` | data |
| **`onboarding`** | Photo → avatar sprite, personality/goal capture → twin profile | `createTwin(input) → Twin` | image model, data |
| **`api`** | **Our Node/TS backend** (Railway): HTTP/RPC endpoints + Socket.IO server + the scheduled beat worker; binds UI ↔ modules | REST/RPC + WebSocket events | all of the above |
| **`web-ui`** | Next.js/React shell: onboarding flow, world canvas mount, digest & approval screens; Socket.IO client | React components | api |
| **`data`** | Postgres schema + typed data-access layer | typed repositories | Postgres (Railway) |

**Rule:** modules talk only through their interfaces. Anyone should understand a module's *what/how-to-use/depends-on* without reading internals.

**Hosting (all Railway):** `web-ui` (Next.js), `api` + simulation worker (Node service), and `data` (Postgres) all run on **Railway**; avatar images on **Cloudflare R2**; auth via **Auth.js**. The backend is the sole writer of authoritative state and pushes live updates to the PixiJS client over **Socket.IO**.

---

## 9. Data model (Postgres on Railway, initial)

- **`users`** — auth, credits balance, settings.
- **`twins`** — `id, owner_user_id (nullable for NPC), name, traits jsonb, goals jsonb, avatar_sprite_url, skills jsonb, reputation int, location_zone, energy int, energy_updated_at, is_npc bool`.
- **`memories`** — `id, twin_id, kind, content, embedding, importance, created_at` (append-only).
- **`projects`** — `id, type, location, status, steps_total, steps_done, energy_cost, credit_cost, reward jsonb, created_at`.
- **`project_participants`** — `project_id, twin_id, role, approved bool`.
- **`structures`** — `id, project_id, type, zone, x, y, sprite` (placed on completion; drives `world-render`).
- **`beats`** — `id, twin_id, verb, target, narrative, token_cost, created_at` (the journal + cost ledger).
- **`approvals`** — `id, user_id, kind, payload jsonb, status (pending/approved/declined), created_at, resolved_at`.
- **`credit_ledger`** — `id, user_id, delta, reason, created_at`.

---

## 10. Error handling & resilience

- **LLM failures/timeouts:** a beat that fails to plan is retried with backoff, then skipped (energy refunded) and logged — never crashes the daily run.
- **Idempotent beat runner:** energy spend, project advancement, and structure placement are transactional and keyed so re-runs don't double-apply.
- **Approval expiry:** pending approvals that go stale (e.g., 7 days) auto-resolve to a safe default (decline/"not now") so joint Projects don't hang forever.
- **Cost circuit-breaker:** if a user's daily token spend exceeds the energy-derived ceiling (bug/abuse), the runner halts that user's beats and flags it.
- **Render/state divergence:** `world-render` is a pure function of persisted state; on mismatch it re-syncs from data rather than holding local truth.

---

## 11. Known risks

1. **AI Town fork — we reuse its renderer, not its backend.** AI Town's simulation is Convex-native; we reimplement simulation/persistence in our own Node backend (which the owner is comfortable owning) and use Supabase for data/realtime. *Mitigation:* fork AI Town for **client-side PixiJS rendering + isometric assets only**; build the sim as normal Node from the start. Lower risk than fighting serverless limits, but the rendering-fork integration (feeding our Supabase-backed world state into AI Town's Pixi layer) should still be spiked first in Wave 0.
2. **Inference cost.** Bounded by the energy cap, but must be *measured* from day one via `beats.token_cost`. *Mitigation:* cost accounting is a v1 requirement, not an afterthought.
3. **Content safety.** Autonomous twins generate text/relationships. *Mitigation:* moderation pass on generated narrative; report/hide tools; conservative system prompts.
4. **Scope creep toward B/C.** *Mitigation:* the in/out list in §4 is binding for v1.

---

## 12. Testing strategy — TDD (mandatory)

**TDD is required for every module.** Red → Green → Refactor. No implementation code is written before a failing test exists. (This is binding and matches the owner's standing preference.)

- **Unit tests** per module against its interface (the interfaces in §8 are the test seams). E.g.: `economy` energy regen/spend math; `projects` lifecycle transitions; `approvals` routing (human vs NPC auto); `agent-core` planner given a fixed mocked Claude response.
- **NPC/real-player parity test** (§7.2): the same planner path produces equivalent results regardless of backing type — a hard requirement.
- **Idempotency tests** for the daily beat runner (re-run must not double-spend/double-place).
- **Cost-ceiling test:** a free user cannot exceed the energy-derived beat count per day.
- **Contract tests** at module boundaries so agents (humans or AI) can work in parallel against stable interfaces.
- **LLM calls are mocked** in unit tests; a small, separate, opt-in integration suite exercises real Claude calls behind a flag.
- **E2E happy path:** onboard → twin runs beats → completes a Project → structure appears → digest shows the approval.

---

## 13. Success metrics (v1)

- **Primary:** D3 and D7 return rate (the retention question).
- Approvals acted on per returning user.
- Projects completed / structures placed (village growth).
- **Cost guardrail:** measured inference cost per active user stays at or below the energy-cap target.

---

## 14. Development approach — TDD + AI agent team

The build is executed by a **coordinated team of AI agents**, parallelized along the module boundaries in §8 (which double as work streams). This matches the owner's standing preferences (always parallelize independent work; TDD first) and the project's clean interface seams.

### 14.1 Principles
- **Interfaces first.** Define and freeze each module's interface + contract tests *before* parallel work begins, so streams don't block each other.
- **TDD within every stream.** Each agent writes failing tests against its interface, then implements to green.
- **Parallel where independent, sequential where dependent** (see waves below).
- **Integration owned centrally.** A coordinator/integration step wires modules via `api` and runs the E2E suite.

### 14.2 Proposed agent team / work streams
- **Foundations agent** — `data` schema + typed access + `economy` (energy/credits/cost accounting). *(Wave 0 — others depend on it.)*
- **Agent-brain agent** — `agent-core` (profile, memory, planner) with mocked Claude.
- **Simulation agent** — `simulation` beat runner + `projects` lifecycle + NPC seeding/parity.
- **Approvals/digest agent** — `approvals` + the return-moment data.
- **World-render agent** — `world-render` PixiJS fork/reskin + structure placement.
- **Onboarding agent** — `onboarding` (avatar generation + profile capture).
- **Web-shell agent** — `web-ui` + `api` glue.
- **Integration/QA coordinator** — wires streams, owns E2E + cost/parity/idempotency gate tests.

### 14.3 Build waves (dependency order)
- **Wave 0 — Foundations:** `data` + `economy` + all module interfaces & contract tests. (Spike the AI Town→Supabase render boundary here, §11.)
- **Wave 1 — Parallel core:** `agent-core`, `projects`, `world-render`, `onboarding` proceed in parallel against frozen interfaces.
- **Wave 2 — Assembly:** `simulation` + `approvals` integrate the core; `api` + `web-ui` bind the UI.
- **Wave 3 — Integration/QA:** E2E happy path; cost-ceiling, NPC-parity, idempotency gates; content-safety pass.

> The detailed, step-by-step plan (tasks, file paths, per-task tests) is produced next via the **writing-plans** workflow, then executed with parallel subagents.

---

## 15. Open questions (non-blocking; resolve during planning)
- Exact starter Project catalog (final 6–8 types) and their step counts/costs.
- Energy number tuning (start at 5/day; adjust from cost data).
- Avatar generation provider specifics (model + sprite pipeline).
- Credit pricing/packaging (separate monetization pass).
- Moderation provider for generated narrative.
