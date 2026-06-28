import { describe, it, expect } from "vitest";
import type { Memory } from "@aivillage/shared";
import { InMemoryMemoryStore } from "../../src/agent/memoryStore.js";

const mem = (id: string, twinId: string, content: string): Memory => ({
  id, twinId, kind: "event", content, importance: 0, createdAt: "2026-06-28T00:00:00.000Z"
});

describe("InMemoryMemoryStore", () => {
  it("returns the most recent memories for a twin, newest first", () => {
    const s = new InMemoryMemoryStore();
    s.append(mem("m1", "t1", "first"));
    s.append(mem("m2", "t1", "second"));
    s.append(mem("m3", "t2", "other twin"));
    const recent = s.recent("t1", 5);
    expect(recent.map((m) => m.content)).toEqual(["second", "first"]);
  });
  it("respects the limit", () => {
    const s = new InMemoryMemoryStore();
    for (let i = 0; i < 5; i++) s.append(mem("m" + i, "t1", "c" + i));
    expect(s.recent("t1", 2).map((m) => m.content)).toEqual(["c4", "c3"]);
  });
});
