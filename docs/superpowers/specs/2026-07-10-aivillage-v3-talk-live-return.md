# AiVillage v3 — Talk · Live · Return

**Date:** 2026-07-10 · **Status:** approved for build
**Supersedes the loop of:** v2 reality-show spec (village/drama engine is kept as the stage)

## 1. The pivot in one paragraph

The village is not the product; the **relationship with your twin** is. The owner talks
to their twin (chat is the primary interface). The twin turns what it learns into
goals, opinions and gossip, and lives it out in the village **continuously — no
"Live a day" button**. When something meaningful happens, the twin comes back to the
owner with news and a decision. Evidence: spectator-shaped AI products die
(Nothing-Forever ~8 viewers); owner-as-protagonist products win (Tolan $12M ARR,
Status #27 grossing). See `docs/product/2026-07-10-aivillage-product-assessment.md`.

## 2. The v3 core loop

| Phase | What happens | Surface |
|---|---|---|
| **TALK** | Owner chats with twin. Twin replies in character, references its village life, asks about the owner. New personal facts are extracted → memories (`owner_fact`). New instructions → twin goals. | Chat panel (new) |
| **LIVE** | World clock ticks all day. Each tick a few energy-holding twins take one beat (chat/bond/scheme/bigmove). Owner facts feed the planner → the village *visibly reacts to what you told your twin*. | 3D world (exists) |
| **RETURN** | Big moves still gate on owner approval; digest panel shows "while you were away". (Push notifications: v3.1) | Side panel (exists) |
| **SHARE** | Twin quotes + drama moments are screenshot-able. (Dedicated share cards: v3.1) | — |

## 3. Continuous world clock (replaces "Live a day")

- `startWorldClock(emitFrames, llm)` — `setInterval` every `WORLD_TICK_SECONDS` (default 120).
- Per tick: refill energy once per UTC day (`grantDailyEnergy`), then pick up to
  `WORLD_MAX_ACTORS_PER_TICK` (default 2) twins to act **one beat** via
  `runDay(llm, { onlyTwinIds, beats: 1, useStoredEnergy: true })`.
- **Spread:** actors are picked with probability `remainingBeats / remainingTicksToday`
  (pure fn `pickActors`, unit-tested) so the day's drama is spread across the real day
  instead of burning all energy in 10 minutes.
- **Cost ceiling unchanged:** `DAILY_ENERGY` (5) beats per twin per UTC day, now spent
  from *persisted* energy instead of being reset per run.
- Frames are emitted on the existing `"day"` socket event — client playback unchanged.
- The 9am cron and the manual button are removed; `/api/run-day` stays as a debug hook.

## 4. Twin chat

### Data
```sql
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  twin_id uuid not null references twins(id),
  role text not null,            -- 'owner' | 'twin'
  content text not null,
  created_at timestamptz not null default now()
);
```

### API
- `POST /api/chat` `{ userId, message }` → `{ reply, facts, goal }`
- `GET /api/chat?userId=` → last 30 messages (chronological)

### Brain (`src/chat/twinChat.ts`)
Prompt = persona + village memories (recent 6) + known owner facts + last 12 chat
turns + the new message. Model returns strict JSON:
`{"reply": "...", "facts": ["new personal fact", ...], "goal": "new goal or null"}`
- `reply` → persisted as twin message
- each `facts[]` item → memory `kind='owner_fact', importance=3` (max 3 per turn)
- `goal` → prepended to `twin.goals` (kept ≤ 3)
- Parser is defensive: if JSON is malformed, the raw text becomes the reply and
  nothing else is extracted (`parseChatReply`, unit-tested).

### Chat → planner pipe
`runDay` now **preloads** each actor's recent memories (was: empty at start) and
separates `owner_fact` memories into `ctx.ownerFacts`. `buildPrompt` gains:
"Your owner told you about their life: … Let it drive your gossip, goals and choices."
This is the moment the product becomes magical: you tell your twin you have a crush,
and an hour later it's gossiping about it at the café.

## 5. Frontend

- **New:** `TwinChat` panel (bottom-left, monospace dark UI): history, input,
  optimistic send, "twin is thinking…" state.
- **Removed:** "▶ Live a day" button (world lives on its own).
- Unchanged: 3D canvas, caption bar, approvals, leaderboard, digest.

## 6. Config

| Env | Default | Meaning |
|---|---|---|
| `WORLD_TICK_SECONDS` | 120 | world clock interval |
| `WORLD_MAX_ACTORS_PER_TICK` | 2 | LLM-cost throttle per tick |
| `LLM_PROVIDER` / `ANTHROPIC_API_KEY` | (existing) | twin brains; canned fallback |

## 7. Testing

- `parseChatReply`: valid JSON / markdown-fenced / garbage → raw-text fallback.
- `pickActors`: spreads beats across remaining ticks; never exceeds cap; drains
  exactly remaining energy by end of day.
- Existing suites untouched; `runDay` default path behaves as before
  (`useStoredEnergy` is opt-in).

## 8. Migration

`pnpm --filter @aivillage/backend db:push` (adds `chat_messages`).

## 9. Out of scope (v3.1 backlog)

Push notifications for the return moment · share cards · friend-twin invites ·
mobile packaging · Higgsfield rigged/animated characters.
