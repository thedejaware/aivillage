import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { Server as IOServer } from "socket.io";
import { seedIfEmpty } from "../sim/seed.js";
import { runDay } from "../sim/runDay.js";
import { buildWorldState } from "./worldState.js";
import { chooseLlm } from "../agent/llmProvider.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: "*" } });

/** Broadcast the current world to every connected client. */
async function emitWorld(): Promise<void> {
  io.emit("world", await buildWorldState());
}

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

app.post("/api/run-day", async (_req, res) => {
  try {
    // Push the world after each twin finishes so clients see it build live.
    const summary = await runDay(chooseLlm(), { onProgress: emitWorld });
    await emitWorld();
    res.json(summary);
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
