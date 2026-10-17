import "dotenv/config";
import http from "node:http";
import express, { type Response } from "express";
import cors from "cors";
import { Server as IOServer } from "socket.io";
import type { VillageSettings } from "@aivillage/shared";
import { runDay } from "../sim/runDay.js";
import { startWorldClock } from "../sim/worldClock.js";
import { startNextStepLoop } from "../sim/nextStepLoop.js";
import { chatWithTwin, chatHistory, releaseTwin } from "../chat/twinChat.js";
import { talkOnArrival, TalkScheduler } from "../sim/orderedTalk.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleSettingsRepository, maskKey } from "../db/settingsRepository.js";
import { buildWorldState } from "./worldState.js";
import { ownerPanel } from "./onboard.js";
import { twinDetail } from "./twinDetail.js";
import { DrizzleApprovalRepository } from "../db/approvalRepository.js";
import { getDb } from "../db/appDb.js";
import {
  ensureLocalOwner, villageInfo, createTwin, updateTwin, activateTwin, deactivateTwin, deleteTwin, savePoses, VillageError
} from "../village/village.js";
import { generateVillagers } from "../village/randomVillagers.js";
import { VillageAi, toAiSettings } from "../village/aiRuntime.js";
import { testConnection, listModels } from "../agent/providers/factory.js";
import { PROVIDERS } from "../agent/providers/types.js";
import { MAX_TWINS } from "@aivillage/shared";

const app = express();
app.use(cors());
// text/plain too: the browser's closing-tab beacon (PUT/POST /api/poses) sends JSON as text
app.use(express.json({ type: ["application/json", "text/plain"] }));

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: "*" } });

const settingsRepo = () => new DrizzleSettingsRepository(getDb());
/** The player's own AI (Settings page). */
const ai = new VillageAi(() => settingsRepo().get());

io.on("connection", async (socket) => {
  // Send the current world to a newly-connected client immediately.
  socket.emit("world", await buildWorldState());
});

const emitWorld = async () => io.emit("world", await buildWorldState());

/** Map known errors to HTTP codes; everything else is a 500. */
function fail(res: Response, e: unknown): void {
  if (e instanceof VillageError) {
    res.status(e.code === "not_found" ? 404 : e.code === "limit" ? 409 : 400).json({ error: e.message, code: e.code });
    return;
  }
  res.status(500).json({ error: (e as Error).message });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/world", async (_req, res) => {
  try {
    res.json(await buildWorldState());
  } catch (e) {
    fail(res, e);
  }
});

// ---- the local village: owner, twins, setup state ----

app.get("/api/village", async (_req, res) => {
  try {
    res.json(await villageInfo(getDb()));
  } catch (e) {
    fail(res, e);
  }
});

app.post("/api/twins", async (req, res) => {
  try {
    const b = req.body ?? {};
    const twin = await createTwin(getDb(), {
      name: b.name, appearance: b.appearance, role: b.role === "main" ? "main" : "villager",
      personality: typeof b.personality === "string" ? b.personality : undefined,
      goal: typeof b.goal === "string" ? b.goal : undefined
    });
    res.json(twin);
    await emitWorld();
  } catch (e) {
    fail(res, e);
  }
});

app.patch("/api/twins/:id", async (req, res) => {
  try {
    const b = req.body ?? {};
    res.json(await updateTwin(getDb(), req.params.id, { name: b.name, appearance: b.appearance, traits: b.traits, goals: b.goals }));
    await emitWorld();
  } catch (e) {
    fail(res, e);
  }
});

app.post("/api/twins/:id/activate", async (req, res) => {
  try {
    res.json(await activateTwin(getDb(), req.params.id));
    await emitWorld();
  } catch (e) {
    fail(res, e);
  }
});

app.post("/api/twins/:id/deactivate", async (req, res) => {
  try {
    res.json(await deactivateTwin(getDb(), req.params.id));
    talks.cancel(req.params.id);
    await emitWorld();
  } catch (e) {
    fail(res, e);
  }
});

app.delete("/api/twins/:id", async (req, res) => {
  try {
    await deleteTwin(getDb(), req.params.id);
    talks.cancel(req.params.id);
    res.json({ deleted: true });
    await emitWorld();
  } catch (e) {
    fail(res, e);
  }
});

// "Fill with random villagers" up to the village limit.
app.post("/api/villagers/random", async (req, res) => {
  try {
    const db = getDb();
    const living = await new DrizzleTwinRepository(db).listAll();
    const room = MAX_TWINS - living.length;
    const wanted = Math.min(room, Math.max(1, Number(req.body?.count ?? room) || room));
    const everyone = await new DrizzleTwinRepository(db).listEverything();
    const newcomers = await generateVillagers(wanted, await ai.llm(), everyone.map((t) => t.name));
    const created = [];
    for (const v of newcomers) created.push(await createTwin(db, v));
    res.json({ created });
    await emitWorld();
  } catch (e) {
    fail(res, e);
  }
});

// The browser saves where everyone is, so the village resumes exactly there.
const savePosesRoute: express.RequestHandler = async (req, res) => {
  try {
    await savePoses(getDb(), Array.isArray(req.body?.poses) ? req.body.poses : []);
    res.json({ saved: true });
  } catch (e) {
    fail(res, e);
  }
};
app.put("/api/poses", savePosesRoute);
app.post("/api/poses", savePosesRoute); // navigator.sendBeacon can only POST

// Inspector: any villager's public profile (?viewer=<userId> marks the viewer's own twin).
app.get("/api/twins/:id", async (req, res) => {
  try {
    const detail = await twinDetail(req.params.id, req.query.viewer ? String(req.query.viewer) : null);
    if (!detail) {
      res.status(404).json({ error: "no such twin" });
      return;
    }
    res.json(detail);
  } catch (e) {
    fail(res, e);
  }
});

// ---- settings: the player's own AI ----

/** Settings from a request body; a missing apiKey keeps the saved one. */
async function settingsFrom(body: Record<string, unknown>): Promise<VillageSettings> {
  const saved = await settingsRepo().get();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const provider = str(body.provider) ?? saved?.provider ?? "openrouter";
  const info = PROVIDERS.find((p) => p.id === provider);
  if (!info) throw new VillageError("invalid", `unknown AI provider "${provider}"`);
  const chattiness = ["calm", "normal", "busy"].includes(String(body.chattiness)) ? (body.chattiness as VillageSettings["chattiness"]) : saved?.chattiness ?? "normal";
  return {
    provider,
    model: str(body.model) ?? (saved?.provider === provider ? saved.model : info.defaultModel),
    apiKey: body.apiKey === undefined ? (saved?.provider === provider ? saved.apiKey : null) : str(body.apiKey),
    baseUrl: str(body.baseUrl),
    chattiness
  };
}

app.get("/api/settings", async (_req, res) => {
  try {
    const s = await settingsRepo().get();
    res.json({
      settings: s ? { provider: s.provider, model: s.model, baseUrl: s.baseUrl, chattiness: s.chattiness, keyHint: maskKey(s.apiKey) } : null,
      providers: PROVIDERS
    });
  } catch (e) {
    fail(res, e);
  }
});

app.put("/api/settings", async (req, res) => {
  try {
    const s = await settingsFrom(req.body ?? {});
    await settingsRepo().save(s);
    res.json({ saved: true, keyHint: maskKey(s.apiKey) });
  } catch (e) {
    fail(res, e);
  }
});

app.post("/api/settings/test", async (req, res) => {
  try {
    res.json(await testConnection(toAiSettings(await settingsFrom(req.body ?? {}))));
  } catch (e) {
    fail(res, e);
  }
});

app.post("/api/settings/models", async (req, res) => {
  try {
    res.json({ models: await listModels(toAiSettings(await settingsFrom(req.body ?? {}))) });
  } catch (e) {
    fail(res, e);
  }
});

// Owner panel: my twin + its recent life + my pending approvals.
app.get("/api/me", async (req, res) => {
  try {
    res.json(await ownerPanel(String(req.query.userId ?? "")));
  } catch (e) {
    fail(res, e);
  }
});

// Resolve an approval: {approve: true|false}. Approving immediately sends the
// twin off on a short catch-up run (only that twin moves) so the owner SEES
// their decision take effect.
app.post("/api/approvals/:id/resolve", async (req, res) => {
  try {
    const updated = await new DrizzleApprovalRepository(getDb()).resolve(req.params.id, Boolean(req.body?.approve));
    if (!updated) {
      res.status(404).json({ error: "not found or already resolved" });
      return;
    }
    res.json(updated);
    const llm = await ai.llm();
    if (updated.status === "approved" && llm) {
      void (async () => {
        try {
          const { frames } = await runDay(llm, { onlyTwinId: updated.twinId, beats: 1 });
          io.emit("day", { frames });
        } catch (e) {
          console.error("catch-up run failed:", e);
        }
      })();
    }
  } catch (e) {
    fail(res, e);
  }
});

// ---- TALK: chat with your active main twin ----
// When a chat teaches the twin something (a fact or a new goal), it immediately
// takes one beat in the village — the owner SEES their words become action.
const lastReactionAt = new Map<string, number>();
const REACTION_COOLDOWN_MS = 45_000;
/** "talk to Ravi": the conversation starts when the twin arrives (client reports it). */
const talks = new TalkScheduler((twinId, targetTwinId) => {
  void (async () => {
    const llm = await ai.llm();
    if (!llm) return;
    const frames = await talkOnArrival(twinId, targetTwinId, llm);
    if (frames.length > 0) io.emit("day", { frames });
  })().catch((e) => console.error("ordered talk failed:", e));
});

app.post("/api/chat", async (req, res) => {
  try {
    const llm = await ai.llm();
    const result = await chatWithTwin(String(req.body?.userId ?? ""), String(req.body?.message ?? ""), llm);
    res.json(result);
    // The twin ACTED from the conversation (e.g. walked to the Lawn) — show it.
    if (result.worldChanged) await emitWorld();
    if (result.targetTwinId && result.order?.kind === "talk_to") talks.schedule(result.twinId, result.targetTwinId);
    else if (result.command) talks.cancel(result.twinId); // a newer order replaces a pending talk
    const learned = result.facts.length > 0 || result.goal !== null;
    const cooledDown = Date.now() - (lastReactionAt.get(result.twinId) ?? 0) > REACTION_COOLDOWN_MS;
    // A command already gave the owner visible action — no extra autonomous beat on top.
    if (llm && learned && cooledDown && !result.command) {
      lastReactionAt.set(result.twinId, Date.now());
      void (async () => {
        try {
          const { frames } = await runDay(llm, { onlyTwinId: result.twinId, beats: 1 });
          io.emit("day", { frames });
        } catch (e) {
          console.error("chat reaction beat failed:", e);
        }
      })();
    }
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// "Let it roam": end the owner's order so the twin lives on its own again.
app.post("/api/order/release", async (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    const released = await releaseTwin(userId);
    res.json({ released });
    const mine = (await new DrizzleTwinRepository(getDb()).listAll()).find((t) => t.ownerUserId === userId);
    if (mine) talks.cancel(mine.id);
    if (released) await emitWorld();
  } catch (e) {
    fail(res, e);
  }
});

// The owner's client saw the twin arrive where it was sent → start a waiting talk now.
app.post("/api/order/arrived", async (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    const mine = (await new DrizzleTwinRepository(getDb()).listAll()).find((t) => t.ownerUserId === userId);
    res.json({ started: mine ? talks.arrived(mine.id) : false });
  } catch (e) {
    fail(res, e);
  }
});

app.get("/api/chat", async (req, res) => {
  try {
    res.json({ messages: await chatHistory(String(req.query.userId ?? "")) });
  } catch (e) {
    fail(res, e);
  }
});

const PORT = Number(process.env.PORT ?? 4000);

ensureLocalOwner(getDb())
  .then(async () => {
    const living = (await new DrizzleTwinRepository(getDb()).listAll()).length;
    console.log(`AiVillage: ${living} twins living in the village`);
    // The village lives while someone watches; closing the app pauses it.
    startWorldClock({
      emitFrames: (frames) => io.emit("day", { frames }),
      isWatched: () => io.engine.clientsCount > 0,
      getLlm: () => ai.llm(),
      getChattiness: () => ai.chattiness()
    });
    // Each twin that finishes an activity takes the next one from its plan (O13, to-do list mode).
    startNextStepLoop({
      emitWorld,
      isWatched: () => io.engine.clientsCount > 0,
      getLlm: () => ai.llm(),
      getChattiness: () => ai.chattiness()
    });
    server.listen(PORT, () => console.log(`AiVillage API + Socket.IO → http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("startup failed:", e);
    process.exit(1);
  });
