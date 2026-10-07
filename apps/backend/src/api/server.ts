import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { Server as IOServer } from "socket.io";
import { seedIfEmpty } from "../sim/seed.js";
import { runDay } from "../sim/runDay.js";
import { startWorldClock } from "../sim/worldClock.js";
import { chatWithTwin, chatHistory, releaseTwin } from "../chat/twinChat.js";
import { talkOnArrival, TalkScheduler } from "../sim/orderedTalk.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { buildWorldState } from "./worldState.js";
import { chooseLlm } from "../agent/llmProvider.js";
import { onboardTwin, ownerPanel } from "./onboard.js";
import { twinDetail } from "./twinDetail.js";
import { DrizzleApprovalRepository } from "../db/approvalRepository.js";
import { getDb } from "../db/appDb.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: "*" } });

io.on("connection", async (socket) => {
  // Send the current world to a newly-connected client immediately.
  socket.emit("world", await buildWorldState());
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/world", async (_req, res) => {
  try {
    res.json(await buildWorldState());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Onboarding: create a user + their twin. The new twin appears in everyone's world.
app.post("/api/twins", async (req, res) => {
  try {
    const result = await onboardTwin(req.body ?? {});
    io.emit("world", await buildWorldState());
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

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
    res.status(500).json({ error: (e as Error).message });
  }
});

// Owner panel: my twin + its recent life + my pending approvals.
app.get("/api/me", async (req, res) => {
  try {
    res.json(await ownerPanel(String(req.query.userId ?? "")));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
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
    if (updated.status === "approved") {
      void (async () => {
        try {
          const { frames } = await runDay(chooseLlm(), { onlyTwinId: updated.twinId, beats: 3 });
          io.emit("day", { frames });
        } catch (e) {
          console.error("catch-up run failed:", e);
        }
      })();
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ---- TALK: chat with your twin (v3 core loop) ----
// When a chat teaches the twin something (a fact or a new goal), it immediately
// takes one beat in the village — the owner SEES their words become action.
const lastReactionAt = new Map<string, number>();
const REACTION_COOLDOWN_MS = 45_000;
/** "talk to Ravi": the conversation starts when the twin arrives (client reports it). */
const talks = new TalkScheduler((twinId, targetTwinId) => {
  void talkOnArrival(twinId, targetTwinId, chooseLlm())
    .then((frames) => { if (frames.length > 0) io.emit("day", { frames }); })
    .catch((e) => console.error("ordered talk failed:", e));
});

app.post("/api/chat", async (req, res) => {
  try {
    const result = await chatWithTwin(String(req.body?.userId ?? ""), String(req.body?.message ?? ""), chooseLlm());
    res.json(result);
    // The twin ACTED from the conversation (e.g. walked to the Lawn) — show everyone.
    if (result.worldChanged) io.emit("world", await buildWorldState());
    if (result.targetTwinId) talks.schedule(result.twinId, result.targetTwinId);
    else if (result.command) talks.cancel(result.twinId); // a newer order replaces a pending talk
    const learned = result.facts.length > 0 || result.goal !== null;
    const cooledDown = Date.now() - (lastReactionAt.get(result.twinId) ?? 0) > REACTION_COOLDOWN_MS;
    // A command already gave the owner visible action — no extra autonomous beat on top.
    if (learned && cooledDown && !result.command) {
      lastReactionAt.set(result.twinId, Date.now());
      void (async () => {
        try {
          const { frames } = await runDay(chooseLlm(), { onlyTwinId: result.twinId, beats: 1 });
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
    if (released) io.emit("world", await buildWorldState());
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// The owner's client saw the twin arrive where it was sent → start a waiting talk now.
app.post("/api/order/arrived", async (req, res) => {
  try {
    const userId = String(req.body?.userId ?? "");
    const mine = (await new DrizzleTwinRepository(getDb()).listAll()).find((t) => t.ownerUserId === userId);
    res.json({ started: mine ? talks.arrived(mine.id) : false });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get("/api/chat", async (req, res) => {
  try {
    res.json({ messages: await chatHistory(String(req.query.userId ?? "")) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Debug hook only — the world clock keeps the village alive on its own now.
app.post("/api/run-day", async (_req, res) => {
  try {
    const { frames, structuresBuilt } = await runDay(chooseLlm());
    io.emit("day", { frames });
    res.json({ frames: frames.length, structuresBuilt });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const PORT = Number(process.env.PORT ?? 4000);

seedIfEmpty()
  .then((n) => {
    console.log(`AiVillage: ${n} twins in the world`);
    // LIVE: the village lives all the time — beats drip through the real day.
    startWorldClock((frames) => io.emit("day", { frames }), chooseLlm());
    server.listen(PORT, () => console.log(`AiVillage API + Socket.IO → http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("startup failed:", e);
    process.exit(1);
  });
