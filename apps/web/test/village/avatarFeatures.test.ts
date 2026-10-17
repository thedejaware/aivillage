import { describe, expect, it } from "vitest";
import {
  BLUSH, BROWS, BUILDS, DEFAULT_APPEARANCE, EYE_COLORS, EYE_SHAPES, FACE_SHAPES, FACIAL_HAIR, GENDERS, HEIGHTS, LASHES,
  LIP_COLORS, MOUTHS, NOSES, colorHex, withGender, type Appearance
} from "@aivillage/shared";
import {
  BASE_TORSO, RefPool, beardCoverage, beardMask, bodyShape, faceDesign, faceTextureKey, headCenterY, headShape, torsoProfile,
  torsoRadiusAt, warpHead
} from "../../components/village/avatar/features";

const look = (gender: string, extra: Partial<Appearance> = {}): Appearance => ({
  ...withGender({ ...DEFAULT_APPEARANCE }, gender),
  ...extra
});

describe("bodyShape", () => {
  const male = bodyShape(look("male"));
  const female = bodyShape(look("female"));
  const nb = bodyShape(look("nonbinary"));

  it("default male has clearly broader shoulders and no bust", () => {
    expect(male.shoulderX / female.shoulderX).toBeGreaterThan(1.15);
    expect(male.bust).toBe(0);
    expect(female.bust).toBeGreaterThan(0.5);
  });

  it("default female has a defined waist and wider hips than waist", () => {
    expect(female.waist).toBeLessThan(female.chest * 0.88);
    expect(female.hem).toBeGreaterThan(female.waist * 1.15);
    expect(female.pelvisX).toBeGreaterThan(male.pelvisX * 1.1);
  });

  it("male torso is straight (waist close to chest)", () => {
    expect(male.waist).toBeGreaterThan(male.chest * 0.88);
  });

  it("male hands and feet are bigger", () => {
    expect(male.hand).toBeGreaterThan(female.hand);
    expect(male.foot).toBeGreaterThan(female.foot);
  });

  it("non-binary sits between male and female on the same build", () => {
    const same = { build: "average", height: "medium" };
    const m = bodyShape(look("male", same));
    const f = bodyShape(look("female", same));
    const n = bodyShape(look("nonbinary", same));
    for (const k of ["shoulderX", "chest", "pelvisX", "bust", "hand"] as const) {
      expect(n[k]).toBeGreaterThanOrEqual(Math.min(m[k], f[k]));
      expect(n[k]).toBeLessThanOrEqual(Math.max(m[k], f[k]));
    }
    expect(nb.scale).toBeGreaterThan(0);
  });

  it("build changes the body: broad > average > slim, curvy widens hips", () => {
    const b = (build: string) => bodyShape(look("female", { build }));
    expect(b("broad").chest).toBeGreaterThan(b("average").chest);
    expect(b("average").chest).toBeGreaterThan(b("slim").chest);
    expect(b("curvy").pelvisX).toBeGreaterThan(b("average").pelvisX);
    expect(b("athletic").arm).toBeGreaterThan(b("average").arm);
    expect(b("athletic").shoulderX).toBeGreaterThan(b("average").shoulderX);
  });

  it("height scales the body; the head grows less than the body", () => {
    const h = (height: string) => bodyShape(look("male", { height }));
    expect(h("short").scale).toBeLessThan(h("medium").scale);
    expect(h("tall").scale).toBeGreaterThan(h("medium").scale);
    const headWorld = (s: ReturnType<typeof bodyShape>) => s.scale * s.headScale;
    const bodyGrow = h("tall").scale / h("short").scale;
    const headGrow = headWorld(h("tall")) / headWorld(h("short"));
    expect(headGrow).toBeGreaterThan(1);
    expect(headGrow).toBeLessThan(bodyGrow);
    expect(headCenterY(look("male", { height: "tall" }))).toBeGreaterThan(headCenterY(look("male", { height: "short" })));
  });

  it("every gender × build × height is finite and positive", () => {
    for (const g of GENDERS)
      for (const b of BUILDS)
        for (const h of HEIGHTS) {
          const s = bodyShape(look(g.id, { build: b.id, height: h.id }));
          for (const [k, v] of Object.entries(s)) {
            expect(Number.isFinite(v), `${g.id}/${b.id}/${h.id}.${k}`).toBe(true);
            if (k !== "bust") expect(v, k).toBeGreaterThan(0);
          }
        }
  });

  it("unknown ids fall back to sensible values", () => {
    const s = bodyShape({ ...DEFAULT_APPEARANCE, gender: "x", build: "x", height: "x" });
    expect(s.scale).toBeGreaterThan(0.9);
    expect(s.scale).toBeLessThan(1.1);
  });
});

describe("torso profile", () => {
  it("profile follows the shape and closes at both ends", () => {
    const s = bodyShape(look("female"));
    const p = torsoProfile(s);
    expect(p[0][0]).toBe(0);
    expect(p[p.length - 1][0]).toBe(0);
    expect(p.length).toBe(BASE_TORSO.length);
    expect(torsoRadiusAt(s, 0.09)).toBeCloseTo(s.waist, 5);
  });

  it("radius interpolates between knots", () => {
    const s = bodyShape(look("male"));
    const mid = torsoRadiusAt(s, (0.09 + 0.165) / 2);
    expect(mid).toBeGreaterThan(Math.min(s.waist, s.chest) - 1e-9);
    expect(mid).toBeLessThan(Math.max(s.waist, s.chest) + 1e-9);
  });
});

describe("head shape", () => {
  it("each face shape has distinct proportions", () => {
    const seen = new Set(FACE_SHAPES.map((f) => JSON.stringify(headShape(f.id))));
    expect(seen.size).toBe(FACE_SHAPES.length);
  });

  it("the warp leaves the top half alone and changes the jaw", () => {
    const sq = headShape("square");
    const heart = headShape("heart");
    expect(warpHead(sq, 0.1, 0.05, 0.15)).toEqual([0.1, 0.05, 0.15]);
    const chinSq = warpHead(sq, 0.1, -0.18, 0.08);
    const chinHeart = warpHead(heart, 0.1, -0.18, 0.08);
    expect(Math.abs(chinSq[0])).toBeGreaterThan(Math.abs(chinHeart[0]) * 1.2);
    // long faces reach lower
    expect(warpHead(headShape("long"), 0, -0.22, 0)[1]).toBeLessThan(warpHead(headShape("round"), 0, -0.22, 0)[1]);
  });
});

describe("face design", () => {
  const each = (key: keyof Appearance, ids: string[]) =>
    new Set(ids.map((id) => JSON.stringify(faceDesign(look("female", { [key]: id })))));

  it("every option of every face feature changes the drawing", () => {
    expect(each("eyeShape", EYE_SHAPES.map((o) => o.id)).size).toBe(EYE_SHAPES.length);
    expect(each("eyeColor", EYE_COLORS.map((o) => o.id)).size).toBe(EYE_COLORS.length);
    expect(each("brows", BROWS.map((o) => o.id)).size).toBe(BROWS.length);
    expect(each("lashes", LASHES.map((o) => o.id)).size).toBe(LASHES.length);
    expect(each("nose", NOSES.map((o) => o.id)).size).toBe(NOSES.length);
    expect(each("mouth", MOUTHS.map((o) => o.id)).size).toBe(MOUTHS.length);
    expect(each("lipColor", LIP_COLORS.map((o) => o.id)).size).toBe(LIP_COLORS.length);
    expect(each("blush", BLUSH.map((o) => o.id)).size).toBe(BLUSH.length);
  });

  it("iris uses the eye colour; lipstick only when not natural", () => {
    const d = faceDesign(look("male", { eyeColor: "blue", lipColor: "natural", mouth: "natural" }));
    expect(d.eye.iris).toBe(colorHex(EYE_COLORS, "blue"));
    expect(d.lip).toBeNull();
    expect(faceDesign(look("female", { lipColor: "red" })).lip).toBe(colorHex(LIP_COLORS, "red"));
  });

  it("blush strength follows the feature", () => {
    expect(faceDesign(look("male", { blush: "none" })).blush).toBe(0);
    expect(faceDesign(look("male", { blush: "rosy" })).blush).toBeGreaterThan(faceDesign(look("male", { blush: "soft" })).blush);
  });
});

describe("face texture key", () => {
  const a = look("female");
  const k = faceTextureKey(a, "base", "base");

  it("changes with every face feature and expression state", () => {
    const keys: [keyof Appearance, string][] = [
      ["face", "wink"], ["eyeShape", "round"], ["eyeColor", "green"], ["brows", "bushy"], ["lashes", "none"], ["nose", "wide"],
      ["mouth", "thin"], ["lipColor", "red"], ["blush", "rosy"], ["hairColor", "blonde"], ["skin", "deep"]
    ];
    for (const [key, v] of keys) expect(faceTextureKey({ ...a, [key]: v }, "base", "base"), key).not.toBe(k);
    expect(faceTextureKey(a, "closed", "base")).not.toBe(k);
    expect(faceTextureKey(a, "base", "open")).not.toBe(k);
  });

  it("ignores body, clothes and hair style (shared textures)", () => {
    for (const [key, v] of [["build", "slim"], ["height", "tall"], ["outfit", "suit"], ["hair", "afro"], ["faceShape", "long"], ["facialHair", "full_beard"]] as const)
      expect(faceTextureKey({ ...a, [key]: v }, "base", "base"), key).toBe(k);
  });
});

describe("beard mask", () => {
  const front = (y: number) => [0, y, Math.sqrt(1 - y * y)] as const;
  it("none covers nothing; the mouth always stays open", () => {
    for (const f of FACIAL_HAIR) expect(beardMask(f.id, ...front(-0.375))).toBe(0);
    expect(beardMask("none", ...front(-0.8))).toBe(0);
  });

  it("chin coverage: full > short > 0, goatee on the chin only", () => {
    const chin = front(-0.8);
    expect(beardMask("full_beard", ...chin)).toBeGreaterThan(beardMask("short_beard", ...chin));
    expect(beardMask("short_beard", ...chin)).toBeGreaterThan(0);
    expect(beardMask("goatee", ...chin)).toBeGreaterThan(0);
    const cheek = [0.8, -0.45, 0.4] as const;
    expect(beardMask("goatee", ...cheek)).toBe(0);
    expect(beardMask("full_beard", ...cheek)).toBeGreaterThan(0);
  });

  it("never covers the eyes, the forehead or the back of the head", () => {
    for (const f of FACIAL_HAIR) {
      expect(beardMask(f.id, ...front(0.2))).toBe(0);
      expect(beardMask(f.id, ...front(-0.05))).toBe(0);
      expect(beardMask(f.id, 0, -0.5, -0.86)).toBe(0);
    }
  });
});

describe("RefPool", () => {
  it("creates once, shares, keeps a few idle entries and disposes the oldest idle", () => {
    const made: string[] = [];
    const gone: string[] = [];
    const pool = new RefPool<string>(2, (k) => { made.push(k); return k.toUpperCase(); }, (v) => gone.push(v));
    expect(pool.acquire("a")).toBe("A");
    expect(pool.acquire("a")).toBe("A");
    expect(made).toEqual(["a"]);
    pool.acquire("b");
    pool.acquire("c");
    pool.release("a");
    pool.release("a");
    pool.release("b");
    pool.release("c"); // 3 idle > 2 → the oldest goes
    expect(gone).toEqual(["A"]);
    pool.acquire("d");
    pool.release("d");
    expect(gone).toEqual(["A", "B"]);
    // a re-acquired idle entry is reused, not recreated
    pool.acquire("c");
    expect(made.filter((m) => m === "c").length).toBe(1);
  });

  it("never disposes an entry in use", () => {
    const gone: number[] = [];
    let n = 0;
    const pool = new RefPool<number>(0, () => ++n, (v) => gone.push(v));
    pool.acquire("x");
    pool.acquire("y");
    pool.release("y");
    expect(gone).toEqual([2]);
    pool.release("missing");
    expect(gone).toEqual([2]);
  });
});

describe("beard coverage", () => {
  it("is positive exactly where the mask grows hair", () => {
    for (const f of FACIAL_HAIR)
      for (let i = 0; i < 400; i++) {
        const th = (i * 0.37) % Math.PI;
        const ph = (i * 1.13) % (Math.PI * 2);
        const x = Math.sin(th) * Math.cos(ph);
        const y = Math.cos(th);
        const z = Math.sin(th) * Math.sin(ph);
        expect(beardCoverage(f.id, x, y, z) > 0, `${f.id} ${x},${y},${z}`).toBe(beardMask(f.id, x, y, z) > 0);
      }
  });
});
