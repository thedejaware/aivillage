import { describe, it, expect } from "vitest";
import { ACTIONS, BODY_ANIMS, findAction, checkSafety, consentGiven, resolveAction } from "../src/index.js";

describe("action catalogue", () => {
  it("covers everyday life (~30 actions) with unique ids", () => {
    expect(ACTIONS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
  });
  it("includes the real-life actions the owner asked for", () => {
    for (const id of ["wash_hands", "hug", "kiss_cheek", "jump", "wave", "dance", "sit", "sleep", "high_five"]) {
      expect(findAction(id), id).toBeDefined();
    }
  });
  it("every action plays a known body animation", () => {
    for (const a of ACTIONS) expect(BODY_ANIMS).toContain(a.anim);
  });
  it("touch needs a partner and consent; solo actions need neither", () => {
    expect(findAction("hug")).toMatchObject({ target: true, consentMin: expect.any(Number) });
    expect(findAction("kiss_cheek")!.consentMin!).toBeGreaterThan(findAction("hug")!.consentMin!);
    expect(findAction("jump")).toMatchObject({ target: false, consentMin: null });
  });
  it("finds actions by loose names", () => {
    expect(findAction("Wash Hands")?.id).toBe("wash_hands");
    expect(findAction("kiss")?.id).toBe("kiss_cheek");
    expect(findAction("teleport")).toBeUndefined();
  });
});

describe("checkSafety", () => {
  it("allows ordinary life", () => {
    expect(checkSafety("playing guitar").ok).toBe(true);
    expect(checkSafety("kiss on the cheek").ok).toBe(true);
  });
  it("blocks violence, sexual content and breaking the world", () => {
    for (const bad of ["punch Ravi", "kill him", "take off clothes", "kiss on the lips", "fly over the island", "teleport home", "leave the village"]) {
      expect(checkSafety(bad).ok, bad).toBe(false);
    }
  });
});

describe("consentGiven", () => {
  it("solo actions never need consent", () => {
    expect(consentGiven(findAction("jump")!, -100)).toBe(true);
  });
  it("touch depends on how the other twin feels", () => {
    const hug = findAction("hug")!;
    expect(consentGiven(hug, 20)).toBe(true);
    expect(consentGiven(hug, -40)).toBe(false);
    const kiss = findAction("kiss_cheek")!;
    expect(consentGiven(kiss, 5)).toBe(false);
    expect(consentGiven(kiss, 60)).toBe(true);
  });
});

describe("resolveAction", () => {
  it("resolves a catalogue action", () => {
    expect(resolveAction({ action: "wave" })).toMatchObject({ ok: true, action: { id: "wave", anim: "wave", targetName: null } });
  });
  it("keeps the partner for social actions", () => {
    expect(resolveAction({ action: "hug", target: "Ravi" })).toMatchObject({ ok: true, action: { id: "hug", targetName: "Ravi" } });
  });
  it("a social action without a partner is refused", () => {
    expect(resolveAction({ action: "hug" })).toMatchObject({ ok: false });
  });
  it("anything else becomes a mime with its own label", () => {
    const out = resolveAction({ action: "play guitar", emoji: "🎸" });
    expect(out).toMatchObject({ ok: true, action: { id: "mime", label: "play guitar", emoji: "🎸" } });
    if (out.ok) expect(BODY_ANIMS).toContain(out.action.anim);
  });
  it("unsafe requests are refused with a reason", () => {
    const out = resolveAction({ action: "punch", target: "Ravi" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason.length).toBeGreaterThan(0);
  });
});
