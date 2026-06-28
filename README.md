# AiVillage

> Create your digital twin, give it goals, and watch it live, work, socialize, and build a shared world — stepping in to approve the moments that matter.

AiVillage is a **social life-simulation game** — think *The Sims* × a living, global world, inspired by Google's Antigravity Orbit demo. You create an avatar and an AI **twin**. Your twin lives semi-autonomously in a shared, Antigravity-style pixel-art world, meets other twins, and collaborates to **build the village** — pausing for **your approval on the moves that matter**.

The heart of it is the **return moment**: you open the app and your twin has *lived a little while you were away* — made progress, met someone, and now needs a decision from you.

---

## Status

🚧 **Pre-development.** The design is complete and the implementation plan is next.

- 📄 Design spec: [`docs/superpowers/specs/2026-06-28-aivillage-design.md`](docs/superpowers/specs/2026-06-28-aivillage-design.md)
- 📝 Concept source (Antigravity demo summary): [`src/docs/aivillage.md`](src/docs/aivillage.md)

---

## How it works

Everything is **one loop**, repeating daily:

```
⚡ Daily Energy  →  Work · Socialize · Move  →  🏗️ Project progresses  →  🏠 Village grows + 📈 Skills
        ↑__________________  digest + your approvals when you return  __________________↑
```

- **Your twin acts on its own** toward the goals you set — but **asks for your approval** on meaningful moves (starting a big or joint project, spending credits, irreversible choices).
- **A daily "beat budget"** means your twin lives a few meaningful moments per day, then hands you a digest + batched decisions. This keeps it feeling alive *and* keeps running costs bounded.
- **Projects are the spine.** Solo or joint, they take several beats to finish, and completed projects become **real buildings in the shared world** — the village is built, brick by brick, by twins worldwide.
- **A seeded, hybrid world.** It's populated with AI NPC twins from day one and real players' twins blend in seamlessly — so it feels alive immediately, with no empty-world cold start.

## Economy

- **Energy** — free, regenerates daily. This cap is the cost ceiling (and the daily-return habit).
- **Credits** — purchasable; buy extra beats, commit to big/joint projects, or instant-finish.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| World rendering | **PixiJS** (2D WebGL, isometric) — client renderer reskinned from a16z's *AI Town* |
| App shell / UI | **Next.js + React + TypeScript** |
| Backend + simulation | **Own Node/TS service on Railway** (beat runner, agents, economy) |
| Database | **Postgres on Railway** |
| Realtime | **Socket.IO** (backend pushes world updates to clients) |
| Auth · Storage | **Auth.js** · **Cloudflare R2** (avatars) |
| Agent brains | **Claude** (Anthropic API) |
| Avatars | Image model — photo → pixel-art sprite |

> The database stores **discrete events** (~5–15 rows per twin per day), not per-second state — the client animates movement locally. The real cost driver is LLM inference, capped by the daily Energy system.

## Development approach

- **Test-Driven Development (TDD) is mandatory** — red → green → refactor, tests before implementation.
- Built by a **coordinated team of AI agents**, parallelized along clean module boundaries.

See the [design spec](docs/superpowers/specs/2026-06-28-aivillage-design.md) for the full module breakdown, data model, testing strategy, and build waves.

---

## Roadmap (high level)

- **v1 (Scope A)** — the signature build-the-village loop, seeded hybrid world, energy + credits, web.
- **v2+** — richer social/relationships, twin-to-twin economy & events, native mobile.

---

_Greenfield project, started 2026-06-28._
