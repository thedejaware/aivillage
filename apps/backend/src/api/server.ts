import "dotenv/config";
import express from "express";
import cors from "cors";
import { seedIfEmpty } from "../sim/seed.js";
import { runDay } from "../sim/runDay.js";
import { buildWorldState } from "./worldState.js";
import { chooseLlm } from "../agent/llmProvider.js";

const app = express();
app.use(cors());
app.use(express.json());

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
    const summary = await runDay(chooseLlm());
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const PORT = Number(process.env.PORT ?? 4000);

seedIfEmpty()
  .then((n) => {
    console.log(`AiVillage: ${n} twins in the world`);
    app.listen(PORT, () => console.log(`AiVillage API → http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error("startup failed:", e);
    process.exit(1);
  });
