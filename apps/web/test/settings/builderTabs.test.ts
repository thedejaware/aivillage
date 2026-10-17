import { describe, it, expect } from "vitest";
import {
  DEFAULT_APPEARANCE, FACIAL_HAIR, OUTFITS, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, EYE_COLORS, LIP_COLORS,
  type Appearance
} from "@aivillage/shared";
import {
  BUILDER_TABS, HEADER_KEYS, coverageProblems, nextIndex, previewFocusFor, startingLook, switchGender, tabById
} from "../../lib/settings/builderTabs";

const appearanceKeys = Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[];

describe("avatar builder tabs", () => {
  it("has the Bitmoji-style tabs in order", () => {
    expect(BUILDER_TABS.map((t) => t.id)).toEqual(["body", "face", "hair", "style", "about"]);
    expect(BUILDER_TABS.map((t) => t.label)).toEqual(["Body", "Face", "Hair", "Style", "About"]);
  });

  it("puts every look field in exactly one place (gender at the top, the rest in one tab)", () => {
    const seen = new Map<string, number>();
    for (const k of HEADER_KEYS) seen.set(k, (seen.get(k) ?? 0) + 1);
    for (const tab of BUILDER_TABS) for (const f of tab.fields) seen.set(f.key, (seen.get(f.key) ?? 0) + 1);
    for (const k of appearanceKeys) expect(seen.get(k), `field ${k}`).toBe(1);
    expect([...seen.keys()].sort()).toEqual([...appearanceKeys].sort());
    expect(coverageProblems()).toEqual([]);
  });

  it("reports missing and doubled fields", () => {
    const broken = [
      { id: "body" as const, label: "Body", focus: "body" as const, fields: [BUILDER_TABS[0].fields[0], BUILDER_TABS[0].fields[0]] }
    ];
    const problems = coverageProblems(broken);
    expect(problems).toContain("skin is in 2 places");
    expect(problems).toContain("hair is missing");
  });

  it("groups the fields the way Bitmoji does", () => {
    const keys = (id: string) => tabById(id as never).fields.map((f) => f.key);
    expect(keys("body")).toEqual(["skin", "build", "height"]);
    expect(keys("face")).toEqual([
      "faceShape", "face", "eyeShape", "eyeColor", "brows", "lashes", "nose", "mouth", "lipColor", "blush", "facialHair"
    ]);
    expect(keys("hair")).toEqual(["hair", "hairColor"]);
    expect(keys("style")).toEqual(["outfit", "outfitColor", "accessory"]);
    expect(keys("about")).toEqual([]);
  });

  it("offers every option to everyone (facial hair and clothes are not filtered by gender)", () => {
    const field = (key: keyof Appearance) => BUILDER_TABS.flatMap((t) => t.fields).find((f) => f.key === key)!;
    expect(field("facialHair").options).toBe(FACIAL_HAIR);
    expect(field("outfit").options).toBe(OUTFITS);
  });

  it("shows colours as swatches and everything else as picture tiles", () => {
    const all = BUILDER_TABS.flatMap((t) => t.fields);
    const swatches = all.filter((f) => f.kind === "swatch").map((f) => f.key).sort();
    expect(swatches).toEqual(["eyeColor", "hairColor", "lipColor", "outfitColor", "skin"]);
    const field = (key: keyof Appearance) => all.find((f) => f.key === key)!;
    expect(field("skin").options).toBe(SKIN_TONES);
    expect(field("hairColor").options).toBe(HAIR_COLORS);
    expect(field("outfitColor").options).toBe(OUTFIT_COLORS);
    expect(field("eyeColor").options).toBe(EYE_COLORS);
    expect(field("lipColor").options).toBe(LIP_COLORS);
    for (const f of all) expect(f.label.length, f.key).toBeGreaterThan(0);
  });

  it("zooms the preview on the face for Face and Hair, shows the whole body otherwise", () => {
    expect(previewFocusFor("face")).toBe("face");
    expect(previewFocusFor("hair")).toBe("face");
    expect(previewFocusFor("body")).toBe("body");
    expect(previewFocusFor("style")).toBe("body");
    expect(previewFocusFor("about")).toBe("body");
  });

  it("moves through a group with the arrow keys, wrapping at the ends", () => {
    expect(nextIndex(0, "ArrowRight", 4)).toBe(1);
    expect(nextIndex(3, "ArrowRight", 4)).toBe(0);
    expect(nextIndex(0, "ArrowLeft", 4)).toBe(3);
    expect(nextIndex(2, "ArrowDown", 4)).toBe(3);
    expect(nextIndex(2, "ArrowUp", 4)).toBe(1);
    expect(nextIndex(2, "Home", 4)).toBe(0);
    expect(nextIndex(1, "End", 4)).toBe(3);
    expect(nextIndex(1, "a", 4)).toBeNull();
  });

  it("fills in a missing or old saved look from its gender's starting look", () => {
    const male = startingLook({ gender: "male", hair: "afro" });
    expect(male.gender).toBe("male");
    expect(male.hair).toBe("afro");
    expect(male.facialHair).toBe("stubble");
    expect(startingLook(undefined)).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("switchGender", () => {
  it("also changes the hairstyle while the player hasn't picked one", () => {
    const start = startingLook(undefined); // female default: bob
    expect(switchGender(start, "male", false).hair).toBe("short");
    expect(switchGender(start, "nonbinary", false).hair).toBe("side_part");
    expect(switchGender(switchGender(start, "male", false), "female", false).hair).toBe("bob");
  });

  it("never touches a hairstyle the player chose", () => {
    const start = { ...startingLook(undefined), hair: "ponytail" };
    expect(switchGender(start, "male", true).hair).toBe("ponytail");
  });

  it("face and body follow the gender either way", () => {
    expect(switchGender(startingLook(undefined), "male", true)).toMatchObject({ gender: "male", lashes: "none", facialHair: "stubble" });
  });
});
