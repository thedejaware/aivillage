# AiVillage v4 — your own village, on your own computer

**Date:** 2026-10-17 · **Status:** approved by Mehmet, in build
**Builds on:** v3 (talk · live · return) and the 2026-10-06 owner-orders work.

## 1. Why

The village must feel like *yours*: your own twins (your family if you want),
built the way you look, that do what you ask — and it must run on *your* AI,
not ours. v4 turns AiVillage into an open-source app you run locally with one
command.

## 2. Decisions (made by Mehmet)

| # | Decision |
|---|---|
| D1 | **Open source, self-hosted.** People clone the GitHub repo and run it. One install = one private village. No hosted youraivillage.com for now. |
| D2 | **Only Docker is required.** `docker compose up` starts database + backend + web. |
| D3 | **No login.** It is one person's local app. |
| D4 | **Bring your own AI.** One model per village, chosen on a Settings page: OpenRouter, Anthropic, Google Gemini, OpenAI (API key) or Ollama (local, free). The key is stored in the local database on the player's own machine. We never pay for or hold anyone's key. |
| D5 | **Up to 10 twins live in the village.** The player creates them (e.g. a whole family) or creates one and presses "fill with random villagers". |
| D6 | **Main twins.** A player can create several main twins; exactly one is *active*. Only the active main twin is chatted with and given orders. It talks to the others on the player's behalf. Deactivate = hide it from the village, keep all its data, return exactly as it was. Delete = remove everything (memories, feelings, chat, approvals). Any twin can be deleted from Settings (with a confirmation). Deactivated twins don't count toward the 10. |
| D7 | **Pause, don't run in the background.** When the app is closed the village stops. When it opens again, every twin is exactly where it was. (No "while you were away" digest for now — possible later as one AI call on return.) |
| D8 | **Avatar builder:** full name, gender, skin tone + face, hair (+ colour), glasses / accessory, clothes (not filtered by gender). |
| D9 | **Clever = obedient + capable.** The twin does what it is asked if it physically can: a real-life action catalogue plus free "mime" actions, under rules. |
| D10 | **Talk is not rationed.** The 5-per-day cap goes. While the app is open twins talk about once a minute ("chattiness": calm / normal / busy). Orders from the player ("go talk to Mom") run whenever asked. All of it is paid by the player's own AI. |
| D11 | **AI-driven movement.** Every few minutes the AI picks each twin's next goal (a place, a person, an action). Code does the walking. No pure random wandering. |
| D12 | **Random villagers:** random looks from the avatar parts; the AI writes name + personality (preset fallback if no AI is set). |
| D13 | **Start fresh:** existing seeded NPCs and test twins go away. |
| D14 | Main-screen layout cleanup is a **separate, later** project. |

## 3. Calls I made (Claude) — check these

- **Avatars are built in code** (low-poly "chibi" made of parts: head, face, hair, glasses, torso, arms, legs), not loaded models. Reason: every builder option works and limbs can animate (jump, wave, hug…). The two old GLB models are retired.
- **One OpenAI-compatible client** covers OpenRouter, OpenAI, Ollama and Gemini (Google's OpenAI-compatible endpoint); Anthropic uses its own SDK. Tool calling works on all of them.
- **One local owner.** The database keeps the `users` table; the app creates a single local owner on first run.
- **Saved poses.** The browser saves each twin's exact position/activity every few seconds and on close; the village restores them on open.
- **Consent for touch.** Hugs/cheek kisses/high-fives depend on how the other twin feels (rivals may refuse — and the refusal is drama).

## 4. Actions (D9)

A shared catalogue (`packages/shared/src/actions.ts`). Each action has: id,
label, emoji, kind (`self` / `social` / `chore`), whether it needs a target,
whether it needs consent, an optional place (e.g. the sink), and the body
animation the renderer plays.

Catalogue v1 (≈30): walk/run/follow (orders), jump, wave, dance, sit, sleep,
clap, point, cheer, stretch, laugh, cry, think, wash hands, eat, drink coffee,
read, phone call, sweep, water plants, exercise, hug, kiss on the cheek,
high-five, handshake, dance together, give a message.

**Mime:** anything else the AI wants ("playing guitar") is performed with the
nearest base animation + a label/emoji.

**Rules:** world (no flying, no leaving the village, no teleporting), safety
(no violence, nothing sexual — kisses are on the cheek only; blocked words are
turned into a polite in-character refusal), consent (touch depends on feelings).

## 5. Stages (build order)

1. **Foundation (backend + shared):** twin appearance/role/status columns,
   settings table, twin create/update/delete/activate APIs, max-10 rule,
   delete cascade, fresh-start seed, pause (world clock ticks only while a
   browser is connected), saved poses.
2. **Your own AI:** provider clients (Anthropic + OpenAI-compatible), settings
   read at runtime, model test button, chattiness → tick rate, daily cap removed.
3. **Avatars:** procedural chibi characters + action animations; avatar builder
   with live 3D preview.
4. **Actions:** catalogue, consent, safety, `do_action` tool for the main twin,
   order kind `act`, social actions walk to the target first.
5. **Settings + first run:** setup wizard (AI → main twin → more twins / random
   fill), Settings page (AI, twins: create, edit look, activate/deactivate, delete).
6. **Clever autonomy:** the planner picks goals (place + person + action) for
   non-main twins; the client walks there and performs it.
7. **Docker + README:** `docker-compose.yaml`, Dockerfiles, schema push on boot,
   a 3-step README with screenshots.

## 6. Testing

TDD for all logic: shared catalogue/consent/safety, appearance validation and
randomizer, repositories and APIs (testcontainers), provider request/response
mapping (fake fetch), pause/tick logic, sim behaviour for actions. Visual work
is checked in the browser.

## 7. Out of scope (later)

Hosted multi-user site · player-to-player contact · main-screen layout redesign
(D14) · "while you were away" digest · voice.
