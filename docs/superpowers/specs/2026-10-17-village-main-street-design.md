# AiVillage — Main Street: more places, more to do (design)

Date: 2026-10-17 · Status: draft for the owner's review · Builds on v4 (`docs/product/2026-10-17-aivillage-v4-local-village-plan.md`, commits f28137f, c5e13f1).

## 1. Why

The village feels empty. Twins have few things to do and few places to meet; the café — the main meeting place — is too simple. The owner wants to open the app and **watch** twins live a fuller life: swimming, cycling, working out, watching a film, gardening, riding a small rollercoaster, eating at the café — and resting when they are tired.

Success = opening the app and always seeing several twins clearly *doing* different, readable things in different places, and new places giving twins new reasons to meet.

## 2. What the owner decided

| # | Decision |
|---|---|
| O1 | **New places:** open-air cinema, bicycles, swimming pool, gym (you can see what each twin is doing), a better café (twins sit at tables and visibly eat/drink), hobby garden (grow vegetables → juice), a small **rollercoaster**. All in **one update** (not in steps). |
| O2 | **Activities last a few minutes.** Nothing grows over days, no schedules (no "film starts at 8 pm"). Twins come and go. |
| O3 | At the new places twins **mostly do the activity quietly**. No extra AI *conversations* are added for the new places (AI talk stays as today). |
| O13 | **Update (owner, same day): "to-do list" mode — one AI call plans a twin's next 3 activities; the twin asks again only when its list runs out.** The owner first picked one AI turn per activity, then switched to save money. Also: the village **auto-pauses** when the tab is hidden for 60 s or nobody touches it for 10 min, so a forgotten tab spends nothing. Original text: The owner accepts the higher cost (about 3–5× today) and will watch their usage for a few days. **Fallback if it costs too much:** switch to a "to-do list" mode — one AI turn plans the next 3–4 activities. Build so this switch is easy (see §6). |
| O4 | **Bigger map** (about 4× today's area). The player **drags to move around** and **rotates freely to see every angle**. |
| O5 | **Layout B — one main street**: a single winding street from the **shared house** (start) to the **rollercoaster** (end). Every place sits along it. Order along the street: House → Quiet corner → Café → Garden → Stage → Gym → Pool → Lawn → Cinema → Rollercoaster (from the chosen mockup; the builder may adjust exact spots). A bike lane runs along the street. |
| O6 | **Rollercoaster:** twins really ride it. Small track, **one cart** (2–4 seats). Twins queue, ride ~1 minute, sit in the cart, throw their arms up and show 😱 on the drop. |
| O7 | **Energy becomes real tiredness.** Activities use energy; twins get it back by **sleeping at home**, **sitting in the café**, or **resting in the quiet corner**. Today's "Energy 0/5" (a leftover from the old daily AI cap) goes away. |
| O8 | **One shared house** where all twins sleep (no house per twin, for now). |
| O9 | **Too tired:** if the player orders a tired twin to do something tiring, it answers *"I'm tired, let me rest first."* |
| O10 | The player's twin accepts orders for every new place ("go swimming", "take Sena to the cinema"), and the AI sends villagers to the new places by itself. |
| O11 | The cinema screen shows **simple moving colours and shapes**, not real films (copyright). |
| O12 | **Laptop heat stays a hard limit:** new moving things animate only when visible; the village must not run hotter than today. |

## 3. Goals, non-goals, anti-goals

**Goals**
- Each place has a clear, readable activity animation that works from the normal camera distance (~9–15 units away).
- Each place is reachable by an owner order, by the twin's own AI (planner `act`/`move`), and by the free-text mime path where it makes sense.
- Energy drives behaviour: tired twins rest, rested twins play.
- The map is bigger and pleasant to explore: drag to pan, free rotation, zoom.

**Non-goals (this update)**
- No growth over days, no timetables, no real films, no per-twin houses, no extra AI conversations at the new places, no multiplayer, no buying/economy.
- No change to how AI conversations, big moves or approvals work.

**Anti-goals (a failure even if it "works")**
- The laptop runs hotter than today (frame budget, idle 30 fps, demand frameloop must hold).
- Twins spend most of their time walking along a long street instead of doing things.
- Labels/badges become cluttered again (keep v4's ground-painted venue names; twin badges unchanged).
- Twins clip through each other or float/sink in seats, pool or cart in a way you notice.
- Unsafe or creepy actions sneak in through the new places (the v4 safety + consent rules still apply).

## 4. The places

Energy is shown as **0–100**. Numbers below are starting values the builder may tune.

| Place | What twins visibly do | Lasts | Energy | Capacity (my call) |
|---|---|---|---|---|
| 🏠 **Shared house** (street start) | Walk in through the door and sleep inside; 💤 floats above the roof; "Sleeping" status | until refilled (~2–3 min) | **refills to 100** | all twins |
| 🌳 **Quiet corner** | Sit on a bench, read, think | 1–2 min | **+20** | 2–3 |
| ☕ **Café** (upgraded) | Sit at **tables with chairs**; a cup/plate appears; drink, eat with small bites; pairs sit facing each other | 1–3 min | **+15** | ~6 (3 tables × 2) |
| 🥕 **Hobby garden** | Plant/dig → water → pick vegetables into a basket. Then the twin walks to the café and **drinks fresh juice** (glass prop) | 1–2 min + juice | **−10**, juice **+10** | 3 plots |
| 🎤 **Stage** | as today (perform, big moves) | — | −10 | 1 performer |
| 🏋️ **Gym** (open/glass sides, visible) | Treadmill run, lift dumbbells, bench press | 1–2 min | **−25** | 3 stations |
| 🏊 **Pool** | Swim lengths (swim animation, body half in water, splashes); 2 sun loungers to rest after | 1–2 min | **−25** (lounger +10) | 4 lanes + 2 loungers |
| 🌸 **Lawn** | as today (picnic, sit) | — | +10 | as today |
| 🎬 **Open-air cinema** | Sit in rows facing a big screen with moving abstract colours; popcorn; quiet | 2–3 min | **−5** | ~8 seats |
| 🎢 **Rollercoaster** (street end) | Queue → sit in the cart → ride the loop; arms up + 😱 on the drop → get off | ~1 min ride | **−15** | 1 cart, 2–4 seats |
| 🚲 **Bikes** (rack near the house) | Take a bike and ride along the bike lane (out and back), then park | 1–2 min | **−15** | 4 bikes |

Rules:
- **Tired threshold** (my call): energy **< 20** = tired. Tiring activities (negative energy) are refused for the player's orders with *"I'm tired, let me rest first."* — and the twin then **goes to rest by itself** (house if energy < 10, otherwise café or quiet corner). *(Going to rest afterwards is my guess at what the owner wants.)* Restful activities are always allowed.
- Social actions from v4 (hug, cheek kiss, high-five, chat) are not tiring and keep their consent rules.
- Energy is stored on the server (it must survive reloads and drive the AI), changes when an activity is ordered/chosen (cost or gain applied when the activity starts — my call, simpler than per-second accounting), and rest places refill on start too. The house refills to 100.
- The AI planner sees each twin's energy and the energy cost/gain of places; prompt wording should make tired twins choose rest.
- **While the app is closed, energy is frozen** (the village is paused; nothing refills or drains) — my call, consistent with v4's pause.
- **AI conversations with a busy twin** (my call): if the twin is at a calm place (café, cinema, lawn, quiet corner, sun lounger) the conversation happens **right there** and does not move it; if it is mid-ride / swimming / at the gym / cycling / asleep, it is **not available** for a conversation until the activity ends. Big moves and owner orders still interrupt, as today.
- The Inspector shows Energy 0–100 with a bar; the villager list status can show 😴 when tired.

## 5. The map and camera

- **Size:** about 4× today's area (today's island ≈ 12 × 12 tiles). Layout B: one winding main street (with a bike lane) through the whole island, places on both sides, house at one end, coaster at the other. Side paths only where needed.
- **Walking time:** a twin crossing the whole street should take well under a minute of real time. If that fails, raise walk speed on the street (my call) — anti-goal: twins spend their life walking.
- **Camera:**
  - **Drag to pan** across the map (left-drag pans; right-drag or two-finger rotates — common map controls; builder's choice of exact mapping).
  - **Free rotation:** full 360° around, and a wider tilt range (from near top-down to a lower, more cinematic angle).
  - Zoom in/out wider than today so the whole map fits when zoomed out.
  - Keep the camera buttons (zoom, rotate, home) and v4's "focus on a twin".
- **Labels:** keep v4 ground-painted venue names (now for every place); twin badges unchanged.

## 6. Orders and AI

- New owner commands (rule parser + Claude tool `do_action` catalogue), for example: "go swimming", "go to the gym", "work out", "ride a bike", "watch a movie", "take Sena to the cinema", "ride the rollercoaster", "go to the garden" / "pick vegetables", "make juice", "eat something at the café", "go to sleep" / "go home".
- "Take X to Y" = a social version: both twins go and do it together (consent rules as in v4; a refusal looks as in v4).
- Villagers: the planner's place list and action catalogue include all new places/actions with their energy effect; `move` targets include the new zones.
- **Next step after every activity (O13):** when a twin finishes an activity (or wakes up, or an order ends), the server asks the twin's AI for its next step (one planner call: place, partner, action — the existing `act`/`move` beat), with its energy and what it just did in the prompt. The world clock's periodic ticks still drive conversations and drama.
- **Keep the decision behind one seam** (e.g. a `nextSteps(twin)` that returns a queue): today it returns 1 step per AI call; the fallback "to-do list" mode returns 3–4 steps from one call. Switching later should be a setting, not a rewrite.
- **Chattiness still limits the bill:** calm/normal/busy also caps how many of these "next step" calls may run per minute (twins whose turn is delayed simply rest/loiter at their current place until it comes). Exact caps are the builder's call.
- **Cost estimate must be updated:** `packages/shared/src/aiCost.ts` and the Settings cost lines/README table must count the extra calls (rough guess with 10 twins on "normal": 3–5× today, e.g. Haiku 5.5 ≈ $0.15–0.30 / hour).
- Without an AI configured, twins fall back to simple rules (nearest free place that fits their energy), so the village still moves.

## 7. Bodies and animation (what the renderer must add)

New body animations (to the v4 procedural avatar): **swim**, **ride bike** (pedal, seated on a bike prop), **run** (treadmill), **lift** (dumbbells), **bench press**, **dig/plant**, **pick**, **eat at table** (already exists, needs a table/plate pose), **watch** (seated, occasional laugh/popcorn), **coaster ride** (seated, arms-up on drops), **sleep** (already exists; inside the house it can be hidden). New props: bike, dumbbells, popcorn, juice glass, basket with vegetables, plate with food.

Seated placement must look right on café chairs, cinema seats, coaster cart, sun loungers and bike saddle (v4 already sits on bench height 0.24–0.26; build/height vary).

## 8. Performance (hard limit, O12)

- All static scenery batched (as today's `StaticBatch`).
- Moving things — cinema screen, coaster cart, pool water, bikes — animate **only when on screen** and pause when the tab is hidden; the coaster cart moves only when someone rides.
- The v4 frame budget (idle 30 fps, interaction 60 fps, `frameloop="demand"`, `dpr ≤ 1.5`) stays and must be checked with the bigger map and 10 twins.

## 9. Data and upgrade

- New zone ids for the new places; existing ids (`plaza`, `maker_space`, `network_hub`, `event_space`) stay valid so saved twins, memories and the planner keep working.
- Saved poses from the old map may land somewhere odd on the new map: on first load after the update, reset saved poses (twins start at their zone) — my call.
- Energy: existing twins start at 100.

## 10. Testing

TDD for all logic: the next-step trigger and its per-minute cap (O13), the 1-step/list-mode seam, energy rules (costs, refill, tired threshold, refusal + go-rest), new action catalogue entries and parser phrases, zone/route layout (every place reachable along the street, walking time bound), planner prompt includes energy and new places, sim behaviour per place (capacity, queue for the coaster, seated placement, activity duration, juice chain). Visual checks in the browser for every animation and the camera. A frame-rate check with 10 twins on the new map.

## 11. Left to the builder

Exact positions along the street, the street's curve, art style of each place (match the current low-poly look), exact energy numbers within the spirit above, camera control mapping, how the house shows sleepers, animation details, and splitting the work into tasks.
