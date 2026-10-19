# Library and Kitchen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a library (read / study) and a visible open-air kitchen (prep → cook → eat at a long table) to the Main Street village, with per-activity energy rates and "tired twins go home".

**Architecture:** Shared contracts first (places, actions, dishes, energy phases, zones), then the web layout (positions, spots). After that three parallel tracks along module boundaries: backend (orders, parsing, planner), web sim + avatar (what twins do and hold), web 3D venues (what places look like). Energy stays server-authoritative and moves only after arrival.

**Tech Stack:** pnpm monorepo · TypeScript strict · vitest (TDD) · Express + Socket.IO + drizzle/Postgres · Next 14 + React Three Fiber 8.

**Spec:** `docs/superpowers/specs/2026-10-19-library-and-kitchen-design.md`

## Global Constraints

- No new AI calls; nothing runs without an open, active tab (auto-pause unchanged).
- Energy changes only after `arrivedAt`, one point at a time; `settleEnergy` must stay exact (no lost part-steps).
- Rates: sleep +1/4 s · kitchen eat +1/5 s · café/quiet/lawn/sunbathe +1/15 s · library read +1/35 s · kitchen prep+cook −1/10 s · library study −1/60 s · other tiring −1/6 s.
- Tired (< 20) → home to sleep. Cooking is tiring. A started meal always finishes.
- Café keeps all its phrases; kitchen = "cook …", "make/prepare <kitchen dish>", "… in the kitchen".
- `LAYOUT_VERSION` = 4. Pads don't overlap, inside the island, spots off roads, street walk < 45 s.
- Animate only on-screen things; modest mesh counts.

## Review Focus

1. "cook sushi" (dish not on the list) → cooks, label says "sushi", generic plate look (Task 1 `dishLookFor`, Task 3 parse test).
2. Owner order replaces a cooking twin mid-meal → energy gained/lost so far is kept (Task 1 settle test with phases).
3. A twin at energy 3 that already started cooking → energy floors at 0, then rises while eating (Task 1 live test).
4. "work out" must still mean the gym, not "study" (Task 3 parse test).
5. 5th twin wants the kitchen (capacity 4) → it's full; planner and orders pick something else (Task 3 placeOptions test).

---

### Task 1: Shared contracts (me)

**Files:** Modify `packages/shared/src/{places,actions,energy,world,types}.ts`; Create `packages/shared/src/dishes.ts`; Tests `packages/shared/test/{places,actions,energy,dishes}.test.ts`.

**Produces:**
- `PlaceId` += `"kitchen" | "library"`. `PLACES`: `kitchen` ("the kitchen", 🍳, stamina **+6** net, capacity **4**, main `cook`, restful **false**, busy false); `library` ("the library", 📚, stamina **+2**, capacity **8**, main `read_library`, busy **true**). `p()` gains `opts.restful`.
- `restPlaceFor(stamina)` → always `"home"` (tired twins sleep).
- `BODY_ANIMS` += `"chop" | "stir" | "type"`. `ActionItem` += `"book" | "laptop" | "dish"`.
- Actions: `cook` ("cook a meal", 🍳, anim `chop`, 125 s, place kitchen, item dish, aliases cook / cook something / cook a meal / make a meal / cook dinner / cook lunch / make food), `read_library` ("read in the library", 📚, anim read, 90 s, place library, item book, aliases read in the library / go to the library), `study` ("study", 💻, anim type, 120 s, place library, item laptop, aliases study / do homework / homework / work on the laptop / work on my laptop / do some work).
- `PerformedAction.dish?: Dish`.
- `dishes.ts`: `type DishLook = "burger" | "chicken" | "steak" | "pasta" | "dessert" | "salad" | "drink" | "plate"`; `interface Dish { name: string; look: DishLook }`; `KITCHEN_DISHES: Dish[]` (hamburger, chicken, steak, pasta, dessert/cake, salad, juice, smoothie, lemonade); `dishLookFor(name: string): DishLook` (keywords; unknown → "plate"); `isDrinkLook(look): boolean`; `kitchenSteps(look): { step: "prep" | "cook" | "carry" | "eat"; seconds: number }[]` — food: prep 25, cook 35, carry 5, eat 60; drink: prep 20 (blend), carry 5, eat 40 (no cook); `kitchenEnergyPhases(look): EnergyPhase[]` from those steps (prep/cook −1/10 s, carry 0, eat +1/5 s).
- `energy.ts`: `interface EnergyPhase { ms: number; everyMs: number; dir: 1 | -1 | 0 }`; `EnergyOrder.energyPhases?: EnergyPhase[] | null` (when set, it wins over `energyTo`; phases run back to back from arrival, clamped 0–100 at every step, stop at holdUntil); `settleEnergy` drops finished phases / shortens the current one and moves `arrivedAt`; `isCharging` true in a rising phase; `energyPlanOf` copies `energyPhases`; library rates in `stepMs` (zone `library`: gain 35 s, drain 60 s); `ENERGY_LIBRARY_READ_MS = 35_000`, `ENERGY_STUDY_MS = 60_000`, `ENERGY_COOK_MS = 10_000`, `ENERGY_EAT_MS = 5_000`.
- `world.ts`: `DEFAULT_ZONES` += kitchen tile (0, −4) → world (−3.5, −7.5); library tile (−5, −6) → world (−8.5, −9.5). `ZONE_DISPLAY` "THE KITCHEN" / "THE LIBRARY"; `ZONE_EMOJI` 🍳 / 📚; taglines. `LAYOUT_VERSION = 4`.

- [ ] Tests first: energy phases (live: 60 s cook from 50 → 44, then eat 60 s → 56; floor at 0 from 3; settle exact over many settles with phases; isCharging only while eating), dishes (`dishLookFor("Cheese burger")` = burger, "sushi" = plate, "orange juice" = drink; drink steps have no "cook"), places (capacities, restPlaceFor(15) = home), actions (cook/study/read_library resolve; "work out" still resolves to work_out).
- [ ] Implement; `npx vitest run` + `npx tsc --noEmit -p .` in packages/shared green.

### Task 2: Web layout (me)

**Files:** Modify `apps/web/lib/village/layout.ts`, `apps/web/components/village/scenery.ts`; Tests `apps/web/test/village/layout.test.ts`.

**Produces:** NODES `KITCHEN`, `LIBRARY`; EDGES `KITCHEN–S2`, `LIBRARY–QUIET`; `PAD_RADIUS.kitchen ≈ 2.2`, `library ≈ 1.9`; `ActivityKind` += `"counter" | "stove" | "table" | "armchair" | "desk"` with `SEAT_Y`; constants `KITCHEN = { counters: Pt[4], stoves: Pt[4], table: { x, z, w, d }, seats: Pt[8] }`, `LIBRARY = { shelves, armchairs: Pt[4], desks: Pt[4] }` (relative); spots: counter-i, stove-i, table-i, armchair-i, desk-i. Spots-per-capacity test: kitchen counts counters (4), library armchairs+desks (8).

- [ ] Tests first (existing map tests + spot counts + kitchen table seats face the table); implement; web tests green.

### Task 3: Backend (helper A)

**Files:** `apps/backend/src/chat/commands.ts`, `src/sim/activity.ts`, `src/agent/{nextStepPlanner,planner}.ts`, `src/sim/{nextStepLoop,runDay,orderedTalk}.ts`, `src/chat/twinChat.ts`, tests.

- Parse "cook X" / "make|prepare <kitchen dish>" / "… in the kitchen" → act `cook` with `dish`; library phrases → `read_library` / `study`; café phrases unchanged; "work out" stays gym.
- Orders for `cook`: `energyPhases = kitchenEnergyPhases(dish.look)`, no `energyTo`; hold = actHoldMs(cook). Library: `energyTo` as usual (rates come from zone).
- `isTiring(cook)` = true (first phase drains). Tired → home (`restPlaceFor`), `REST_ACTION` home only used.
- Planner / next-step JSON accepts `"dish"`; rule fallback picks a random `KITCHEN_DISHES` entry; prompts list kitchen ("cook a dish, −6 then +12") and library activities.
- Partner cooking ("cook pasta with Sena") cooks the same dish beside the twin.
- Ack copy: "On it — cooking pasta!".

### Task 4: Web sim + avatar (helper B)

**Files:** `apps/web/lib/village/sim.ts`, `apps/web/components/village/avatar/*`, tests `apps/web/test/village/{sim,avatarPose,avatarAnims}.test.ts`.

- Kitchen task: claim counter i (+ stove i + a free table seat); steps from `kitchenSteps(look)`: prep at counter (anim chop), cook at stove i (anim stir), carry plate to the seat (item dish), eat seated (anim eat). Expose per-spot state for the venue: `kitchenState(): { counters: (DishLook|null)[]; stoves: (DishLook|null)[]; seats: (DishLook|null)[] }`.
- Library: armchair → seated read with book; desk → seated type with laptop.
- New anims chop / stir / type; items book / laptop / dish (uses `DishModel` from Task 5).

### Task 5: Web 3D venues (helper C)

**Files:** Create `apps/web/components/village/venues/{kitchen,library}.tsx`, `apps/web/components/village/dishes.tsx`; modify `venues.tsx`/`World.tsx` registration, `decor.ts` keep-outs, ground labels.

- `DishModel({ look, stage }: { look: DishLook; stage: "raw" | "pan" | "plate" })`.
- Kitchen: pergola, prep island with 4 boards (raw dish when a twin preps), 4 burners with pans (dish + steam when cooking), an oven, long table with 8 seats (plates when eating). Reads `sim.kitchenState()`, animates only on screen.
- Library: open pavilion, shelves, 4 armchairs, 4 desks with laptops, lamps glowing at night.

### Task 6: Finish (me)

- README places table + energy table; aiCost unchanged (no new calls). Run shared + web + backend suites + typecheck; browser check (close the tab); memory note.
