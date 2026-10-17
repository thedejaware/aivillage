# Village Main Street Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 4× bigger village on one winding main street with 7 new places (shared house, gym, pool, open-air cinema, hobby garden, bikes, rollercoaster) plus an upgraded café; real energy (0–100); one AI turn each time a twin finishes an activity.

**Architecture:** Shared data (places, energy rules, actions, zones) drives everything. The backend owns energy and decides each twin's next step (AI or rules) as an auto `act` order with a duration; the browser sim walks the twin to a free spot of that place and plays the activity; the renderer draws places at layout coordinates shared with the sim. Moving scenery animates only when visible.

**Tech Stack:** pnpm monorepo · TypeScript strict · vitest · Express + Socket.IO + drizzle (Postgres) · Next 14 + React Three Fiber 8 + drei 9.

**Spec:** `docs/superpowers/specs/2026-10-17-village-main-street-design.md` (decisions O1–O13).

## Global Constraints

- Energy is **0–100** ("stamina" in code; the old `energy` field stays as the legacy beat budget used by `runDay`). Tired = **< 20**; exhausted = **< 10**.
- Energy effects: gym −25, pool −25 (lounger +10), bike −15, coaster −15, garden −10, stage −10, cinema −5, café +15, juice +10, quiet corner +20, lawn +10, house → 100.
- Refusal copy, exactly: **"I'm tired, let me rest first."**
- Capacities: café 6 seats (3 tables × 2), gym 3 stations, pool 4 lanes + 2 loungers, cinema 8 seats, coaster 1 cart × 4 seats, bikes 4, garden 3 plots, quiet corner 2 bench seats, house = all.
- One AI turn per finished activity, capped per minute by chattiness: calm **3**, normal **6**, busy **10**. Without AI → rule-based next step.
- Energy frozen while the app is closed (all loops pause when unwatched, as today).
- Laptop heat: `frameloop="demand"`, idle 30 fps, dpr ≤ 1.5 stay; moving scenery animates only when visible.
- Existing zone ids stay: `plaza`, `maker_space`, `network_hub`, `event_space`. New ids: `home`, `garden`, `gym`, `pool`, `cinema`, `funfair`, `bike_rack`.
- Saved poses from the old map are ignored (pose `layout` must equal `LAYOUT_VERSION = 2`).
- TDD everywhere logic lives; visual work checked in the browser. Don't kill the user's dev servers (:3000 web, :4000 backend watcher). Never write test data into the user's DB.

## Review Focus

1. **A twin whose next-step AI call fails or returns junk** → it must still get a rule-based step (never stand frozen forever). Test in Task 3.
2. **A place at capacity** (5th swimmer, 2nd coaster group) → the twin queues (coaster) or goes elsewhere; nobody stacks on one spot. Tests in Tasks 3 and 4.
3. **Owner order to a tiring place while tired** → exact refusal copy and the twin goes to rest; a restful order still works. Test in Task 3.
4. **Old village data after the update** (old poses, old 0–5 energy values, old zone names) → twins start at their zones with stamina 100 and nothing crashes. Tests in Tasks 1 and 3.
5. **Tab hidden / app closed mid-activity** → nothing drains or advances; on return twins continue. Test in Task 3 (loop paused when unwatched).

---

### Task 1: Shared foundation — places, energy, actions, zones, cost (main session)

**Files:**
- Create: `packages/shared/src/places.ts`, `packages/shared/test/places.test.ts`
- Modify: `packages/shared/src/actions.ts`, `types.ts`, `world.ts`, `orders.ts`, `aiCost.ts`, `index.ts`; tests `actions.test.ts`, `aiCost.test.ts`, `twinView.test.ts`

**Interfaces — Produces:**
- `MAX_STAMINA = 100`, `TIRED_BELOW = 20`, `EXHAUSTED_BELOW = 10`, `LAYOUT_VERSION = 2`
- `type PlaceId = "home"|"network_hub"|"maker_space"|"garden"|"plaza"|"gym"|"pool"|"event_space"|"cinema"|"funfair"|"bike_rack"`
- `interface PlaceDef { zone: PlaceId; label: string; emoji: string; stamina: number; capacity: number; restful: boolean; busy: boolean /* no conversations while doing it */; mainAction: string }`; `PLACES: PlaceDef[]`; `placeOf(zone: string): PlaceDef | undefined`
- `applyStamina(stamina: number, zone: string, delta?: number): number` (clamped 0–100; `home` → 100)
- `isTired(stamina: number): boolean`; `restPlaceFor(stamina: number, random?: () => number): PlaceId` (< 10 → `home`, else `maker_space` or `network_hub`)
- `staminaDelta(action: PerformedAction | ActionDef): number` (place's effect; social/self actions without a place → 0; `drink_juice` +10)
- `BODY_ANIMS` gains `"swim" | "bike" | "run" | "lift" | "dig" | "watch" | "ride"`; `ActionDef`/`PerformedAction` gain `item?: "juice" | "plate" | "popcorn" | "basket" | "dumbbell" | null`
- New `ACTIONS`: `swim`(pool, swim, 90 s), `work_out`(gym, lift, 80), `run`(gym, run, 70), `ride_bike`(bike_rack, bike, 80), `watch_movie`(cinema, watch, 150, popcorn), `ride_coaster`(funfair, ride, 60), `garden`(garden, dig, 80, basket), `drink_juice`(maker_space, drink, 40, juice), `sleep` → place `home`, 150 s; `eat` gets item plate, seconds 60
- `resolveAction` accepts a target for **place** actions too ("take Sena to the cinema"): `targetName` kept, consent uses `consentMin -10`
- `actHoldMs(action: PerformedAction): number` = `(action.seconds + 40) * 1000`
- `Twin.stamina?: number`; `WorldTwinView.stamina: number`; `TwinPose.layout?: number` (toWorldState passes a pose only when `layout === LAYOUT_VERSION`); `TwinDetail.stamina: number`
- `DEFAULT_ZONES` + `ZONE_DISPLAY` + `ZONE_TAGLINE` + `ZONE_EMOJI` for all 11 zones (tiles below)
- `NEXT_STEP_CAP: Record<Chattiness, number>` = calm 3, normal 6, busy 10 (per minute); `callsPerHour(chattiness, twins = MAX_TWINS)` = clock calls + `min(cap × 60, twins × 24)` → calm **225**, normal **420**, busy **600**

Zone tiles (world = tile − 3.5): home (−7, 3) · network_hub (−4, −2) · bike_rack (−5, 6) · maker_space (−1, 6) · garden (2, 8) · plaza (4, 1) · gym (7, −2) · event_space (7, 8) · pool (11, 0) · cinema (11, 9) · funfair (13, 4).

- [ ] Write failing tests: `places.test.ts` (every zone has a PlaceDef; house refills to 100; clamp 0–100; `isTired(19)` true / `isTired(20)` false; `restPlaceFor(5) === "home"`; `restPlaceFor(15)` ∈ café/quiet), actions (`findAction("go swimming")`→swim, "work out", "ride a bike", "watch a movie", "ride the rollercoaster", "pick vegetables"→garden, "make juice"→drink_juice, "go to sleep"→sleep; `resolveAction({action:"watch_movie", target:"Sena"})` keeps target; `staminaDelta` values), aiCost (calm 225, normal 420, busy 600; Haiku normal ≈ $0.13), twinView (pose with layout 1 → null; stamina defaults 100).
- [ ] Run `pnpm --filter @aivillage/shared exec vitest run` → FAIL.
- [ ] Implement; run → PASS; `tsc --noEmit` clean.

### Task 2: Map layout — street, places, spots, coaster track (main session)

**Files:** Modify `apps/web/lib/village/layout.ts`, `apps/web/components/village/scenery.ts` (`PAD_RADIUS`, `NODE_ZONE`, `SEAT_Y` only); test `apps/web/test/village/layout.test.ts`

**Interfaces — Produces:**
- `GRID_MIN = -8`, `GRID_MAX = 15` (world −11.5…11.5, `ISLAND_HALF = 12`)
- `NODES`/`EDGES`: venue centre nodes + street spine `S0 (−9,0) S1 (−7,−1.5) S2 (−4.5,−0.5) S3 (−2,1.5) S4 (0.5,0.5) S5 (3,−1) S6 (5.5,0.5) S7 (7.5,1)`; spine `HOME–S0–S1–…–S7–FUN`; branches QUIET–S1, BIKES–S0, CAFE–S2, GARDEN–S3, STAGE–S4, GYM–S5, LAWN–S6, POOL–S7, CINEMA–S7
- `ActivityKind` = `"coffee"|"bench"|"blanket"|"stage"|"bed"|"treadmill"|"weights"|"swim"|"lounger"|"cinema"|"plot"|"coaster"|"bike"`; `SPOTS` per Global capacities (house: 1 `bed` spot at the door, shared)
- `COASTER_TRACK: { x: number; y: number; z: number }[]` closed loop around the funfair centre with one drop; `coasterPose(t: number): { x; y; z; yaw; pitch }` for `t ∈ [0,1)`; `COASTER_QUEUE: Pt[]` (4 spots); `COASTER_RIDE_SECONDS = 40`
- `BIKE_ROUTE: Pt[]` = rack → S0 … S7 → back to rack
- `SEAT_Y` for every kind; `PAD_RADIUS` for every zone

- [ ] Failing tests: every zone centre reachable via `findRoute` from `home`; walking the whole street at `WALK_SPEED` takes < 45 s; no two pads overlap; every SPOT lies inside the island and off the street; spot counts equal capacities; `coasterPose` is continuous (consecutive samples < 0.3 apart) and its lowest point is ≥ 0.2.
- [ ] Implement; tests PASS; `tsc` clean (other web code may break — owned by Tasks 4–5).

### Task 3: Backend — stamina, next step, orders, conversations (agent A)

**Files:** `apps/backend/src/db/schema.ts` (+`stamina integer default 100 not null`), `test/db/helpers.ts`, `src/db/twinRepository.ts`; create `src/agent/nextStepPlanner.ts`, `src/sim/nextStepLoop.ts` (+ tests); modify `src/chat/commands.ts`, `src/chat/twinChat.ts`, `src/sim/worldClock.ts`, `src/sim/runDay.ts`, `src/api/server.ts`, `src/api/twinDetail.ts`, `src/village/village.ts`

**Interfaces:**
- Consumes Task 1 exports.
- Produces `interface NextStep { zone: PlaceId; action: string; partner: string | null; narrative: string }`; `planNextSteps(twin, ctx, llm): Promise<NextStep[]>` (returns 1 step now; list mode later returns 3–4 — the seam for O13's fallback); `ruleNextStep(twin, ctx, random): NextStep`; `applyStep(db, twin, step, now): Promise<Twin>` (sets an `auto: true` act order with `holdUntil = now + actHoldMs`, applies stamina, memory "act"); `startNextStepLoop({ emitWorld, isWatched, getLlm, getChattiness, db?, now?, random? }): { stop(); tick(): Promise<number> }` (5 s interval, per-minute cap = `NEXT_STEP_CAP`).
- `ctx` for the planner: stamina, what it just did, places with effect + free slots, nearby names, relationships, owner facts.

- [ ] TDD: next-step prompt lists places + stamina + "tired twins rest"; parse valid/invalid JSON; invalid/failed AI → rule step (Review Focus 1); full place never chosen (Review Focus 2); tiring step while tired → replaced by a rest step; loop does nothing when unwatched (Review Focus 5); cap honoured per minute; twin with an active owner order skipped; main twin included when free.
- [ ] TDD: owner `act`/`go` to a tiring place with stamina < 20 → reply exactly "I'm tired, let me rest first." and an auto rest order (Review Focus 3); new phrases parse ("go swimming", "work out", "ride a bike", "watch a movie", "take Sena to the cinema", "ride the rollercoaster", "pick vegetables", "make juice", "go home", "go to sleep") and zone aliases (gym, pool, cinema, garden, home/house, coaster/rollercoaster/funfair/lunapark, bike); Claude `do_action` tool lists the new actions.
- [ ] TDD: `pickActors` skips owner orders and `busy` places but keeps twins at restful places; `runDay` conversation with a twin at a restful place happens there and does not move it; busy twins are not offered as conversation partners.
- [ ] TDD: stamina persists; old rows read as 100 (Review Focus 4); `savePoses` stores `layout: LAYOUT_VERSION`; twinDetail returns stamina.
- [ ] Wire `startNextStepLoop` in `server.ts` next to the world clock (same `isWatched`, `getLlm`, `getChattiness`).
- [ ] Full backend suite green (with the testcontainers env).

### Task 4: Village sim, camera, HUD (agent B)

**Files:** `apps/web/lib/village/sim.ts`, `test/village/sim.test.ts`, `components/village/VillageCanvas.tsx`, `Twins.tsx`, `components/hud/Inspector.tsx`, `VillagerList.tsx`, `app/page.tsx`, `components/settings/AiSettingsForm.tsx`, `lib/settings/models.ts` (+ test), `lib/village/venueLabels` usage, `README.md` cost table

**Interfaces:**
- Consumes Tasks 1–2.
- Produces on `VillageSim`: `coaster: { t: number; running: boolean; riders: string[] }` (renderer reads it); per twin `hidden: boolean` (asleep in the house), `seatY: number`, existing `anim`; `avatarPose` passes `item` from the order's action. `bikesInUse(): number`.

- [ ] TDD: an act order with a place walks to a **free** spot of that place's kind and plays its anim for `action.seconds`; capacity respected (5th swimmer waits/loiters — Review Focus 2); coaster: riders queue at `COASTER_QUEUE`, ride starts when the cart is free, riders follow `coasterPose(t)` seated, arms up (`cheer`) near the drop, get off after `COASTER_RIDE_SECONDS`; bike: follows `BIKE_ROUTE` with anim `bike` and returns; house: twin walks to the door then `hidden = true` until the order ends; pool: swims lane end-to-end, `bodyLift` −0.35; café pairs face each other; old pose (layout ≠ 2) ignored.
- [ ] Camera: drei `MapControls` behaviour — left-drag pans on the ground, right-drag/two-finger rotates 360°, polar 0.15–1.45, distance 5–60, target clamped inside the island; HOME fits the whole map; buttons still work.
- [ ] Ground labels for all 11 zones; Inspector shows Energy 0–100 bar (amber < 20); villager list shows 😴 when tired; Settings cost lines + README table use the new `callsPerHour`.
- [ ] `tsc` + web tests green; browser check: pan/rotate, labels, a twin swimming/riding.

### Task 5: Places in 3D (agent C)

**Files:** `apps/web/components/village/venues.tsx` (split into `venues/*.tsx` if large), `ground.tsx`, `World.tsx`, `materials.ts`, `parts.tsx`

**Interfaces:** Consumes Task 2 (`NODES`, `EDGES`, `SPOTS`, `PAD_RADIUS`, `SEAT_Y`, `COASTER_TRACK`, `coasterPose`) and Task 4 (`sim.coaster`, `sim.bikesInUse()`).

- [ ] Bigger island slab, verge, roads from `EDGES`, pads, bike lane on the street; decor (trees, bushes, lamps) spread over the new area via `isClear`.
- [ ] Models (low-poly, matching today's style), props exactly at `SPOTS`: shared house with door + lit windows + 💤 sign when anyone sleeps; café upgrade (3 tables × 2 chairs, plates/cups); gym (open sides: treadmill, weights rack, bench); pool (4 lanes, 2 loungers, water); open-air cinema (screen + 8 seats in 2 rows; screen shows moving abstract colours via a small canvas texture, updated only when visible); hobby garden (3 plots with vegetables, watering can, crate); rollercoaster (track along `COASTER_TRACK`, supports, station, one 4-seat cart placed by `coasterPose(sim.coaster.t)`); bike rack with 4 bikes (`sim.bikesInUse()` hides that many).
- [ ] Static scenery inside `StaticBatch`; animated pieces (screen, water, cart) skip work when off-screen or the tab is hidden.
- [ ] Browser check every place up close and from the default view; frame budget unchanged (idle ~30 fps).

### Task 6: Avatar animations and items (agent D)

**Files:** `apps/web/components/village/avatar/*`, tests in `apps/web/test/village/`

**Interfaces:** Consumes Task 1 `BodyAnim` additions + `item`. `AvatarPose` gains `item?: "juice"|"plate"|"popcorn"|"basket"|"dumbbell"|null`.

- [ ] Anims: `swim` (front crawl, horizontal body), `bike` (seated, pedalling legs, hands forward; the avatar draws its own small bike), `run` (treadmill jog in place), `lift` (dumbbell curls / overhead press), `dig` (plant/pick, bent over), `watch` (seated, relaxed, occasional laugh/popcorn to mouth), `ride` (seated, gripping bar; arms up when `animTime` crosses the drop — sim also sets `cheer`).
- [ ] Items: juice glass, plate with food (eat at table), popcorn tub, basket of vegetables, dumbbells.
- [ ] Pure pose math tested (continuity, seated hip heights per kind); visual check in a temporary lab route, deleted afterwards.

### Task 7: Integrate, verify, ship (main session)

- [ ] Merge agent work; full suites green (shared, web, backend with testcontainers env); `tsc` everywhere.
- [ ] Browser: new map loads (old poses ignored), every place used by twins, an owner order per place, tired refusal, coaster ride, frame rate idle ~30 fps.
- [ ] README (places + energy + cost), memory/wiki update; ask the owner before commit + push.
