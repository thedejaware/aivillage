import { describe, it, expect } from "vitest";
import { DEFAULT_APPEARANCE, type TwinSummary } from "@aivillage/shared";
import { sortTwins, roleLabel, personalityOf, goalOf, patchFor, initialOf, errorText } from "../../lib/settings/twins";

const twin = (over: Partial<TwinSummary>): TwinSummary => ({
  id: "x", name: "X", role: "villager", active: true, appearance: DEFAULT_APPEARANCE, traits: [], goals: [], ...over
});

describe("settings twin helpers", () => {
  it("lists main twins first (active main on top), then villagers, hidden ones last in each group", () => {
    const list = [
      twin({ id: "v-hidden", name: "Ann", active: false }),
      twin({ id: "v", name: "Bob" }),
      twin({ id: "m-hidden", name: "Zed", role: "main", active: false }),
      twin({ id: "m", name: "Yan", role: "main" })
    ];
    expect(sortTwins(list).map((t) => t.id)).toEqual(["m", "m-hidden", "v", "v-hidden"]);
  });

  it("labels the role", () => {
    expect(roleLabel(twin({ role: "main", active: true }))).toBe("Main · active");
    expect(roleLabel(twin({ role: "main", active: false }))).toBe("Main");
    expect(roleLabel(twin({ role: "villager" }))).toBe("Villager");
  });

  it("reads personality and goal as one line each", () => {
    const t = twin({ traits: ["warm", "funny"], goals: ["open a café", "learn guitar"] });
    expect(personalityOf(t)).toBe("warm, funny");
    expect(goalOf(t)).toBe("open a café");
    expect(goalOf(twin({}))).toBe("");
  });

  it("patches only what changed and keeps extra goals", () => {
    const t = twin({ name: "Sena", traits: ["warm", "funny"], goals: ["open a café", "learn guitar"] });
    const same = { name: "Sena", appearance: DEFAULT_APPEARANCE, personality: "warm, funny", goal: "open a café" };
    expect(patchFor(t, same)).toEqual({});
    const changed = { ...same, name: " Sena Kaya ", appearance: { ...DEFAULT_APPEARANCE, hair: "afro" }, personality: "calm", goal: "read books" };
    expect(patchFor(t, changed)).toEqual({
      name: "Sena Kaya",
      appearance: { ...DEFAULT_APPEARANCE, hair: "afro" },
      traits: ["calm"],
      goals: ["read books", "learn guitar"]
    });
  });

  it("does not send an empty personality or goal (the server cannot clear them)", () => {
    const t = twin({ traits: ["warm"], goals: ["a"] });
    expect(patchFor(t, { name: "X", appearance: DEFAULT_APPEARANCE, personality: " ", goal: "" })).toEqual({});
  });

  it("makes a thumbnail initial", () => {
    expect(initialOf("  sena kaya")).toBe("S");
    expect(initialOf("")).toBe("?");
  });

  it("turns server errors into plain words", () => {
    expect(errorText(409, { error: "village is full", code: "limit" })).toMatch(/full/i);
    expect(errorText(400, { error: "name is required", code: "invalid" })).toBe("Name is required");
    expect(errorText(500, null)).toMatch(/went wrong/i);
  });
});
