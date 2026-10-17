# AiVillage

Your own private village of AI twins, running on your computer.

You build twins that look like you and your family. You talk to your main twin and give it orders. The twins live, talk and act on their own. They are powered by **your** AI model.

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

1. **Choose your AI** — pick a provider and paste your key (see below).
2. **Build your twin** — name, look, hair, clothes.
3. Add more twins (for example your family), or fill the village with random villagers. Up to 10 twins can live in the village.

You can change all of this later on the **⚙️ Settings** page: switch the AI, add or edit twins, hide a twin, or delete it.

The village pauses when you close the app. When you open it again, every twin is where you left it.

---

## Choosing an AI

AiVillage does not include an AI. You connect your own. You choose it on the **Settings** page.

| Provider | What it is | Get a key |
|---|---|---|
| **OpenRouter** | One key, many models from many companies | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Anthropic** | Claude models | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Google Gemini** | Gemini models | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **OpenAI** | GPT models | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Ollama** | Free. Runs on your own computer. No key. | [ollama.com/download](https://ollama.com/download) |

**Your key stays on your computer.** It is saved in the village database on your machine. It is never sent to us.

**You pay your provider.** Every time a twin thinks or talks, the app makes one AI call on your account.

**Cost tip:** cheap "lite" models are enough for villagers. For example Claude Haiku, Gemini Flash-Lite or GPT mini models. Set a spending limit in your provider's dashboard.

### Using Ollama (free, local)

1. Install Ollama from [ollama.com](https://ollama.com/download).
2. Download a model:

   ```bash
   ollama pull llama3.2
   ```

3. In Settings, choose **Ollama** and the model `llama3.2`.

The app reaches Ollama on your computer at `http://host.docker.internal:11434`. A local model needs a reasonably fast computer. Replies can be slower than a cloud AI.

### Setting the AI with environment variables (optional)

If you prefer, you can set an Anthropic key when you start the app:

```bash
LLM_PROVIDER=anthropic LLM_MODEL=claude-haiku-4-5 ANTHROPIC_API_KEY=sk-ant-... docker compose up -d
```

You can also put these lines in a file named `.env` next to `docker-compose.yaml`. Most players do not need this. Use the Settings page.

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

---

## For developers

AiVillage is a pnpm workspace:

| Folder | What |
|---|---|
| `packages/shared` | Shared TypeScript types and logic (used as source, no build step) |
| `apps/backend` | Node + Express + Socket.IO on :4000, Postgres with drizzle-orm |
| `apps/web` | Next.js 14 (app router) on :3000 |

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
cp apps/backend/.env.example apps/backend/.env   # then edit it
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

Product plan: [`docs/product/2026-10-17-aivillage-v4-local-village-plan.md`](docs/product/2026-10-17-aivillage-v4-local-village-plan.md).
