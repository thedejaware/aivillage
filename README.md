# AiVillage

Your own private village of AI twins, running on your computer.

You build twins that look like you and your family. You talk to your main twin and give it orders. The twins live, talk and act on their own. They are powered by **your** AI model.


https://github.com/user-attachments/assets/612e0353-8ec7-450a-97ba-004bb3fcab7f


---

## Quick start

You need only **Docker**. Nothing else.

**1. Install Docker Desktop**

- macOS: [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) (Apple Silicon and Intel both work)
- Windows: [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- Linux: [Docker Engine](https://docs.docker.com/engine/install/) with the Compose plugin, or [Docker Desktop for Linux](https://docs.docker.com/desktop/setup/install/linux/)

Start Docker Desktop and wait until it says it is running.

**2. Get AiVillage and start it**

```bash
git clone https://github.com/thedejaware/aivillage.git && cd aivillage && docker compose up -d
```

The first start builds the app. This takes a few minutes. Later starts are fast.

**3. Open http://localhost:3000**

Follow the setup:

1. **Choose your AI** — pick a provider, paste your key and pick a model (see below).
2. **Build your twin** — your name and your look.
3. **Add your people** — build more twins (for example your family), or press "Fill with random villagers". Up to 10 twins can live in the village.

You can change all of this later on the **⚙️ Settings** page: switch the AI, add or edit twins, hide a twin, or delete it.

The village pauses when you close the app. When you open it again, every twin is where you left it.

---

## What you can do

**Build twins that look like real people.** The avatar editor works like Bitmoji:

- Choose a gender first. It gives a starting face, body and hairstyle.
- Then change every part yourself:
  - **Body:** skin tone, build, height.
  - **Face:** face shape, expression, eyes and eye colour, eyebrows, eyelashes, nose, mouth, lip colour, blush, facial hair.
  - **Hair:** style and colour.
  - **Style:** clothes, clothes colour, glasses and accessories.
- Clothes, hair and facial hair are open to everyone.

**Explore Main Street.** One winding street runs from the shared house to the rollercoaster. Drag to move around the map, Shift + drag (or right-drag) to rotate, two fingers on the trackpad or the mouse wheel to zoom. Along the street:

| Place | What twins do there | Energy |
|---|---|---|
| 🏠 The house | sleep (they go inside; 💤 shows on the roof) | back to 100 |
| 🌳 Quiet corner | read and rest on the bench | +20 |
| 🚲 The bikes | ride along the street and back | −8 |
| ☕ The café | sit at a table, eat, drink coffee or fresh juice | +15 (juice +10) |
| 🥕 The garden | dig, plant and pick vegetables — then juice at the café | −5 |
| 🎤 The stage | sing and perform | −5 |
| 🏋️ The gym | treadmill and weights | −12 |
| 🏊 The pool | swim lengths, or sunbathe on a lounger | −12 (lounger +10) |
| 🌸 The lawn | picnic and sit | +10 |
| 🎬 The cinema | watch a movie under the sky, with popcorn | −3 |
| 🎢 The rollercoaster | queue, ride, arms up on the drop 😱 | −8 |

**Energy.** Every twin has energy from 0 to 100 (see it in the twin's card). Activities use it; resting gives it back. Energy changes only once the twin gets there, one point at a time: resting gives +1 every 4 seconds (the bar fills while you watch), tiring activities take −1 every 6 seconds. A twin sent home sleeps until its energy is full. Below 20 a twin is tired: it rests first (the house when it's nearly empty, otherwise the café or the quiet corner). If you tell a tired twin to do something tiring, it answers "I'm tired, let me rest first."

**Talk to your twin.** Your main twin is you in the village. Chat with it at the bottom left. It remembers what you tell it, and it does what you ask, if it can:

| You type | Your twin… |
|---|---|
| `go to the café` | walks to the café and sits down |
| `talk to Sena` | walks to Sena and starts a conversation |
| `tell Sena dinner is ready` | walks to Sena and passes the message on |
| `jump`, `dance`, `wave`, `take a nap` | does it |
| `wash your hands`, `drink coffee`, `read a book` | walks to the right place and does it |
| `go swimming`, `work out`, `ride a bike`, `watch a movie`, `ride the rollercoaster`, `pick vegetables`, `make juice`, `go to sleep` | goes there and does it |
| `take Sena to the cinema` | invites Sena; both go — **if Sena agrees** |
| `hug Sena`, `kiss Sena on the cheek`, `high five Omar` | walks to them and does it — **if they agree** |
| `play the guitar` (anything else) | acts it out, if it is safe |
| `stay here` / `do whatever you want` | stays put / goes back to its own life |

**Rules.** Twins say no to things that are not OK:

- No violence and nothing sexual.
- Kisses are on the cheek only.
- Twins can't fly, teleport or leave the island.
- Touching (hug, cheek kiss) needs consent. A twin who doesn't like yours enough says no.

**Watch the village live its life.** While the app is open, the AI plans each twin's next few activities (a short to-do list: where to go, with whom, what to do), using their personality, friendships and energy. Twins become friends or rivals, and big moments show as captions. Before your twin makes a big dramatic move, it asks you first.

**Main twin and villagers**

- You can make several main twins, but only one is active at a time. Only the active one listens to you. Switch in Settings.
- **Hide a twin** (deactivate) to take it out of the village. Everything about it is kept, and it comes back exactly as it was.
- **Delete a twin** to remove it and everything about it, forever.

---

## Choosing an AI

AiVillage does not include an AI. You connect your own, on the **Settings** page.

| Provider | What it is | Get a key |
|---|---|---|
| **Anthropic** (recommended) | Claude models. Claude Haiku is fast and very cheap. | [platform.claude.com](https://platform.claude.com/settings/keys) |
| **OpenRouter** | One key, models from many companies | [openrouter.ai](https://openrouter.ai/settings/keys) |
| **Google Gemini** | Gemini models. Has a free tier. | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **OpenAI** | GPT models | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Ollama** | Free. Runs on your own computer. No key. | [ollama.com](https://ollama.com/download) |

**You need an API key, not a chat subscription.** A Claude Pro/Max or ChatGPT Plus plan does not work here: these companies don't allow other apps to use your subscription. Create an API key on the provider's developer site instead. You pay there with prepaid credit, separate from any subscription.

**Pick a model.** After you choose a provider, the model list shows our suggestions (the cheapest good one is marked "recommended"). When you paste your key, the list also shows every chat model on your account. You can also type any model name.

**Your key stays on your computer.** It is saved in the village database on your machine. It is never sent to us.

**You pay your provider.** Every time a twin thinks or talks, the app makes an AI call on your account. The **chattiness** setting decides how often twins act. Twins also ask their AI what to do next: one call plans their next 3 activities. Settings shows an estimate for the model you picked. With Claude Haiku 5.5 it is roughly:

| Chattiness | AI calls per hour | Cost per hour (Claude Haiku 5.5) |
|---|---|---|
| Calm | about 125 | about $0.04 |
| Normal | about 260 | about $0.08 |
| Busy | about 440 | about $0.13 |

These are estimates, for while the village is open. Nothing runs when the app is closed. The village also pauses by itself when its tab is hidden for a minute, or when nobody touches it for 10 minutes; click to continue. Set a spending limit in your provider's dashboard to be safe.

### Where the AI is used

Every AI call goes to the model you chose, on your key. These are all of them:

| When | What the AI does | How often |
|---|---|---|
| You chat with your twin | Writes your twin's reply, and notes new facts about you to remember | 1 call per message you send |
| The village lives | Twins talk to each other and decide on big moves | Set by chattiness; only while the village is open |
| A twin finishes its to-do list | Plans the twin's next 3 activities | 1 call per 3 activities; only while the village is open |
| You send your twin to talk to someone | Writes that conversation when your twin arrives | 1 call per order |
| You approve a big move | Plays out that move | 1 call |
| Settings → random villagers | Invents new twins (name, personality) | 1 call per click |
| Settings → test connection | A tiny check that your key works | 1 call per test |

**Chat cost stays flat.** Each chat message sends only a fixed amount of context: the last 12 chat messages, a few recent village memories, and what your twin knows about you. A long chat does not make later messages more expensive. With Claude Haiku 5.5 one message costs about $0.0003.

### Using Ollama (free, local)

1. Install Ollama from [ollama.com](https://ollama.com/download).
2. Download a model:

   ```bash
   ollama pull llama3.2
   ```

3. In Settings, choose **Ollama** and the model `llama3.2`.

The app reaches Ollama on your computer at `http://host.docker.internal:11434`. A local model uses a lot of your computer's memory (several GB) and makes it work hard. Replies can be slower than a cloud AI.

### Setting the AI with environment variables (optional)

If you prefer, you can set an Anthropic key when you start the app:

```bash
LLM_PROVIDER=anthropic LLM_MODEL=claude-haiku-5-5 ANTHROPIC_API_KEY=sk-ant-... docker compose up -d
```

You can also put these lines in a file named `.env` next to `docker-compose.yaml`. This key is used only until you save an AI on the Settings page. Most players do not need this. Use the Settings page.

---

## Everyday commands

Run these in the `aivillage` folder.

| What | Command |
|---|---|
| Start | `docker compose up -d` |
| Stop (your village is kept) | `docker compose down` |
| Update to the newest version | `git pull && docker compose up -d --build` |
| Reset the village (deletes all twins and chats) | `docker compose down -v` |
| See the logs | `docker compose logs -f backend` |

### Change the ports

The app uses port **3000** (web) and port **4000** (backend). To use other ports:

```bash
WEB_PORT=3100 API_PORT=4100 docker compose up -d --build
```

Then open http://localhost:3100. Use `--build` when you change `API_PORT`, because the web app stores the backend address when it is built.

---

## Troubleshooting

**"port is already allocated" / "address already in use"**
Another program uses port 3000 or 4000. Pick other ports (see "Change the ports" above).

**The page opens but the village does not load**
The backend may still be starting. Wait 30 seconds and reload. Check it with `docker compose ps` — all three services should be `healthy` or `running`. Look at `docker compose logs backend` for errors.

**Ollama is not reachable**
- Make sure Ollama is running (`ollama list` should work).
- On **Linux**, Ollama listens only on `127.0.0.1` by default, so Docker cannot reach it. Start it with `OLLAMA_HOST=0.0.0.0 ollama serve`, or set `OLLAMA_HOST=0.0.0.0` in its service settings.
- On macOS and Windows, Docker Desktop handles this for you.

**Apple Silicon (M1/M2/M3/M4)**
Works out of the box. All images run natively on ARM.

**Start completely fresh**
`docker compose down -v` deletes the village database. The next `docker compose up -d` starts an empty village.

**"Could not connect" when testing the AI**
- Check the key: copy it again, without spaces.
- Check that your provider account has credit.
- If you typed a model name, check its spelling, or pick one from the list.

---

## For developers

AiVillage is a pnpm workspace:

| Folder | What |
|---|---|
| `packages/shared` | Shared TypeScript types and logic: looks, actions and rules, orders, world state, cost estimate (used as source, no build step) |
| `apps/backend` | Node + Express + Socket.IO on :4000, Postgres with drizzle-orm. AI providers in `src/agent/providers/`, the village (twins, settings) in `src/village/`, the world clock and AI beats in `src/sim/` |
| `apps/web` | Next.js 14 (app router) on :3000. The 3D village uses React Three Fiber (`components/village/`); avatars are built in code (`components/village/avatar/`); Settings and setup are in `app/settings`, `app/setup` and `components/settings/` |

You need Node 20+ and pnpm 9 (`corepack enable`).

**1. Start Postgres** (Docker Desktop, or Colima on macOS). Dev uses port **5433**:

```bash
docker run -d --name aivillage-pg -p 5433:5432 \
  -e POSTGRES_USER=aivillage -e POSTGRES_PASSWORD=aivillage -e POSTGRES_DB=aivillage \
  postgres:16-alpine
```

Later, start it again with `docker start aivillage-pg`.

**2. Install and set up**

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env   # then edit it (the AI key there is optional)
pnpm --filter @aivillage/backend db:push          # apply the schema
```

**3. Run**

```bash
pnpm --filter @aivillage/backend dev   # http://localhost:4000
pnpm --filter @aivillage/web dev       # http://localhost:3000
```

**Tests**

```bash
pnpm -r test        # all packages
pnpm -r typecheck
```

Backend database tests start their own Postgres with testcontainers. With **Colima**, export these first:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE="/var/run/docker.sock"
export TESTCONTAINERS_RYUK_DISABLED="true"
```

**Docker images**

`docker-compose.yaml` builds `apps/backend/Dockerfile` and `apps/web/Dockerfile` from the repo root. On every start, the backend applies the schema with `drizzle-kit push --force` and then starts the server.

**Model list and prices**

The suggested models and their prices are in `apps/backend/src/agent/providers/types.ts`. They were checked on 2026-10-17. Providers change models and prices often, so check them again from time to time.

Product plan: [`docs/product/2026-10-17-aivillage-v4-local-village-plan.md`](docs/product/2026-10-17-aivillage-v4-local-village-plan.md).
