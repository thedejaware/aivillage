import { describe, expect, it } from "vitest";
import { BODY_ANIMS, type BodyAnim } from "@aivillage/shared";
import {
  LIMB, PoseBlender, RIG_KEYS, faceFor, hipHeight, legDrop, propFor, restRig, samplePose, type Rig
} from "../../components/village/avatar/pose";
import type { AvatarPose } from "../../components/village/avatar/types";

const pose = (anim: BodyAnim, animTime = 0.7, walking = false, speed = 1): AvatarPose => ({
  anim, animTime, walking, walkPhase: animTime * 7, speed
});

const diff = (a: Rig, b: Rig) => RIG_KEYS.reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);

describe("avatar pose", () => {
  it("every anim gives finite joint values", () => {
    for (const a of BODY_ANIMS)
      for (const t of [0, 0.3, 1.1, 2.7, 9.9]) {
        const r = samplePose(pose(a, t), 0.4, restRig());
        for (const k of RIG_KEYS) expect(Number.isFinite(r[k]), `${a}.${k}@${t}`).toBe(true);
      }
  });

  it("every anim differs from idle", () => {
    const idle = samplePose(pose("idle", 1.3), 0.4, restRig());
    for (const a of BODY_ANIMS) {
      if (a === "idle") continue;
      const best = Math.max(...[0.4, 0.8, 1.3, 2.0].map((t) => diff(samplePose(pose(a, t), 0.4, restRig()), idle)));
      expect(best, a).toBeGreaterThan(0.5);
    }
  });

  it("standing feet stay on the floor (hips never sink below leg reach)", () => {
    for (const a of BODY_ANIMS) {
      if (a === "sit" || a === "sleep") continue;
      for (const t of [0.2, 0.9, 1.6]) {
        const r = samplePose(pose(a, t), 0.4, restRig());
        // lowest ankle sits at its rest height (0.02) plus any hop (r.y)
        const reach = (f: number, o: number, k: number) => (LIMB.thigh * Math.cos(f) + LIMB.shin * Math.cos(f - k)) * Math.cos(o);
        const ankle = hipHeight(r) - LIMB.hipDrop - Math.max(reach(r.ltf, r.lto, r.lk), reach(r.rtf, r.rto, r.rk));
        expect(ankle - r.y, `${a}@${t}`).toBeGreaterThan(0.0);
        expect(ankle - r.y, `${a}@${t}`).toBeLessThan(0.05);
        expect(legDrop(r)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("sit keeps the hips at seat height and the thighs forward", () => {
    const r = samplePose(pose("sit", 1), 0.4, restRig());
    expect(hipHeight(r)).toBeCloseTo(0.31, 2);
    expect(r.ltf).toBeGreaterThan(1.3);
    expect(r.lk).toBeGreaterThan(1.2);
  });

  it("walking overrides the legs but keeps busy hands", () => {
    const walk = samplePose(pose("phone", 0.5, true), 0.4, restRig());
    const still = samplePose(pose("phone", 0.5, false), 0.4, restRig());
    expect(walk.rso).toBeCloseTo(still.rso, 6);
    const w1 = samplePose(pose("idle", 0.2, true), 0.4, restRig());
    const w2 = samplePose(pose("idle", 0.45, true), 0.4, restRig());
    expect(Math.abs(w1.ltf - w2.ltf)).toBeGreaterThan(0.1);
    expect(propFor(pose("phone", 0, true))).toBe("phone");
    expect(propFor(pose("dance", 0, true))).toBeNull();
  });

  it("blends into a new anim instead of snapping", () => {
    const b = new PoseBlender(0.3);
    for (let i = 0; i < 30; i++) b.update(pose("idle", i / 30), 1 / 30);
    const before = { ...b.current };
    const cheer = samplePose(pose("cheer", 0.03), 0.3, restRig());
    b.update(pose("cheer", 0.03), 1 / 30);
    const step = Math.abs(b.current.lsf - before.lsf);
    expect(step).toBeLessThan(Math.abs(cheer.lsf - before.lsf) * 0.2);
    for (let i = 0; i < 12; i++) b.update(pose("cheer", 0.06 + i / 30), 1 / 30);
    expect(b.current.lsf).toBeGreaterThan(2.3);
  });

  it("maps faces and props", () => {
    expect(faceFor(pose("sleep")).eyes).toBe("closed");
    expect(faceFor(pose("kiss")).mouth).toBe("pucker");
    expect(faceFor(pose("cry")).eyes).toBe("cry");
    expect(propFor(pose("drink"))).toBe("cup");
    expect(propFor(pose("sweep"))).toBe("broom");
    expect(propFor(pose("water"))).toBe("can");
    expect(propFor(pose("idle"))).toBeNull();
  });
});
