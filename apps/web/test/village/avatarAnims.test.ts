import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BODY_ANIMS, type ActionItem, type BodyAnim } from "@aivillage/shared";
import {
  BIKE, LIMB, PoseBlender, RIG_KEYS, SEATED_ANIMS, bikeCrank, chopLift, faceFor, hipHeight, popcornBite, propFor, restRig, samplePose, seatLift,
  type Rig, type RigKey
} from "../../components/village/avatar/pose";
import type { AvatarPose } from "../../components/village/avatar/types";

const pose = (anim: BodyAnim, animTime: number, opts: Partial<AvatarPose> = {}): AvatarPose => ({
  anim, animTime, walking: false, walkPhase: animTime * 7, speed: 1, ...opts
});
const sample = (p: AvatarPose) => samplePose(p, 0.4, restRig());
const sweep = (from: number, to: number, dt: number) => {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-9; t += dt) out.push(t);
  return out;
};

const NEW_ANIMS: BodyAnim[] = ["swim", "bike", "run", "lift", "dig", "watch", "ride"];
const ITEMS: (ActionItem | null)[] = [null, "juice", "plate", "popcorn", "basket", "dumbbell", "book", "laptop", "dish"];

/** Ankle (end of the shin) in the avatar's side plane: [z, y] relative to the avatar origin. */
function ankle(r: Rig, side: "l" | "r"): [number, number] {
  const f = side === "l" ? r.ltf : r.rtf;
  const k = side === "l" ? r.lk : r.rk;
  const hy = hipHeight(r) - LIMB.hipDrop;
  return [
    r.z + LIMB.thigh * Math.sin(f) + LIMB.shin * Math.sin(f - k),
    hy - LIMB.thigh * Math.cos(f) - LIMB.shin * Math.cos(f - k)
  ];
}

describe("avatar anims (Main Street)", () => {
  it("every BODY_ANIM has its own pose with finite joints over a time sweep, with and without items", () => {
    for (const a of BODY_ANIMS)
      for (const item of ITEMS)
        for (const walking of [false, true])
          for (const t of sweep(0, 26, 0.37)) {
            const r = sample(pose(a, t, { item, walking }));
            for (const k of RIG_KEYS) expect(Number.isFinite(r[k]), `${a}/${item}/${walking}.${k}@${t}`).toBe(true);
          }
  });

  it("the new anims are real poses (not the idle fallback)", () => {
    const idle = sample(pose("idle", 1.3));
    for (const a of NEW_ANIMS) {
      const r = sample(pose(a, 1.3));
      const d = RIG_KEYS.reduce((s, k) => s + Math.abs(r[k] - idle[k]), 0);
      expect(d, a).toBeGreaterThan(1);
    }
  });

  it("seated anims keep the hips at seat height", () => {
    expect([...SEATED_ANIMS].sort()).toEqual(["bike", "ride", "sit", "watch"]);
    for (const t of sweep(0, 25, 0.25)) {
      for (const a of ["sit", "watch", "ride"] as const) {
        const h = hipHeight(sample(pose(a, t)));
        expect(h, `${a}@${t}`).toBeGreaterThan(0.29);
        expect(h, `${a}@${t}`).toBeLessThan(0.33);
      }
      const b = hipHeight(sample(pose("bike", t)));
      expect(b, `bike@${t}`).toBeCloseTo(BIKE.seatY, 2);
      // thighs forward like a seat
      expect(sample(pose("watch", t)).ltf).toBeGreaterThan(1.2);
      expect(sample(pose("ride", t)).ltf).toBeGreaterThan(1.2);
    }
  });

  it("swim lies the body (almost) horizontal, face forward-down, also while moving along the lane", () => {
    for (const walking of [false, true])
      for (const t of sweep(0, 12, 0.2)) {
        const r = sample(pose("swim", t, { walking }));
        expect(r.bx, `bx@${t}`).toBeGreaterThan(1.25);
        expect(r.bx, `bx@${t}`).toBeLessThan(1.55);
        // the head lifts against the pitch so the face looks forward-down, not at the pool floor
        expect(r.hx, `hx@${t}`).toBeLessThan(-0.2);
        expect(hipHeight(r)).toBeGreaterThan(0.25);
        expect(hipHeight(r)).toBeLessThan(0.36);
      }
    // arms really stroke: each shoulder sweeps from overhead (reach) to the hip (pull)
    const lsf = sweep(0, 4, 0.05).map((t) => sample(pose("swim", t)).lsf);
    expect(Math.max(...lsf)).toBeGreaterThan(2.8);
    expect(Math.min(...lsf)).toBeLessThan(0.2);
  });

  it("bike feet ride the pedal circle and the hands stay forward on the handlebar", () => {
    for (const walking of [false, true])
      for (const t of sweep(0, 6, 0.1)) {
        const p = pose("bike", t, { walking, walkPhase: t * 9 });
        const r = sample(p);
        const c = bikeCrank(p);
        for (const [side, off] of [["l", 0], ["r", Math.PI]] as const) {
          const [z, y] = ankle(r, side);
          // pedalling forward: the top of the crank moves to the front (same turn as the wheels)
          const pz = BIKE.crankZ - BIKE.crankR * Math.sin(c + off);
          const py = BIKE.crankY - BIKE.crankR * Math.cos(c + off) + BIKE.ankleAbovePedal;
          expect(Math.hypot(z - pz, y - py), `${side}@${t} walking=${walking}`).toBeLessThan(0.01);
        }
        expect(r.lsf).toBeGreaterThan(0.6);
        expect(r.rsf).toBeGreaterThan(0.6);
        expect(r.sx).toBeGreaterThan(0.1); // slight forward lean
      }
    // the crank turns with time when parked and with the walk phase when moving
    expect(bikeCrank(pose("bike", 2))).not.toBeCloseTo(bikeCrank(pose("bike", 1)), 2);
    expect(bikeCrank(pose("bike", 1, { walking: true, walkPhase: 4 }))).not.toBeCloseTo(
      bikeCrank(pose("bike", 1, { walking: true, walkPhase: 2 })), 2);
  });

  it("run, lift and dig keep the feet on the floor", () => {
    const reach = (f: number, o: number, k: number) => (LIMB.thigh * Math.cos(f) + LIMB.shin * Math.cos(f - k)) * Math.cos(o);
    for (const a of ["run", "lift", "dig"] as const)
      for (const t of sweep(0, 12, 0.13)) {
        const r = sample(pose(a, t));
        const lowest = hipHeight(r) - LIMB.hipDrop - Math.max(reach(r.ltf, r.lto, r.lk), reach(r.rtf, r.rto, r.rk));
        expect(lowest - r.y, `${a}@${t}`).toBeGreaterThan(0);
        expect(lowest - r.y, `${a}@${t}`).toBeLessThan(0.05);
      }
  });

  it("lift does curls (elbows fold) and an overhead press (arms up); dig bends over and stands up to wipe the brow", () => {
    const lift = sweep(0, 8, 0.05).map((t) => sample(pose("lift", t)));
    expect(Math.max(...lift.map((r) => r.le))).toBeGreaterThan(2);
    expect(Math.max(...lift.map((r) => Math.min(r.lso, r.rso)))).toBeGreaterThan(2.5); // both arms overhead
    expect(lift.every((r) => r.lto > 0.08 && r.rto > 0.08)).toBe(true); // feet apart
    const dig = sweep(0, 10, 0.05).map((t) => sample(pose("dig", t)));
    expect(Math.max(...dig.map((r) => r.sx))).toBeGreaterThan(0.45);
    expect(Math.min(...dig.map((r) => r.sx))).toBeLessThan(0.05);
    expect(Math.max(...dig.map((r) => r.re))).toBeGreaterThan(2); // hand up at the brow
  });

  it("loops are continuous: small change between frames, across every loop seam", () => {
    const dt = 1 / 60;
    // (old one-shots like jump snap on purpose; the new loops must not)
    for (const a of [...NEW_ANIMS, "idle", "drink", "eat"] as BodyAnim[])
      for (const item of [null, "popcorn", "basket", "juice"] as const)
        for (const walking of [false, true]) {
          let prev: Rig | null = null;
          for (const t of sweep(0, 30, dt)) {
            const r = sample(pose(a, t, { item, walking, walkPhase: t * 8 }));
            if (prev) for (const k of RIG_KEYS) {
              const step = Math.abs(r[k] - prev[k]);
              if (step > 0.2) expect.fail(`${a}/${item}/walk=${walking}: ${k} jumps ${step.toFixed(3)} at ${t.toFixed(3)}s`);
            }
            prev = { ...r };
          }
        }
  });

  it("items override the anim's prop and stay in hand while carried", () => {
    expect(propFor(pose("drink", 1))).toBe("cup");
    expect(propFor(pose("drink", 1, { item: "juice" }))).toBe("juice");
    expect(propFor(pose("eat", 1, { item: "plate" }))).toBe("plate");
    expect(propFor(pose("watch", 1, { item: "popcorn" }))).toBe("popcorn");
    expect(propFor(pose("lift", 1, { item: "dumbbell" }))).toBe("dumbbell");
    expect(propFor(pose("dig", 1, { item: "basket" }))).toBe("basket");
    expect(propFor(pose("bike", 1))).toBe("bike");
    expect(propFor(pose("bike", 1, { walking: true }))).toBe("bike");
    expect(propFor(pose("watch", 1))).toBeNull();
    // carried while walking: the arm holds it instead of swinging
    expect(propFor(pose("idle", 1, { walking: true, item: "basket" }))).toBe("basket");
    expect(propFor(pose("idle", 1, { walking: true, item: "dumbbell" }))).toBeNull();
    const carry = [0.5, 0.9, 1.3].map((t) => sample(pose("idle", t, { walking: true, walkPhase: t * 8, item: "basket" })));
    for (const r of carry) expect(r.le).toBeGreaterThan(1.2);
    expect(Math.abs(carry[0].lsf - carry[1].lsf)).toBeLessThan(0.05);
    expect(Math.abs(carry[0].rsf - carry[1].rsf)).toBeGreaterThan(0.1); // the free arm still swings
  });

  it("popcorn: a kernel goes to the mouth now and then (right hand up at the same time)", () => {
    const ts = sweep(0, 12, 0.05);
    const bites = ts.filter((t) => popcornBite(t) > 0.5);
    expect(bites.length).toBeGreaterThan(4);
    expect(bites.length).toBeLessThan(ts.length * 0.4);
    for (const t of ts.filter((x) => popcornBite(x) > 0.8))
      expect(sample(pose("watch", t, { item: "popcorn" })).re, `${t}`).toBeGreaterThan(1.9);
  });

  it("faces: effort for swim/run/lift, happy watch, excited ride", () => {
    const faces = (a: BodyAnim) => sweep(0, 14, 0.1).map((t) => faceFor(pose(a, t)));
    for (const a of ["swim", "run", "lift"] as const)
      expect(faces(a).some((f) => f.mouth === "o" || f.mouth === "flat"), a).toBe(true);
    expect(faces("watch").some((f) => f.eyes === "happy")).toBe(true);
    expect(faces("ride").every((f) => f.mouth === "open")).toBe(true);
  });
});

const UPPER: RigKey[] = [
  "sx", "sy", "sz", "hx", "hy", "hz",
  "lsf", "lso", "lst", "le", "lez", "lw", "rsf", "rso", "rst", "re", "rez", "rw"
];
const SEATED_UPPER: BodyAnim[] = ["drink", "eat", "read", "talk", "laugh", "think", "phone", "clap", "wave", "cheer"];

describe("seated: upper-body anims on a chair / in the cart", () => {
  it("hips stay on the seat and the knees stay bent, whatever the upper body does (also while carried along)", () => {
    for (const a of SEATED_UPPER)
      for (const walking of [false, true])
        for (const t of sweep(0, 8, 0.1)) {
          const r = sample(pose(a, t, { seated: true, walking, item: a === "eat" ? "plate" : null }));
          expect(hipHeight(r), `${a}@${t}`).toBeGreaterThan(0.29);
          expect(hipHeight(r), `${a}@${t}`).toBeLessThan(0.33);
          expect(r.ltf, `${a}@${t}`).toBeGreaterThan(1.2);
          expect(r.rk, `${a}@${t}`).toBeGreaterThan(1.2);
          expect(r.bx).toBe(0);
        }
  });

  it("the upper body plays the same anim as standing", () => {
    for (const a of SEATED_UPPER)
      for (const t of [0.3, 1.1, 2.4, 5.2]) {
        const item = a === "drink" ? "juice" : null;
        const sat = sample(pose(a, t, { seated: true, item }));
        const stood = sample(pose(a, t, { item }));
        for (const k of UPPER) expect(sat[k], `${a}.${k}@${t}`).toBeCloseTo(stood[k], 6);
      }
  });

  it("seated anims ignore the flag; the flag changes the blend so it never snaps", () => {
    for (const a of ["sit", "watch", "ride", "bike"] as const)
      for (const t of [0.4, 2.2]) {
        const on = sample(pose(a, t, { seated: true }));
        const off = sample(pose(a, t));
        for (const k of RIG_KEYS) expect(on[k], `${a}.${k}`).toBeCloseTo(off[k], 6);
      }
    // sitting down mid-anim crossfades the legs
    const b = new PoseBlender(0.3);
    for (let i = 0; i < 30; i++) b.update(pose("drink", i / 30), 1 / 30);
    const before = b.current.ltf;
    b.update(pose("drink", 1, { seated: true }), 1 / 30);
    expect(Math.abs(b.current.ltf - before)).toBeLessThan(0.3);
    for (let i = 0; i < 12; i++) b.update(pose("drink", 1 + i / 30, { seated: true }), 1 / 30);
    expect(b.current.ltf).toBeGreaterThan(1.5);
  });

  it("the root lift puts seated hips on the seat for any body scale (within 5 mm)", () => {
    for (const bodyScale of [0.9, 0.955, 1.08])
      for (const scale of [1, 1.3])
        for (const p of [pose("sit", 1), pose("watch", 2), pose("ride", 3), pose("cheer", 0.4, { seated: true }), pose("eat", 1, { seated: true })]) {
          const r = sample(p);
          const hips = hipHeight(r) * scale * bodyScale + seatLift(r, p.anim, scale, bodyScale);
          expect(Math.abs(hips - LIMB.restHip * scale), `${p.anim} ${bodyScale}x${scale}`).toBeLessThan(0.005);
        }
    // the bike is drawn inside the scaled avatar: no lift; standing bodies: no lift
    expect(seatLift(sample(pose("bike", 1)), "bike", 1, 0.9)).toBe(0);
    expect(seatLift(sample(pose("idle", 1)), "idle", 1, 0.9)).toBe(0);
    expect(seatLift(sample(pose("swim", 1)), "swim", 1, 0.9)).toBe(0);
  });
});

/** Left hand position relative to its shoulder, in the spine frame (x out to the side, y up). */
function leftHand(r: Rig): THREE.Vector3 {
  const sh = new THREE.Object3D();
  sh.rotation.set(-r.lsf, r.lst, r.lso);
  const el = new THREE.Object3D();
  el.position.set(0, -0.115, 0);
  el.rotation.set(-r.le, 0, r.lez);
  const hand = new THREE.Object3D();
  hand.position.set(0, -0.13, 0);
  sh.add(el);
  el.add(hand);
  sh.updateMatrixWorld(true);
  return hand.getWorldPosition(new THREE.Vector3());
}

describe("lift transitions", () => {
  it("goes from the curls to the press without a straight-armed 'T'", () => {
    for (const t of sweep(0, 16, 0.02)) {
      const h = leftHand(sample(pose("lift", t, { item: "dumbbell" })));
      // an arm out to the side must either be bent in (hand close) or already overhead
      if (h.y < 0.08) expect(h.x, `t=${t.toFixed(2)} hand ${h.x.toFixed(3)},${h.y.toFixed(3)}`).toBeLessThan(0.16);
    }
  });
});

const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const LEFT_ARM: RigKey[] = ["lsf", "lso", "le", "lez", "lw"];

describe("kitchen and library anims", () => {
  const KL: BodyAnim[] = ["chop", "stir", "type"];

  it("are real poses (not the idle fallback), loop without jumps, and keep standing feet on the floor", () => {
    const idle = sample(pose("idle", 1.3));
    for (const a of KL) {
      const r = sample(pose(a, 1.3));
      expect(RIG_KEYS.reduce((s, k) => s + Math.abs(r[k] - idle[k]), 0), a).toBeGreaterThan(1);
      let prev: Rig | null = null;
      for (const t of sweep(0, 30, 1 / 60)) {
        const q = sample(pose(a, t));
        if (prev) for (const k of RIG_KEYS) {
          const step = Math.abs(q[k] - prev[k]);
          if (step > 0.2) expect.fail(`${a}: ${k} jumps ${step.toFixed(3)} at ${t.toFixed(3)}s`);
        }
        prev = { ...q };
        // standing: no leg work at all
        expect(q.ltf + q.rtf + q.lk + q.rk, `${a}@${t}`).toBe(0);
      }
    }
  });

  it("chop: the knife hand goes up and down over the board, the other hand holds the food still", () => {
    const rs = sweep(0, 6, 0.02).map((t) => sample(pose("chop", t)));
    expect(range(rs.map((r) => r.re))).toBeGreaterThan(0.4); // the forearm chops
    for (const k of LEFT_ARM) expect(range(rs.map((r) => r[k])), k).toBeLessThan(0.08);
    for (const r of rs) {
      expect(r.rsf).toBeGreaterThan(0.5); // hands forward, over the board
      expect(r.lsf).toBeGreaterThan(0.5);
      expect(r.hx).toBeGreaterThan(0.2); // eyes on the board
    }
    // chopLift: knife up (1) ↔ on the board (0), in step with the forearm
    const lifts = sweep(0, 6, 0.02).map((t) => chopLift(t));
    expect(Math.max(...lifts)).toBeGreaterThan(0.9);
    expect(Math.min(...lifts)).toBeLessThan(0.1);
    expect(propFor(pose("chop", 1))).toBe("knife");
  });

  it("stir: one hand circles over the pan, the other holds the pan's handle", () => {
    const ts = sweep(0, 5, 0.02);
    const rs = ts.map((t) => sample(pose("stir", t)));
    expect(range(rs.map((r) => r.rsf))).toBeGreaterThan(0.15);
    expect(range(rs.map((r) => r.rso))).toBeGreaterThan(0.15);
    // a circle, not a line: the (rsf, rso) path encloses an area
    let area = 0;
    for (let i = 1; i < rs.length; i++) area += rs[i - 1].rsf * rs[i].rso - rs[i].rsf * rs[i - 1].rso;
    expect(Math.abs(area / 2)).toBeGreaterThan(0.05);
    for (const k of LEFT_ARM) expect(range(rs.map((r) => r[k])), k).toBeLessThan(0.08);
    expect(propFor(pose("stir", 1))).toBe("spatula");
  });

  it("type: seated at the desk, both hands forward on the laptop, fingers tapping in turn", () => {
    const rs = sweep(0, 8, 0.02).map((t) => sample(pose("type", t, { seated: true, item: "laptop" })));
    for (const r of rs) {
      expect(hipHeight(r)).toBeGreaterThan(0.29);
      expect(hipHeight(r)).toBeLessThan(0.33);
      expect(r.ltf).toBeGreaterThan(1.2);
      expect(r.le).toBeGreaterThan(1);
      expect(r.re).toBeGreaterThan(1);
      expect(r.hx).toBeGreaterThan(0.15); // looking down at the screen
    }
    expect(range(rs.map((r) => r.lw))).toBeGreaterThan(0.1);
    expect(range(rs.map((r) => r.rw))).toBeGreaterThan(0.1);
    const together = rs.filter((r) => Math.abs(r.lw - r.rw) < 0.02).length;
    expect(together).toBeLessThan(rs.length * 0.5); // the hands don't tap in sync
    // both arms mirror: hands meet in front of the body
    const r = rs[10];
    expect(r.lsf).toBeCloseTo(r.rsf, 1);
    expect(propFor(pose("type", 1, { item: "laptop", seated: true }))).toBe("laptop");
    expect(propFor(pose("type", 1))).toBe("laptop");
  });

  it("faces concentrate while chopping, stirring and typing", () => {
    for (const a of ["chop", "stir", "type"] as const) {
      const faces = sweep(0, 10, 0.1).map((t) => faceFor(pose(a, t)));
      expect(faces.some((f) => f.mouth === "flat" || f.mouth === "o"), a).toBe(true);
    }
  });
});

describe("items: book, laptop and the cooked dish", () => {
  it("read + book shows the book; a seated reader keeps the read pose", () => {
    expect(propFor(pose("read", 1, { item: "book", seated: true }))).toBe("book");
  });

  it("the dish: eaten like a plate, carried in one hand while walking to the table", () => {
    expect(propFor(pose("eat", 1, { item: "dish", dish: "pasta" }))).toBe("dish");
    for (const t of [0.3, 0.9, 1.3]) {
      const dish = sample(pose("eat", t, { item: "dish", dish: "pasta", seated: true }));
      const plate = sample(pose("eat", t, { item: "plate", seated: true }));
      for (const k of RIG_KEYS) expect(dish[k], `${k}@${t}`).toBeCloseTo(plate[k], 6);
    }
    // carried: shown while walking, the holding arm stays still while the other swings
    expect(propFor(pose("idle", 1, { walking: true, item: "dish", dish: "steak" }))).toBe("dish");
    const carry = [0.5, 0.9, 1.3].map((t) => sample(pose("idle", t, { walking: true, walkPhase: t * 8, item: "dish", dish: "steak" })));
    for (const r of carry) expect(r.le).toBeGreaterThan(1.2);
    expect(Math.abs(carry[0].lsf - carry[1].lsf)).toBeLessThan(0.05);
    expect(Math.abs(carry[0].rsf - carry[1].rsf)).toBeGreaterThan(0.1);
  });
});
