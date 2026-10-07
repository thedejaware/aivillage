import { describe, it, expect } from "vitest";
import { parseChatReply, buildChatPrompt, normalizeZone, buildChatTools, parseToolTurn } from "../../src/chat/twinChat.js";
import type { Twin } from "@aivillage/shared";

const twin: Twin = {
  id: "t-1",
  ownerUserId: "u-1",
  name: "Memo",
  traits: ["charming gossip"],
  goals: ["become the most loved"],
  avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0,
  locationZone: "plaza",
  energy: 5,
  energyUpdatedAt: new Date().toISOString(),
  isNpc: false
};

describe("parseChatReply", () => {
  it("parses a well-formed reply with facts and goal", () => {
    const out = parseChatReply(
      '{"reply":"I missed you! Guess what Ravi said…","facts":["Owner has a job interview on Friday"],"goal":"make friends with Daniel"}'
    );
    expect(out.reply).toContain("missed you");
    expect(out.facts).toEqual(["Owner has a job interview on Friday"]);
    expect(out.goal).toBe("make friends with Daniel");
  });

  it("parses JSON wrapped in a markdown fence", () => {
    const out = parseChatReply('```json\n{"reply":"hey!","facts":[],"goal":null}\n```');
    expect(out.reply).toBe("hey!");
    expect(out.facts).toEqual([]);
    expect(out.goal).toBeNull();
  });

  it("falls back to raw text when the model ignores the JSON contract", () => {
    const out = parseChatReply("Just plain prose, no JSON at all.");
    expect(out.reply).toBe("Just plain prose, no JSON at all.");
    expect(out.facts).toEqual([]);
    expect(out.goal).toBeNull();
  });

  it("returns an empty reply for valid JSON that is not a chat reply (canned beat output)", () => {
    expect(parseChatReply('{"verb":"work","target":null}').reply).toBe("");
  });

  it("parses talk_to / stay / free actions", () => {
    expect(parseChatReply('{"reply":"ok","action":{"type":"talk_to","name":"Ravi"}}').command).toEqual({ type: "talk_to", targetName: "Ravi" });
    expect(parseChatReply('{"reply":"ok","action":{"type":"stay"}}').command).toEqual({ type: "stay" });
    expect(parseChatReply('{"reply":"ok","action":{"type":"free"}}').command).toEqual({ type: "free" });
  });

  it("falls back to raw text on malformed JSON", () => {
    const out = parseChatReply('{"reply": "unterminated');
    expect(out.reply).toContain("unterminated");
    expect(out.facts).toEqual([]);
  });

  it("caps facts at 3 and drops non-string entries", () => {
    const out = parseChatReply(
      '{"reply":"ok","facts":["a","b","c","d",42],"goal":""}'
    );
    expect(out.facts).toEqual(["a", "b", "c"]);
    expect(out.goal).toBeNull(); // empty string is not a goal
  });
});

describe("buildChatPrompt", () => {
  it("includes persona, owner facts, village life and the new message", () => {
    const prompt = buildChatPrompt(
      twin,
      {
        history: [
          { id: "m1", twinId: "t-1", role: "owner", content: "hi", createdAt: "" },
          { id: "m2", twinId: "t-1", role: "twin", content: "hello!", createdAt: "" }
        ],
        villageMemories: [
          { id: "mm", twinId: "t-1", kind: "chat", content: "Memo and Ravi talked at the café", importance: 1, createdAt: "" }
        ],
        ownerFacts: ["Owner loves sci-fi movies"],
        villagers: [{ name: "Ravi", zone: "event_space", feeling: "friend" }],
        myZone: "plaza"
      },
      "I got the job!"
    );
    expect(prompt).toContain("Memo");
    expect(prompt).toContain("charming gossip");
    expect(prompt).toContain("Owner loves sci-fi movies");
    expect(prompt).toContain("Memo and Ravi talked at the café");
    expect(prompt).toContain("I got the job!");
    expect(prompt).toContain("strict JSON");
    // full map awareness
    expect(prompt).toContain("VILLAGE MAP");
    expect(prompt).toContain("event_space");
    expect(prompt).toContain("THE LAWN");
    expect(prompt).toContain("Ravi is at THE LAWN");
    expect(prompt).toContain("your friend");
    expect(prompt).toContain("THE STAGE"); // where the twin currently is
    expect(prompt).toContain('"action"');
  });
});

describe("normalizeZone", () => {
  it("accepts canonical zone ids", () => {
    expect(normalizeZone("event_space")).toBe("event_space");
  });
  it("accepts display names", () => {
    expect(normalizeZone("THE LAWN")).toBe("event_space");
    expect(normalizeZone("the café")).toBe("maker_space");
  });
  it("accepts loose chat language", () => {
    expect(normalizeZone("lawn")).toBe("event_space");
    expect(normalizeZone("go to the cafe pls")).toBe("maker_space");
    expect(normalizeZone("quiet corner")).toBe("network_hub");
    expect(normalizeZone("stage")).toBe("plaza");
  });
  it("rejects unknown places", () => {
    expect(normalizeZone("the moon")).toBeNull();
  });
});

describe("parseChatReply actions", () => {
  it("parses a move action and normalizes the zone", () => {
    const out = parseChatReply('{"reply":"On my way to the Lawn!","facts":[],"goal":null,"action":{"type":"move","zone":"THE LAWN"}}');
    expect(out.command).toEqual({ type: "go", zone: "event_space" });
  });
  it("drops actions with unknown zones", () => {
    const out = parseChatReply('{"reply":"ok","facts":[],"goal":null,"action":{"type":"move","zone":"narnia"}}');
    expect(out.command).toBeNull();
  });
  it("defaults action to null when missing", () => {
    const out = parseChatReply('{"reply":"hey!","facts":[],"goal":null}');
    expect(out.command).toBeNull();
  });
});

describe("buildChatTools", () => {
  const tools = buildChatTools(["Ravi", "Aiko"]);
  const byName = new Map(tools.map((t) => [t.name, t]));

  it("offers every action the twin can take", () => {
    expect([...byName.keys()].sort()).toEqual(["be_free", "go_to", "remember_fact", "set_goal", "stay_here", "talk_to"]);
  });
  it("go_to only accepts real venues", () => {
    const place = (byName.get("go_to")!.input_schema as unknown as { properties: { place: { enum: string[] } } }).properties.place;
    expect(place.enum.sort()).toEqual(["event_space", "maker_space", "network_hub", "plaza"]);
  });
  it("talk_to only accepts real villagers", () => {
    const name = (byName.get("talk_to")!.input_schema as unknown as { properties: { name: { enum: string[] } } }).properties.name;
    expect(name.enum).toEqual(["Ravi", "Aiko"]);
  });
});

describe("parseToolTurn", () => {
  const villagers = ["Ravi", "Aiko"];

  it("reads the spoken reply, the command and remembered facts", () => {
    const out = parseToolTurn(
      {
        text: "On my way!",
        toolCalls: [
          { name: "go_to", input: { place: "maker_space" } },
          { name: "remember_fact", input: { fact: "Owner loves tea" } }
        ]
      },
      villagers
    );
    expect(out).toEqual({ reply: "On my way!", facts: ["Owner loves tea"], goal: null, command: { type: "go", zone: "maker_space" } });
  });

  it("maps talk_to, stay_here, be_free and set_goal", () => {
    expect(parseToolTurn({ text: "", toolCalls: [{ name: "talk_to", input: { name: "aiko" } }] }, villagers).command)
      .toEqual({ type: "talk_to", targetName: "Aiko" });
    expect(parseToolTurn({ text: "", toolCalls: [{ name: "stay_here", input: {} }] }, villagers).command).toEqual({ type: "stay" });
    expect(parseToolTurn({ text: "", toolCalls: [{ name: "be_free", input: {} }] }, villagers).command).toEqual({ type: "free" });
    expect(parseToolTurn({ text: "ok", toolCalls: [{ name: "set_goal", input: { goal: "befriend Ravi" } }] }, villagers).goal).toBe("befriend Ravi");
  });

  it("drops commands that point at unknown places or people", () => {
    expect(parseToolTurn({ text: "hm", toolCalls: [{ name: "go_to", input: { place: "narnia" } }] }, villagers).command).toBeNull();
    expect(parseToolTurn({ text: "hm", toolCalls: [{ name: "talk_to", input: { name: "Gandalf" } }] }, villagers).command).toBeNull();
  });

  it("caps facts at 3", () => {
    const calls = ["a", "b", "c", "d"].map((f) => ({ name: "remember_fact", input: { fact: f } }));
    expect(parseToolTurn({ text: "ok", toolCalls: calls }, villagers).facts).toEqual(["a", "b", "c"]);
  });
});
