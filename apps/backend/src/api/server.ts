import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { Server as IOServer } from "socket.io";
import { seedIfEmpty } from "../sim/seed.js";
import { runDay } from "../sim/runDay.js";
import { buildWorldState } from "./worldState.js";
import { chooseLlm } from "../agent/llmProvider.js";
import { onboardTwin, ownerPanel } from "./onboard.js";
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

// Owner panel: my twin + its recent life + my pending approvals.
app.get("/api/me", async (req, res) => {
  try {
    res.json(await ownerPanel(String(req.query.userId ?? "")));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Resolve an approval: {approve: true|false}
app.post("/api/approvals/:id/resolve", async (req, res) => {
  try {
    const updated = await new DrizzleApprovalRepository(getDb()).resolve(req.params.id, Boolean(req.body?.approve));
    if (!updated) {
      res.status(404).json({ error: "not found or already resolved" });
      return;
    }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/api/run-day", async (_req, res) => {
  try {
    // Step the day, then broadcast the per-beat frames for clients to play back.
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
    server.listen(PORT, () => console.log(`AiVillage API + Socket.IO → http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("startup failed:", e);
    process.exit(1);
  });
