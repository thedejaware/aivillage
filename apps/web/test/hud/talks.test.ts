import { describe, it, expect } from "vitest";
import { ZONE_DISPLAY, ZONE_EMOJI, type ConversationView } from "@aivillage/shared";
import {
  TALKS_PAGE,
  hasOlder,
  mergeTalks,
  speakerTwin,
  talkNames,
  talkPlace,
  talksUrl,
  talkMeta
} from "../../lib/hud/talks";

const KWAME = { id: "t1", name: "Kwame", colorHex: 0xff0000 };
const SENA = { id: "t2", name: "Sena", colorHex: 0x00ff00 };

function talk(id: string, createdAt: string, extra: Partial<ConversationView> = {}): ConversationView {
  return {
    id, createdAt, zone: null, kind: "chat", twins: [KWAME, SENA],
    lines: [{ speaker: "Kwame", text: "Hi" }, { speaker: "Sena", text: "Hey" }],
    moment: null, ...extra
  };
}

describe("talksUrl", () => {
  it("asks for the newest page", () => {
    expect(talksUrl("http://x:4000")).toBe(`http://x:4000/api/conversations?limit=${TALKS_PAGE}`);
  });

  it("asks for older ones with before=<createdAt>, encoded", () => {
    expect(talksUrl("http://x", "2026-10-19T10:00:00.000Z")).toBe(
      `http://x/api/conversations?limit=${TALKS_PAGE}&before=2026-10-19T10%3A00%3A00.000Z`
    );
  });
});

describe("mergeTalks", () => {
  it("keeps newest first and drops duplicates by id", () => {
    const a = [talk("b", "2026-10-19T10:00:00Z"), talk("a", "2026-10-19T09:00:00Z")];
    const fresh = [talk("c", "2026-10-19T11:00:00Z"), talk("b", "2026-10-19T10:00:00Z")];
    expect(mergeTalks(a, fresh).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("appends an older page at the end", () => {
    const a = [talk("c", "2026-10-19T11:00:00Z")];
    const older = [talk("b", "2026-10-19T10:00:00Z"), talk("a", "2026-10-19T09:00:00Z")];
    expect(mergeTalks(a, older).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("the incoming copy wins for a duplicate id", () => {
    const a = [talk("a", "2026-10-19T09:00:00Z", { moment: null })];
    const b = [talk("a", "2026-10-19T09:00:00Z", { moment: "They became friends" })];
    expect(mergeTalks(a, b)[0].moment).toBe("They became friends");
  });

  it("does not change its inputs", () => {
    const a = [talk("a", "2026-10-19T09:00:00Z")];
    const b = [talk("b", "2026-10-19T10:00:00Z")];
    mergeTalks(a, b);
    expect(a.map((t) => t.id)).toEqual(["a"]);
    expect(b.map((t) => t.id)).toEqual(["b"]);
  });
});

describe("hasOlder", () => {
  it("a full page means there may be more", () => {
    expect(hasOlder(TALKS_PAGE)).toBe(true);
    expect(hasOlder(TALKS_PAGE - 1)).toBe(false);
    expect(hasOlder(0)).toBe(false);
  });
});

describe("talkNames", () => {
  it("joins two twins with ↔ and keeps their colours", () => {
    const parts = talkNames(talk("a", "2026-10-19T09:00:00Z"));
    expect(parts.map((p) => p.name)).toEqual(["Kwame", "Sena"]);
    expect(parts[0].sep).toBe("");
    expect(parts[1].sep).toBe(" ↔ ");
    expect(parts[0].color).toBe("#ff0000");
    expect(parts[0].id).toBe("t1");
  });

  it("a single twin has no separator", () => {
    const parts = talkNames(talk("a", "2026-10-19T09:00:00Z", { twins: [KWAME] }));
    expect(parts).toHaveLength(1);
    expect(parts[0].sep).toBe("");
  });

  it("three or more twins are joined with commas", () => {
    const third = { id: "t3", name: "Ama", colorHex: 0x0000ff };
    const parts = talkNames(talk("a", "2026-10-19T09:00:00Z", { twins: [KWAME, SENA, third] }));
    expect(parts.map((p) => p.sep)).toEqual(["", ", ", ", "]);
  });
});

describe("talkPlace", () => {
  it("shows emoji + place name for a known zone", () => {
    const zone = Object.keys(ZONE_DISPLAY)[0];
    expect(talkPlace(zone)).toBe(`${ZONE_EMOJI[zone] ?? "📍"} ${ZONE_DISPLAY[zone]}`);
  });

  it("is empty when the place is unknown or missing", () => {
    expect(talkPlace(null)).toBe("");
  });

  it("falls back to the raw zone id with a pin", () => {
    expect(talkPlace("moon_base")).toBe("📍 moon_base");
  });
});

describe("talkMeta", () => {
  it("joins place and relative time", () => {
    const zone = Object.keys(ZONE_DISPLAY)[0];
    const now = Date.parse("2026-10-19T10:05:00Z");
    expect(talkMeta(talk("a", "2026-10-19T10:00:00Z", { zone }), now)).toBe(`${talkPlace(zone)} · 5m ago`);
  });

  it("leaves out a missing place", () => {
    const now = Date.parse("2026-10-19T10:00:10Z");
    expect(talkMeta(talk("a", "2026-10-19T10:00:00Z"), now)).toBe("just now");
  });
});

describe("speakerTwin", () => {
  it("finds the twin who spoke a line by name", () => {
    expect(speakerTwin(talk("a", "2026-10-19T10:00:00Z"), "Sena")?.id).toBe("t2");
  });

  it("is null for a speaker who is not in the talk", () => {
    expect(speakerTwin(talk("a", "2026-10-19T10:00:00Z"), "Narrator")).toBeNull();
  });
});
