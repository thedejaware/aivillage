import { describe, it, expect } from "vitest";
import {
  GENDERS, SKIN_TONES, FACES, HAIRSTYLES, HAIR_COLORS, ACCESSORIES, OUTFITS, OUTFIT_COLORS,
  DEFAULT_APPEARANCE, validateAppearance, randomAppearance
} from "../src/index.js";

function seeded(seed = 7): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("appearance options", () => {
  it("offers a real choice in every category", () => {
    expect(GENDERS.length).toBeGreaterThanOrEqual(2);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(6);
    expect(FACES.length).toBeGreaterThanOrEqual(6);
    expect(HAIRSTYLES.length).toBeGreaterThanOrEqual(10);
    expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(ACCESSORIES.length).toBeGreaterThanOrEqual(6);
    expect(OUTFITS.length).toBeGreaterThanOrEqual(6);
    expect(OUTFIT_COLORS.length).toBeGreaterThanOrEqual(6);
  });
  it("ids are unique inside each category", () => {
    for (const list of [GENDERS, SKIN_TONES, FACES, HAIRSTYLES, HAIR_COLORS, ACCESSORIES, OUTFITS, OUTFIT_COLORS]) {
      const ids = list.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("accessories include 'none' and at least two kinds of glasses", () => {
    const ids = ACCESSORIES.map((a) => a.id);
    expect(ids).toContain("none");
    expect(ids.filter((id) => id.includes("glasses")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateAppearance", () => {
  it("keeps a valid appearance as it is", () => {
    const a = { ...DEFAULT_APPEARANCE, hair: HAIRSTYLES[3].id, outfit: OUTFITS[2].id };
    expect(validateAppearance(a)).toEqual(a);
  });
  it("replaces unknown or missing values with defaults", () => {
    const out = validateAppearance({ gender: "dragon", hair: 42, outfit: OUTFITS[1].id });
    expect(out.gender).toBe(DEFAULT_APPEARANCE.gender);
    expect(out.hair).toBe(DEFAULT_APPEARANCE.hair);
    expect(out.outfit).toBe(OUTFITS[1].id);
    expect(out.skin).toBe(DEFAULT_APPEARANCE.skin);
  });
  it("survives garbage input", () => {
    expect(validateAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(validateAppearance("hello")).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("randomAppearance", () => {
  it("always produces a valid appearance", () => {
    const r = seeded();
    for (let i = 0; i < 50; i++) {
      const a = randomAppearance(r);
      expect(validateAppearance(a)).toEqual(a);
    }
  });
  it("varies between calls", () => {
    const r = seeded();
    const looks = new Set(Array.from({ length: 20 }, () => JSON.stringify(randomAppearance(r))));
    expect(looks.size).toBeGreaterThan(15);
  });
});

// ─── v4.1: Bitmoji-style features — gender sets the starting look, every feature is its own choice ───
import {
  FACE_SHAPES, EYE_SHAPES, EYE_COLORS, BROWS, LASHES, NOSES, MOUTHS, LIP_COLORS, BLUSH, FACIAL_HAIR, BUILDS, HEIGHTS,
  GENDER_PRESETS, withGender, FEATURE_KEYS
} from "../src/index.js";

describe("face and body features", () => {
  const lists = { FACE_SHAPES, EYE_SHAPES, EYE_COLORS, BROWS, LASHES, NOSES, MOUTHS, LIP_COLORS, BLUSH, FACIAL_HAIR, BUILDS, HEIGHTS };

  it("every feature offers a real choice with unique ids", () => {
    for (const [name, list] of Object.entries(lists)) {
      expect(list.length, name).toBeGreaterThanOrEqual(3);
      expect(new Set(list.map((o) => o.id)).size, name).toBe(list.length);
    }
  });

  it("'none' exists where a feature can be absent", () => {
    for (const list of [LASHES, BLUSH, FACIAL_HAIR]) expect(list.map((o) => o.id)).toContain("none");
  });

  it("male and female start clearly different (at least 6 face/body features)", () => {
    const m = GENDER_PRESETS.male;
    const f = GENDER_PRESETS.female;
    const differ = FEATURE_KEYS.filter((k) => m[k] !== f[k]);
    expect(differ.length).toBeGreaterThanOrEqual(6);
  });

  it("every preset uses valid ids", () => {
    for (const g of GENDERS) {
      const a = withGender(DEFAULT_APPEARANCE, g.id);
      expect(validateAppearance(a)).toEqual(a);
    }
  });
});

describe("withGender", () => {
  it("switches face and body to the gender's starting look, keeps hair, skin and clothes", () => {
    const start = { ...DEFAULT_APPEARANCE, hair: "afro", hairColor: "blonde", skin: "deep", outfit: "suit", outfitColor: "red", accessory: "cap" };
    const male = withGender(start, "male");
    expect(male).toMatchObject({ gender: "male", hair: "afro", hairColor: "blonde", skin: "deep", outfit: "suit", outfitColor: "red", accessory: "cap" });
    for (const k of FEATURE_KEYS) expect(male[k]).toBe(GENDER_PRESETS.male[k]);
  });
});

describe("validateAppearance with features", () => {
  it("an old look (no features) gets its gender's starting features", () => {
    const old = { gender: "male", skin: "tan", face: "calm", hair: "short", hairColor: "black", accessory: "none", outfit: "hoodie", outfitColor: "blue" };
    const out = validateAppearance(old);
    expect(out).toMatchObject(old);
    for (const k of FEATURE_KEYS) expect(out[k]).toBe(GENDER_PRESETS.male[k]);
  });

  it("keeps chosen features and replaces unknown ones", () => {
    const out = validateAppearance({ ...withGender(DEFAULT_APPEARANCE, "female"), facialHair: "full_beard", nose: "trunk" });
    expect(out.facialHair).toBe("full_beard"); // anyone may have a beard
    expect(out.nose).toBe(GENDER_PRESETS.female.nose);
  });
});

describe("randomAppearance with features", () => {
  it("random villagers look varied: some beards, some make-up, several face shapes", () => {
    const r = seeded(11);
    const looks = Array.from({ length: 200 }, () => randomAppearance(r));
    expect(looks.some((a) => a.facialHair !== "none")).toBe(true);
    expect(looks.some((a) => a.lipColor !== "natural")).toBe(true);
    expect(new Set(looks.map((a) => a.faceShape)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(looks.map((a) => a.build)).size).toBeGreaterThanOrEqual(3);
  });
});
