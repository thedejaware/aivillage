# AiVillage v2 — "The Reality Show" Pivot

**Status:** Approved (Mehmet, 2026-07-05)
**Supersedes:** the *activity layer* of `2026-06-28-aivillage-design.md` (§5 Game design). All engine sections (economy, agents, approvals gate, data, realtime, rendering) remain in force.

## Why

Play-testing the build-the-village loop showed the output (structure sprites) carries no emotional value — "twins building fountains is not fun" (owner's verdict). What is fun in every agent-world demo — and what players actually remember from The Sims — is **social drama**. The pivot swaps the content verb, not the engine.

## One sentence

Your twin lives among others, forming friendships, rivalries and crushes — you make its big social decisions, and the whole village competes for popularity.

## The daily loop (unchanged energy cap, new verbs)

| Verb | What happens | LLM cost |
|---|---|---|
| `chat` | Twin has a short conversation with a target twin: one call generates 2–4 lines + how each side's feelings shift | 1 call |
| `bond` | Deliberate relationship-deepening act (help, gift, invite) | 1 call |
| `scheme` | Pursue the twin's social goal (make allies, campaign, stir the pot) | 1 call |
| `move` | Relocate | 0 |

Building drops out of the planner verbs; existing structures stay as scenery.

## Relationships (the heart)

- **Directed** twin→twin score in [-100, 100]; conversations/bonds/schemes apply deltas.
- Label derived from score (pure fn): nemesis ≤ -60 < rival ≤ -25 < acquaintance < 25 ≤ friend < 60 ≤ close friend.
- Threshold crossings emit **drama moments** that feed digests ("Lena and Murat are now rivals").

## Approvals get juicy (same gate, new payload kinds)

`confront`, `confess_friendship`, `throw_party`, `spread_rumor`, `reconcile` — generated when the twin's planner proposes a big social action; owner approves/declines; approved actions run in the next beats (catch-up run on approve stays).

## Popularity + leaderboard (the scoreboard)

- Popularity = mean of incoming relationship scores (plus event bonuses later).
- Live leaderboard in the owner panel. Later: weekly **village election** — relationships become votes; winner is Mayor.

## Digest = episode

Owner panel shows: what the twin did, who it met, relationship changes (Lena +12 → Friend), and the pending decision as a cliffhanger.

## Build plan

1. **Relationships**: shared types + label fn, `relationships` table + repo, `converse()` module (structured LLM output → lines + deltas + optional drama moment). TDD.
2. **Social planner + drama approvals**: planner v2 prompt (social verbs, relationship context), runDay wiring (chat pairing, delta application, threshold moments, social approval kinds), episode digest.
3. **Popularity + leaderboard**: pure scoring + `/api/leaderboard` + panel UI; onboarding re-flavored to social goals.

Deploy gate unchanged: ship to ~20–50 people, measure D3/D7 return + approvals acted on.
