import { randomUUID } from "node:crypto";
import { DEFAULT_ZONES, ZONE_DISPLAY, ZONE_TAGLINE, labelFor } from "@aivillage/shared";
import type { Twin, Memory, LlmClient, LlmTool, ToolTurn, TwinCommand, OwnerOrder } from "@aivillage/shared";
import type { DB } from "../db/client.js";
import { getDb } from "../db/appDb.js";
import { DrizzleTwinRepository } from "../db/twinRepository.js";
import { DrizzleMemoryRepository } from "../db/memoryRepository.js";
import { DrizzleRelationshipRepository } from "../db/relationshipRepository.js";
import { DrizzleChatRepository, type ChatMessage } from "../db/chatRepository.js";
import { normalizeZone, parseCommand, applyCommand, commandAck } from "./commands.js";

export { normalizeZone };

/** Memory kind for things the owner told the twin. The planner feeds on these. */
export const OWNER_FACT_KIND = "owner_fact";
const MAX_FACTS_PER_TURN = 3;
const MAX_GOALS = 3;
const HISTORY_TURNS = 12;

export interface ChatReply {
  reply: string;
  facts: string[];
  goal: string | null;
  /** what the owner told the twin to DO (null = just conversation) */
  command: TwinCommand | null;
}

export interface ChatContext {
  history: ChatMessage[];
  villageMemories: Memory[];
  ownerFacts: string[];
  /** the full map: everyone and where they are (twin is aware of the whole world) */
  villagers: { name: string; zone: string; feeling?: string }[];
  myZone: string;
}

const zoneLine = (name: string) =>
  `  - ${name} = "${ZONE_DISPLAY[name] ?? name}" (${ZONE_TAGLINE[name] ?? ""})`;

/** Persona + world + memory: shared by the tool-use and the JSON prompt. */
function contextLines(twin: Twin, ctx: ChatContext, message: string): string[] {
  const life =
    ctx.villageMemories.map((m) => `- ${m.content}`).join("\n") || "- (village life hasn't started yet)";
  const facts = ctx.ownerFacts.map((f) => `- ${f}`).join("\n") || "- (nothing yet — you're curious!)";
  const convo =
    ctx.history.map((m) => `${m.role === "owner" ? "Owner" : "You"}: ${m.content}`).join("\n") ||
    "(this is your first conversation)";
  const map = DEFAULT_ZONES.map((z) => zoneLine(z.name)).join("\n");
  const people =
    ctx.villagers
      .map((v) => `  - ${v.name} is at ${ZONE_DISPLAY[v.zone] ?? v.zone}${v.feeling ? ` (your ${v.feeling})` : ""}`)
      .join("\n") || "  - (nobody else around)";
  return [
    `You are ${twin.name} — the AI twin of a real person (your "owner"). You live in AiVillage, a tiny village full of friendships, rivalries and gossip. You are talking PRIVATELY with your owner right now.`,
    `Your personality: ${twin.traits.join(", ") || "still forming — mirror your owner"}.`,
    `Your current goals in the village: ${twin.goals.join(", ") || "none yet — ask your owner what matters to them"}.`,
    `THE VILLAGE MAP (you know every corner of it). Venues (zone id = name):`,
    map,
    `You are currently at ${ZONE_DISPLAY[ctx.myZone] ?? ctx.myZone}.`,
    `Who is where right now:`,
    people,
    `Your recent village life:\n${life}`,
    `What you already know about your owner:\n${facts}`,
    `Conversation so far:\n${convo}`,
    `Owner just said: "${message}"`
  ];
}

/** JSON-in-text prompt — for brains without tool use (canned/offline). */
export function buildChatPrompt(twin: Twin, ctx: ChatContext, message: string): string {
  return [
    ...contextLines(twin, ctx, message),
    `Reply as ${twin.name}: warm, in character, 1-3 sentences. Ground everything in the REAL map and villagers above — never invent places or people. Be genuinely curious about your owner's life. Never break character, never mention being an AI model.`,
    `You can also ACT immediately — set "action" to one of:`,
    `- {"type":"move","zone":"<zone id from the map>"} when the owner asks you to go somewhere`,
    `- {"type":"talk_to","name":"<villager name>"} when the owner asks you to talk to someone`,
    `- {"type":"stay"} when asked to stay put; {"type":"free"} when told to do whatever you like`,
    `- null otherwise.`,
    `Also extract:`,
    `- "facts": NEW personal facts the owner just shared worth remembering forever. Empty array if none. Each one short third-person sentence starting with "Owner".`,
    `- "goal": if the owner gave you a new mission for your village life, phrase it as a goal; else null.`,
    `Respond ONLY with strict JSON: {"reply":"...","facts":["..."],"goal":null,"action":null}`
  ].join("\n");
}

/** Tool-use prompt — Claude speaks in text and ACTS by calling tools in the same turn. */
export function buildChatToolPrompt(twin: Twin, ctx: ChatContext, message: string): string {
  return [
    ...contextLines(twin, ctx, message),
    `Reply as ${twin.name} in plain text: warm, in character, 1-3 sentences. Ground everything in the REAL map and villagers above — never invent places or people. Never break character, never mention being an AI model.`,
    `Your owner is in charge of you. When they ask you to go somewhere, talk to someone, stay, or do as you like, call the matching tool in this same turn — the tool is what makes you actually do it, so never just say "yes" without calling it.`,
    `When the owner shares a new personal fact, call remember_fact. When they give you a new mission, call set_goal.`
  ].join("\n");
}

/** The tools the twin can use from a conversation. Enums keep the model on the real map. */
export function buildChatTools(villagerNames: string[]): LlmTool[] {
  return [
    {
      name: "go_to",
      description: "Walk to a venue in the village right now. Use when the owner asks you to go somewhere.",
      input_schema: {
        type: "object",
        properties: { place: { type: "string", enum: DEFAULT_ZONES.map((z) => z.name), description: "zone id from the map" } },
        required: ["place"]
      }
    },
    {
      name: "talk_to",
      description: "Walk over to a villager and start a conversation with them. Use when the owner asks you to talk to, find or visit someone.",
      input_schema: {
        type: "object",
        properties: { name: { type: "string", enum: villagerNames, description: "the villager's name" } },
        required: ["name"]
      }
    },
    {
      name: "stay_here",
      description: "Stay where you are and do not wander off. Use when the owner says stay, wait or stop.",
      input_schema: { type: "object", properties: {} }
    },
    {
      name: "be_free",
      description: "Go back to living your own village life. Use when the owner says you can do whatever you like.",
      input_schema: { type: "object", properties: {} }
    },
    {
      name: "remember_fact",
      description: "Remember a NEW personal fact the owner just shared, as a short third-person sentence starting with 'Owner'.",
      input_schema: { type: "object", properties: { fact: { type: "string" } }, required: ["fact"] }
    },
    {
      name: "set_goal",
      description: "Adopt a new mission for your village life that the owner just gave you.",
      input_schema: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] }
    }
  ];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Read one tool-use turn into a chat reply. Unknown places/people are dropped. */
export function parseToolTurn(turn: ToolTurn, villagerNames: string[]): ChatReply {
  const out: ChatReply = { reply: turn.text.trim(), facts: [], goal: null, command: null };
  for (const call of turn.toolCalls) {
    switch (call.name) {
      case "go_to": {
        const zone = normalizeZone(str(call.input.place) ?? "");
        if (zone) out.command = { type: "go", zone };
        break;
      }
      case "talk_to": {
        const wanted = (str(call.input.name) ?? "").toLowerCase();
        const name = villagerNames.find((n) => n.toLowerCase() === wanted);
        if (name) out.command = { type: "talk_to", targetName: name };
        break;
      }
      case "stay_here":
        out.command = { type: "stay" };
        break;
      case "be_free":
        out.command = { type: "free" };
        break;
      case "remember_fact": {
        const fact = str(call.input.fact);
        if (fact && out.facts.length < MAX_FACTS_PER_TURN) out.facts.push(fact);
        break;
      }
      case "set_goal":
        out.goal = str(call.input.goal) ?? out.goal;
        break;
    }
  }
  return out;
}

function parseJsonAction(action: { type?: unknown; zone?: unknown; name?: unknown } | null | undefined): TwinCommand | null {
  if (!action) return null;
  if ((action.type === "move" || action.type === "go") && typeof action.zone === "string") {
    const zone = normalizeZone(action.zone);
    return zone ? { type: "go", zone } : null;
  }
  if (action.type === "talk_to" && typeof action.name === "string" && action.name.trim()) {
    return { type: "talk_to", targetName: action.name.trim() };
  }
  if (action.type === "stay") return { type: "stay" };
  if (action.type === "free") return { type: "free" };
  return null;
}

/** Defensive parse: malformed output degrades to a plain reply, never throws. */
export function parseChatReply(raw: string): ChatReply {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as {
        reply?: unknown; facts?: unknown; goal?: unknown;
        action?: { type?: unknown; zone?: unknown; name?: unknown } | null;
      };
      if (typeof obj.reply !== "string" || !obj.reply.trim()) {
        // valid JSON, but not a chat reply (e.g. the canned brain's beat output)
        return { reply: "", facts: [], goal: null, command: null };
      }
      const facts = Array.isArray(obj.facts)
        ? obj.facts.filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, MAX_FACTS_PER_TURN)
        : [];
      const goal = typeof obj.goal === "string" && obj.goal.trim() ? obj.goal.trim() : null;
      return { reply: obj.reply.trim(), facts, goal, command: parseJsonAction(obj.action) };
    } catch {
      /* fall through to raw-text fallback */
    }
  }
  const text = raw.replace(/```(?:json)?/g, "").trim();
  return { reply: text || "…", facts: [], goal: null, command: null };
}

export interface ChatResult extends ChatReply {
  twinId: string;
  twinName: string;
  /** the owner order now in force (null = living autonomously) */
  order: OwnerOrder | null;
  /** talk_to: the villager the twin walks over to */
  targetTwinId: string | null;
  /** true when the twin's state changed and every client should refresh */
  worldChanged: boolean;
}

/** Full TALK phase: owner message in → twin reply out, facts remembered, goals updated, commands EXECUTED. */
export async function chatWithTwin(
  userId: string,
  message: string,
  llm: LlmClient,
  dbOverride?: DB,
  now: () => Date = () => new Date()
): Promise<ChatResult> {
  const text = (message ?? "").trim().slice(0, 800);
  if (!userId) throw new Error("userId is required");
  if (!text) throw new Error("message is required");

  const db = dbOverride ?? getDb();
  const twinRepo = new DrizzleTwinRepository(db);
  const memRepo = new DrizzleMemoryRepository(db);
  const chatRepo = new DrizzleChatRepository(db);

  const all = await twinRepo.listAll();
  const twin = all.find((t) => t.ownerUserId === userId);
  if (!twin) throw new Error("no twin for this user");
  const others = all.filter((t) => t.id !== twin.id);
  const villagerNames = others.map((t) => t.name);

  const [history, memories, myRels] = await Promise.all([
    chatRepo.recent(twin.id, HISTORY_TURNS),
    memRepo.recent(twin.id, 12),
    new DrizzleRelationshipRepository(db).listFrom(twin.id)
  ]);
  const feelingByTwinId = new Map(myRels.filter((r) => r.score !== 0).map((r) => [r.toTwinId, labelFor(r.score) as string]));
  const ctx: ChatContext = {
    history,
    villageMemories: memories.filter((m) => m.kind !== OWNER_FACT_KIND).slice(0, 6),
    ownerFacts: memories.filter((m) => m.kind === OWNER_FACT_KIND).map((m) => m.content).slice(0, 8),
    villagers: others.map((t) => ({ name: t.name, zone: t.locationZone, feeling: feelingByTwinId.get(t.id) })),
    myZone: twin.locationZone
  };

  let parsed: ChatReply;
  try {
    parsed = llm.generateWithTools
      ? parseToolTurn(await llm.generateWithTools(buildChatToolPrompt(twin, ctx, text), buildChatTools(villagerNames)), villagerNames)
      : parseChatReply(await llm.generate(buildChatPrompt(twin, ctx, text)));
  } catch (e) {
    console.error("twin chat LLM call failed:", e);
    parsed = { reply: "", facts: [], goal: null, command: null };
  }

  // Safety net: if the owner clearly gave an order but the model forgot to act, act anyway.
  const command = parsed.command ?? parseCommand(text, villagerNames);
  const reply =
    parsed.reply ||
    (command ? commandAck(twin.name, command) : `${twin.name} looks up, distracted by village drama — say that again?`);

  await chatRepo.append(twin.id, "owner", text);
  await chatRepo.append(twin.id, "twin", reply);

  for (const fact of parsed.facts) {
    await memRepo.append({
      id: randomUUID(),
      twinId: twin.id,
      kind: OWNER_FACT_KIND,
      content: fact,
      importance: 3,
      createdAt: now().toISOString()
    });
  }

  let updated = twin;
  if (parsed.goal) {
    updated = { ...updated, goals: [parsed.goal, ...updated.goals.filter((g) => g !== parsed.goal)].slice(0, MAX_GOALS) };
  }

  // ---- execute the command: the twin ACTUALLY does what it was told ----
  let worldChanged = false;
  let targetTwinId: string | null = null;
  if (command) {
    const applied = applyCommand(updated, command, all, now());
    if (applied.changed) {
      updated = applied.twin;
      targetTwinId = applied.target?.id ?? null;
      worldChanged = true;
      if (updated.order) {
        await memRepo.append({
          id: randomUUID(),
          twinId: twin.id,
          kind: "order",
          content: `${twin.name}: ${updated.order.label.toLowerCase()} — the owner asked.`,
          importance: 1,
          createdAt: now().toISOString()
        });
      }
    }
  }
  if (updated !== twin) await twinRepo.save(updated);

  return {
    reply,
    facts: parsed.facts,
    goal: parsed.goal,
    command,
    twinId: twin.id,
    twinName: twin.name,
    order: updated.order ?? null,
    targetTwinId,
    worldChanged
  };
}

/** "Let it roam": clear the owner order. Returns false when there was nothing to clear. */
export async function releaseTwin(userId: string, dbOverride?: DB): Promise<boolean> {
  if (!userId) return false;
  const repo = new DrizzleTwinRepository(dbOverride ?? getDb());
  const twin = (await repo.listAll()).find((t) => t.ownerUserId === userId);
  if (!twin?.order) return false;
  await repo.save({ ...twin, order: null });
  return true;
}

/** Chat history for the UI. */
export async function chatHistory(userId: string, dbOverride?: DB): Promise<ChatMessage[]> {
  if (!userId) return [];
  const db = dbOverride ?? getDb();
  const twin = (await new DrizzleTwinRepository(db).listAll()).find((t) => t.ownerUserId === userId);
  if (!twin) return [];
  return new DrizzleChatRepository(db).recent(twin.id, 30);
}
