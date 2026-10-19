# Library and open-air kitchen — design

Date: 2026-10-19. Status: approved by the owner ("yes agree. start implementing").
Builds on: `2026-10-17-village-main-street-design.md` (Main Street map, places, energy, to-do list AI).

## Why

The village has places to play (gym, pool, coaster…) and places to rest (house, café, quiet corner),
but nothing about everyday life: studying, working, cooking a meal together. The owner wants two new
places that make the twins feel like they live there — and wants to **watch** them do it: see a twin
chop, cook in a pan, carry the plate to a long table and eat with friends.

Success: the owner says "cook pasta" and watches their twin walk to the kitchen, chop at the counter,
cook in a pan, sit at the long table and eat — with energy going down while cooking and up while
eating. Twins also go to the library on their own to read or study.

## Goals

1. **Library** — read books (rest) and study / do homework / work on a laptop (work).
2. **Open-air kitchen** — cook a dish step by step, then eat it at a long shared table.
3. Both places are chosen by the twins' own AI (to-do list mode) and can be ordered by the owner.
4. New energy rates per activity (below), shown live on the energy bar like today.

## Non-goals

- No recipes, ingredients stock, inventory or money.
- No new AI calls: the kitchen and library are just more options in the existing to-do list plan and
  the existing owner-chat reply. Cost must not change.
- The café stays exactly as it is (coffee, eat, juice). The quiet corner stays as it is (it keeps
  "read a book" at its current rate).

## Anti-goals (would be a failure even if it works)

- Cooking that is only a label with no visible steps — the owner wants to *see* it.
- A twin that "cooks" while standing still in a corner, or eats at the stove.
- Energy that jumps at once (the rule from the last change stays: energy changes only after arrival,
  one point at a time).

## The library

**Where** (my call, from the brainstorm: "near the quiet corner"): in the wooded north-west, just past
the Quiet Corner, so the quiet places sit together. Candidate: tile (−5, −6) → world (−8.5, −9.5),
pad radius ~1.9; its path leads through the Quiet Corner (edge LIBRARY–QUIET), so no new long road.
The builder may move it if the map tests disagree, keeping it next to the Quiet Corner.

**Look** (my call): an open pavilion like the gym (roof on posts, no front wall) so the owner can see
inside: two or three bookshelves, ~4 armchairs for reading, ~4 desks with laptops/notebooks for
studying, a reading lamp or two that glow at night.

**Activities** (owner decided the rates):

| Action | Aliases (owner can say) | Where | Energy | Duration (my call) |
|---|---|---|---|---|
| `read_library` "read a book in the library" | read in the library, go to the library | armchair | **+1 every 35 s** (owner: "every 30 or 40 s") | ~90 s |
| `study` "study" | study, do homework, work on the laptop, do some work | desk | **−1 every 60 s** | ~120 s |

"read a book" with no place keeps meaning the Quiet Corner (today's behaviour); "read in the library"
or "go to the library" goes to the library.

**Seats:** 4 armchairs + 4 desks → capacity 8 (my call). Library is **busy** (my call: twins there
are not pulled into conversations — it's a library).

**Animations:** read = the existing seated read pose with a book; study = seated at a desk, new
`type` animation (hands on a laptop) or `write` (pen on a notebook) — builder picks one or both.

## The open-air kitchen

**Where** (owner): **between the Quiet Corner and the Gym**, in the empty wooded area north of the
stage (owner's screenshot). Candidate: tile (0, −4) → world (−3.5, −7.5); path to the street node S2.

**Size** (owner): about the café's size (pad radius ~2.2).

**Look** (owner + my calls):
- a **counter / prep island** with cutting boards — the twin **cuts** vegetables, chicken or meat
  there; the food on the board is visible;
- a **stove with pans** and an **oven** — the twin **cooks in a pan** (steam rises; a dessert/cake
  goes in the oven, my call);
- a **long shared table** with benches/chairs — the twin **carries the plate** there, sits and
  **eats**; twins who cook at the same time can sit together.
- Open-air: no walls; a light roof or pergola over the counter is fine (my call).

**Capacity** (my call): 4 cooking spots (each a board on the counter + a burner) and 8 seats at the
long table; place capacity 4 (the number cooking at once).

**The sequence for one dish** (owner, timings my call — about 2–3 minutes in all):

| Step | Where | What you see | Energy | Time |
|---|---|---|---|---|
| 1. Prepare | counter | chopping motion, the ingredient on the board | **−1 every 10 s** | ~25 s |
| 2. Cook | stove (or oven for dessert) | stirring/flipping, pan with the dish, steam | **−1 every 10 s** | ~35 s |
| 3. Carry | walk to the table | plate in hand | — | a few s |
| 4. Eat | long table, seated | eating the dish with a fork | **+1 every 5 s** | ~60 s |

So one meal costs about −6 and gives about +12. Drinks (juice, smoothie, lemonade) skip the stove:
prepare at the counter (blender), then drink at the table (my call).

**Dishes** (owner list): hamburger, chicken, steak, pasta, dessert, juice, other drinks. Each has its
own look on the board, in the pan and on the plate (my call: low-poly, like the café's items).
"cook X" with a dish not on the list (e.g. "cook sushi") still works: the twin cooks it, the label and
captions say the asked name, and the 3D food uses the closest look (rice/fish → generic plate, my call).

**Asking for it** (owner): "cook pasta", "make a hamburger", "cook something", "make juice in the kitchen" → the twin
goes and cooks it (no dish named → it picks one). The twin's own AI also chooses to cook when free and
picks a dish (owner: yes). An invited partner ("cook pasta with Sena") cooks next to it and eats
beside it (my call, same as today's "take Sena to the cinema").

**Words** (my call, after the builder check): the café keeps every phrase it has today ("juice",
"make juice", "drink juice", "eat", "have lunch"…). The kitchen takes "cook …" (any dish), "make /
prepare + a kitchen dish" ("make a hamburger", "make pasta"), and anything said "in the kitchen".

Kitchen is **not busy** (my call): twins eating together at the table can be part of conversations.

## Energy (owner decided the rates)

| Activity | Rate |
|---|---|
| sleep at the house | +1 / 4 s (unchanged) |
| eat what you cooked (kitchen table) | **+1 / 5 s** |
| café, quiet corner, lawn, sunbathe | +1 / 15 s (unchanged) |
| read in the library | **+1 / 35 s** |
| prepare + cook in the kitchen | **−1 / 10 s** |
| study / laptop in the library | **−1 / 60 s** |
| gym, pool, bikes, coaster, garden, stage, cinema | −1 / 6 s (unchanged) |

Today the rate depends only on the place (`stepMs` in `packages/shared/src/energy.ts`: home fast,
other rest slow, all tiring −1/6 s) and one order has one target (`energyTo`). The kitchen needs
**two phases in one order** (down while cooking, up while eating) and per-activity rates. The builder
decides the mechanism (e.g. an order carries a short list of energy phases with their own rate and
length), but these rules from the last change must keep holding:

- energy changes only after the twin **arrives** (`arrivedAt`), one point at a time;
- `settleEnergy` keeps progress when an order is replaced, without losing part-steps;
- the card's energy bar moves live between server updates (`energyPlan`), green stripes when rising;
- the planner prompt and the rule fallback know each activity's net effect (cook+eat ≈ +6 net,
  study ≈ −2, read ≈ +2–3).

## Tired twins (owner decided)

- A tired twin (energy below 20) goes **home to sleep** — no longer the café or quiet corner (their
  rest is slow now: +1 / 15 s).
- **Cooking counts as tiring** (it costs energy before the meal gives it back): a tired twin asked to
  cook answers "I'm tired, let me rest first." and goes home to sleep.
- **Once a twin starts cooking it always finishes and eats**, even if energy runs low while cooking.

## Constraints

- No extra AI calls; no background work without an open, active tab (auto-pause unchanged).
- Laptop heat: animate only what's on screen (existing `onScreen` visibility helpers); keep mesh counts
  modest (the venues already batch static parts).
- `LAYOUT_VERSION` bumps (new places on the map) so old saved poses are ignored.
- Places stay inside the island, pads don't overlap, spots stay off roads, the street walk stays under
  45 s (existing layout tests).
- TDD: tests first; shared + web + backend suites and typecheck green before "done".
- Max 10 twins; capacities above are per place.

## Left to the builder

- Exact coordinates, pad radii, furniture layout, colours, low-poly food models.
- The energy-phase mechanism (within the rules above).
- Exact durations within the "about" values above.
- Whether study uses a laptop, a notebook, or both.
- How the cook's plate is carried (item in hand, like today's items).
