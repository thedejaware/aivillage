"use client";

/**
 * Hand-held props (cup, phone, broom, watering can, apple, book, kitchen knife,
 * wooden spoon, laptop), held items (juice glass, plate + fork, the cooked dish
 * + fork, popcorn tub, basket, dumbbells), the avatar's
 * own bike and small effects (bubbles, water drops, sleep "z"). They are
 * always mounted but hidden; Avatar.tsx shows the one the current anim needs
 * and orients it.
 */
import { useEffect, useState } from "react";
import * as THREE from "three";
import type { DishLook } from "@aivillage/shared";
import { DishModel } from "../dishes";
import { BIKE, type PropId } from "./pose";
import { geo, mat, merge, place, sphere, capsule, rbox, zzzMaterial } from "./assets";
import { M } from "./Look";

/** A prop can need more than one node (plate + fork, two dumbbells); the basket also has a spot on the ground. */
export type PropNodeKey = PropId | "fork" | "dumbbellL" | "basketGround";
const COMPANION: Partial<Record<PropNodeKey, PropNodeKey[]>> = { fork: ["plate", "dish"], dumbbellL: ["dumbbell"] };
/** Is node `id` part of the shown prop? */
export const nodeShown = (id: string, shown: PropNodeKey | null) =>
  shown !== null && (id === shown || (COMPANION[id as PropNodeKey]?.includes(shown) ?? false));
/** The venue's dish models are drawn at this size in the hand (tune with the kitchen's plates). */
const HELD_DISH_SCALE = 1;

export interface PropNodes {
  groups: Partial<Record<PropNodeKey, THREE.Object3D>>;
  /** inner nodes that Avatar re-orients each frame (upright in the avatar's frame) */
  cup: THREE.Group | null;
  phone: THREE.Group | null;
  can: THREE.Group | null;
  broom: THREE.Group | null;
  juice: THREE.Group | null;
  plate: THREE.Group | null;
  fork: THREE.Group | null;
  tub: THREE.Group | null;
  basket: THREE.Group | null;
  knife: THREE.Group | null;
  spatula: THREE.Group | null;
  laptop: THREE.Group | null;
  dish: THREE.Group | null;
  /** set by <HeldDish>: which dish the hand holds (a React re-render of that small part only) */
  setDish: ((look: DishLook) => void) | null;
  kernel: THREE.Object3D | null;
  wheels: [THREE.Object3D | null, THREE.Object3D | null];
  crank: THREE.Object3D | null;
  bubbles: THREE.Object3D[];
  drops: THREE.Object3D[];
  zs: THREE.Sprite[];
}

export const newPropNodes = (): PropNodes => ({
  groups: {}, cup: null, phone: null, can: null, broom: null,
  juice: null, plate: null, fork: null, tub: null, basket: null, knife: null, spatula: null, laptop: null, dish: null, setDish: null,
  kernel: null, wheels: [null, null], crank: null,
  bubbles: [], drops: [], zs: []
});

const reg = (n: PropNodes, id: PropNodeKey) => (o: THREE.Object3D | null) => {
  if (o) {
    n.groups[id] = o;
    o.visible = false;
  }
};

/** Props carried in the right hand (mounted inside the right hand group). */
export function HandProps({ n }: { n: PropNodes }) {
  return (
    <>
      <group ref={reg(n, "cup")}>
        <group ref={(g) => { n.cup = g; }}>
          <M g={geo("mug", () => merge([
            new THREE.CylinderGeometry(0.033, 0.028, 0.072, 16),
            place(new THREE.TorusGeometry(0.019, 0.0065, 6, 12, Math.PI * 1.2), [0.0, 0.0, -0.034], [0, Math.PI / 2, -Math.PI * 0.6])
          ]))} m={mat("#ffffff", { rough: 0.5 })} position={[0.045, 0.01, 0.02]} />
          <M g={geo("coffee", () => new THREE.CylinderGeometry(0.028, 0.028, 0.004, 16))} m={mat("#7a4b2a")} position={[0.045, 0.045, 0.02]} shadow={false} />
        </group>
      </group>
      <group ref={reg(n, "phone")}>
        <group ref={(g) => { n.phone = g; }}>
          <M g={geo("phone", () => rbox(0.012, 0.075, 0.038, 0.005))} m={mat("#2b2f3a", { rough: 0.35 })} position={[0.03, 0.01, 0.0]} />
        </group>
      </group>
      <group ref={reg(n, "can")}>
        <group ref={(g) => { n.can = g; }}>
          <M g={geo("wateringCan", () => merge([
            place(new THREE.CylinderGeometry(0.045, 0.05, 0.085, 16), [0, -0.075, 0]),
            place(new THREE.TorusGeometry(0.03, 0.008, 6, 14, Math.PI), [0, -0.03, -0.005], [0, Math.PI / 2, 0]),
            place(new THREE.CylinderGeometry(0.008, 0.012, 0.11, 8), [0, -0.06, 0.075], [1.0, 0, 0]),
            place(new THREE.CylinderGeometry(0.018, 0.01, 0.014, 10), [0, -0.025, 0.122], [1.0, 0, 0])
          ]))} m={mat("#2fbfa5", { rough: 0.5 })} />
        </group>
      </group>
      <group ref={reg(n, "broom")}>
        <group ref={(g) => { n.broom = g; }}>
          <M g={geo("broomStick", () => place(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 8), [0, -0.17, 0]))} m={mat("#c9a27a")} />
          <M g={geo("broomHead", () => place(new THREE.CylinderGeometry(0.03, 0.065, 0.11, 10).scale(1, 1, 0.45), [0, -0.46, 0]))} m={mat("#e3c07a", { rough: 0.95 })} />
        </group>
      </group>
      <group ref={reg(n, "food")} position={[0.02, -0.075, 0.03]}>
        <M g={geo("apple", () => sphere(0.032, 14, 10).scale(1, 0.92, 1))} m={mat("#e5484d", { rough: 0.45 })} />
        <M g={geo("leaf", () => merge([place(capsule(0.004, 0.015), [0, 0.035, 0]), place(sphere(0.012, 8, 6), [0.012, 0.04, 0], [0, 0, -0.8], [1.4, 0.5, 0.4])]))} m={mat("#3fa66b")} shadow={false} />
      </group>
      <group ref={reg(n, "juice")}>
        <group ref={(g) => { n.juice = g; }}>
          {/* the hand grips the lower half; juice + straw show above the fingers */}
          <M g={geo("juiceIn", () => new THREE.CylinderGeometry(0.031, 0.026, 0.1, 16))} m={mat("#ff9a1f", { rough: 0.35 })} position={[0.045, 0.035, 0.025]} />
          <M g={geo("straw", () => place(new THREE.CylinderGeometry(0.0048, 0.0048, 0.14, 6), [0, 0, 0], [0, 0, 0.3]))} m={mat("#ff5d73", { rough: 0.5 })} position={[0.032, 0.115, 0.025]} shadow={false} />
          <M g={geo("glass", () => new THREE.CylinderGeometry(0.036, 0.03, 0.13, 16))} m={mat("#e8f6ff", { rough: 0.08, opacity: 0.38 })} position={[0.045, 0.045, 0.025]} shadow={false} />
        </group>
      </group>
      <group ref={reg(n, "fork")} position={[0.0, -0.035, 0.02]}>
        <group ref={(g) => { n.fork = g; }}>
          <M g={geo("fork", () => merge([
            place(capsule(0.007, 0.09), [0, 0.01, 0]),
            place(new THREE.BoxGeometry(0.028, 0.014, 0.006), [0, 0.068, 0]),
            ...[-0.0105, 0, 0.0105].map((x) => place(new THREE.BoxGeometry(0.0045, 0.04, 0.0045), [x, 0.093, 0]))
          ]))} m={mat("#cfd6de", { rough: 0.3, metal: 0.6 })} shadow={false} />
        </group>
      </group>
      <group ref={reg(n, "dumbbell")} position={[0.0, -0.035, 0.0]}>
        <M g={dumbbellGeo()} m={mat("#3d4350", { rough: 0.45, metal: 0.3 })} />
      </group>
      {/* kitchen knife: the blade points forward (+z of the avatar), Avatar tilts it with the chop */}
      <group ref={reg(n, "knife")} position={[0.0, -0.04, 0.015]}>
        <group ref={(g) => { n.knife = g; }}>
          <M g={geo("knifeHandle", () => place(capsule(0.009, 0.045), [0, 0, 0.0], [Math.PI / 2, 0, 0]))} m={mat("#3b2a20", { rough: 0.6 })} shadow={false} />
          <M g={geo("knifeBlade", () => merge([
            place(new THREE.BoxGeometry(0.004, 0.026, 0.085), [0, -0.004, 0.068]),
            place(new THREE.BoxGeometry(0.004, 0.012, 0.02), [0, -0.012, 0.118], [0.5, 0, 0])
          ]))} m={mat("#d9dee5", { rough: 0.25, metal: 0.7 })} shadow={false} />
        </group>
      </group>
      {/* wooden spoon: hangs from the fist, Avatar points it down into the pan */}
      <group ref={reg(n, "spatula")} position={[0.0, -0.035, 0.015]}>
        <group ref={(g) => { n.spatula = g; }}>
          <M g={geo("spoon", () => merge([
            place(new THREE.CylinderGeometry(0.006, 0.007, 0.16, 8), [0, -0.05, 0]),
            place(sphere(0.02, 10, 8), [0, -0.135, 0], [0, 0, 0], [1, 1.25, 0.45])
          ]))} m={mat("#c99a62", { rough: 0.8 })} shadow={false} />
        </group>
      </group>
      <mesh ref={(o) => { n.kernel = o; if (o) o.visible = false; }} geometry={geo("kernel", () => sphere(0.014, 8, 6).scale(1, 0.85, 1))}
        material={mat("#fff3c4", { rough: 0.8 })} position={[0.0, -0.078, 0.02]} />
    </>
  );
}

const dumbbellGeo = () => geo("dumbbell", () => merge([
  place(new THREE.CylinderGeometry(0.0085, 0.0085, 0.13, 8), [0, 0, 0], [0, 0, Math.PI / 2]),
  ...[-1, 1].map((sx) => place(new THREE.CylinderGeometry(0.031, 0.031, 0.024, 14), [sx * 0.052, 0, 0], [0, 0, Math.PI / 2]))
]));

/** Items held in the left hand: plate (eat), popcorn tub (watch), second dumbbell. */
export function LeftHandProps({ n }: { n: PropNodes }) {
  return (
    <>
      <group ref={reg(n, "plate")}>
        <group ref={(g) => { n.plate = g; }}>
          <group position={[-0.07, -0.04, 0.04]}>
            <M g={geo("plate", () => new THREE.CylinderGeometry(0.078, 0.058, 0.013, 24))} m={mat("#ffffff", { rough: 0.35 })} />
            <M g={geo("plateFood", () => merge([
              place(sphere(0.034, 12, 8), [-0.012, 0.012, 0.0], [0, 0, 0], [1.2, 0.45, 1]),
              place(sphere(0.022, 10, 8), [0.026, 0.014, -0.018], [0, 0, 0], [1, 0.7, 1])
            ]))} m={mat("#f2b84b", { rough: 0.6 })} shadow={false} />
            <M g={geo("plateGreens", () => merge([
              place(sphere(0.016, 8, 6), [0.03, 0.016, 0.022]),
              place(sphere(0.014, 8, 6), [0.045, 0.014, 0.0]),
              place(sphere(0.012, 8, 6), [-0.035, 0.02, 0.03])
            ]))} m={mat("#5cb85c", { rough: 0.7 })} shadow={false} />
          </group>
        </group>
      </group>
      <group ref={reg(n, "popcorn")}>
        <group ref={(g) => { n.tub = g; }}>
          <group position={[-0.07, 0.0, 0.01]}>
            <M g={geo("tub", () => new THREE.CylinderGeometry(0.052, 0.038, 0.1, 18))} m={mat("#fbf7ee", { rough: 0.6 })} />
            <M g={geo("tubStripes", () => merge([0, 1, 2, 3, 4, 5].map((i) => {
              const g = new THREE.BoxGeometry(0.014, 0.1, 0.004);
              g.rotateX(Math.atan2(0.014, 0.1));
              g.translate(0, 0, 0.0465);
              g.rotateY((i / 6) * Math.PI * 2);
              return g;
            })))} m={mat("#e5484d", { rough: 0.6 })} shadow={false} />
            <M g={geo("popcornTop", () => merge(
              [[0, 0.062, 0, 0.026], [0.026, 0.056, 0.012, 0.018], [-0.024, 0.056, 0.014, 0.018], [0.012, 0.056, -0.026, 0.018],
                [-0.02, 0.055, -0.02, 0.017], [0.008, 0.074, 0.01, 0.016], [-0.01, 0.072, -0.006, 0.015]]
                .map(([x, y, z, r]) => place(sphere(r, 8, 6), [x, y, z]))
            ))} m={mat("#fff3c4", { rough: 0.85 })} shadow={false} />
          </group>
        </group>
      </group>
      <group ref={reg(n, "dumbbellL")} position={[0.0, -0.035, 0.0]}>
        <M g={dumbbellGeo()} m={mat("#3d4350", { rough: 0.45, metal: 0.3 })} />
      </group>
      <group ref={reg(n, "dish")}>
        <group ref={(g) => { n.dish = g; }}>
          {/* DishModel's origin is the plate's bottom: the same spot as the plain plate's */}
          <group position={[-0.07, -0.0465, 0.04]} scale={HELD_DISH_SCALE}>
            <HeldDish n={n} />
          </group>
        </group>
      </group>
    </>
  );
}

/**
 * The dish the twin cooked, on its plate. Its look comes from the pose each
 * frame; Avatar calls `n.setDish` only when it changes, so just this part re-renders.
 */
function HeldDish({ n }: { n: PropNodes }) {
  const [look, setLook] = useState<DishLook | null>(null);
  useEffect(() => {
    n.setDish = setLook;
    return () => {
      n.setDish = null;
    };
  }, [n]);
  return look ? <DishModel look={look} stage="plate" /> : null;
}

/** Wicker basket with carrots and a lettuce; origin = top of the handle (it hangs below). */
function Basket() {
  return (
    <>
      <M g={geo("basket", () => merge([
        place(new THREE.CylinderGeometry(0.075, 0.058, 0.075, 18), [0, -0.1125, 0]),
        place(new THREE.TorusGeometry(0.075, 0.008, 6, 22), [0, -0.075, 0], [Math.PI / 2, 0, 0]),
        place(new THREE.TorusGeometry(0.07, 0.005, 5, 22), [0, -0.1, 0], [Math.PI / 2, 0, 0]),
        place(new THREE.TorusGeometry(0.065, 0.005, 5, 22), [0, -0.127, 0], [Math.PI / 2, 0, 0]),
        place(new THREE.TorusGeometry(0.075, 0.0065, 6, 16, Math.PI), [0, -0.075, 0])
      ]))} m={mat("#b5803f", { rough: 0.95 })} />
      <M g={geo("carrots", () => merge([
        place(new THREE.ConeGeometry(0.014, 0.08, 8), [-0.03, -0.07, 0.025], [Math.PI + 0.25, 0, 0.3]),
        place(new THREE.ConeGeometry(0.013, 0.075, 8), [-0.045, -0.072, -0.012], [Math.PI - 0.2, 0, 0.35]),
        place(new THREE.ConeGeometry(0.012, 0.07, 8), [0.01, -0.072, 0.035], [Math.PI + 0.35, 0, -0.1])
      ]))} m={mat("#f08a24", { rough: 0.6 })} shadow={false} />
      <M g={geo("basketGreens", () => merge([
        place(sphere(0.04, 12, 8), [0.025, -0.07, -0.012], [0, 0, 0], [1, 0.75, 1]),
        place(capsule(0.005, 0.025), [-0.038, -0.022, 0.034], [0.25, 0, 0.3]),
        place(capsule(0.005, 0.025), [-0.056, -0.026, -0.018], [-0.2, 0, 0.35]),
        place(capsule(0.005, 0.022), [0.004, -0.028, 0.046], [0.35, 0, -0.1])
      ]))} m={mat("#6cc04a", { rough: 0.75 })} shadow={false} />
    </>
  );
}

/** Basket hanging on the left forearm (mounted in the left elbow group). */
export function ForearmProps({ n }: { n: PropNodes }) {
  return (
    <group ref={reg(n, "basket")} position={[0, -0.05, 0]}>
      <group ref={(g) => { n.basket = g; }}>
        <Basket />
      </group>
    </group>
  );
}

const UP = new THREE.Vector3(0, 1, 0);
/** A tube between two points (bike frame). */
function tube(a: [number, number, number], b: [number, number, number], r: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(va);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  g.translate(va.x + d.x / 2, va.y + d.y / 2, va.z + d.z / 2);
  return g;
}

const B = BIKE;
const BB: [number, number, number] = [0, B.crankY, B.crankZ];
const REAR: [number, number, number] = [0, B.wheelR, B.rearZ];
const SEAT: [number, number, number] = [0, 0.215, -0.02];
const HEAD_T: [number, number, number] = [0, 0.4, 0.29];
const HEAD_B: [number, number, number] = [0, 0.31, 0.31];
const BAR: [number, number, number] = [0, 0.49, 0.285];

/** The avatar's own small bicycle (root frame): frame, saddle + bar, two spinning wheels, the crank. */
function Bike({ n }: { n: PropNodes }) {
  const wheel = geo("bikeWheel", () => merge([
    place(new THREE.TorusGeometry(B.wheelR - 0.012, 0.013, 8, 30), [0, 0, 0], [0, Math.PI / 2, 0]),
    place(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 10), [0, 0, 0], [0, 0, Math.PI / 2]),
    ...[0, 1, 2].map((i) => place(new THREE.BoxGeometry(0.004, (B.wheelR - 0.02) * 2, 0.004), [0, 0, 0], [(i * Math.PI) / 3, 0, 0]))
  ]));
  return (
    <group ref={reg(n, "bike")}>
      <M g={geo("bikeFrame", () => merge([
        tube(BB, [0, SEAT[1] + 0.005, SEAT[2]], 0.012),
        tube([0, SEAT[1] - 0.01, SEAT[2]], HEAD_T, 0.011),
        tube(BB, HEAD_B, 0.013),
        tube(HEAD_B, HEAD_T, 0.014),
        tube(HEAD_T, BAR, 0.009),
        ...[-1, 1].flatMap((sx) => [
          tube([sx * 0.012, BB[1], BB[2]], [sx * 0.026, REAR[1], REAR[2]], 0.008),
          tube([sx * 0.008, SEAT[1] - 0.015, SEAT[2]], [sx * 0.026, REAR[1], REAR[2]], 0.007),
          tube([sx * 0.008, HEAD_B[1], HEAD_B[2]], [sx * 0.026, B.wheelR, B.frontZ], 0.008)
        ])
      ]))} m={mat("#ef6a5a", { rough: 0.45, metal: 0.2 })} />
      <M g={geo("bikeDark", () => merge([
        place(rbox(0.07, 0.024, 0.11, 0.01), [0, SEAT[1] + 0.012, SEAT[2] - 0.005]),
        place(new THREE.CylinderGeometry(0.009, 0.009, 0.38, 8), BAR, [0, 0, Math.PI / 2]),
        ...[-1, 1].map((sx) => place(capsule(0.015, 0.05), [sx * 0.18, BAR[1], BAR[2]], [0, 0, Math.PI / 2]))
      ]))} m={mat("#2c3038", { rough: 0.6 })} />
      <group position={REAR} ref={(o) => { n.wheels[0] = o; }}>
        <M g={wheel} m={mat("#3a3f48", { rough: 0.7 })} />
      </group>
      <group position={[0, B.wheelR, B.frontZ]} ref={(o) => { n.wheels[1] = o; }}>
        <M g={wheel} m={mat("#3a3f48", { rough: 0.7 })} />
      </group>
      <group position={BB} ref={(o) => { n.crank = o; }}>
        <M g={geo("bikeCrank", () => merge([
          place(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 8), [0, 0, 0], [0, 0, Math.PI / 2]),
          place(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 18), [-0.03, 0, 0], [0, 0, Math.PI / 2]),
          place(new THREE.BoxGeometry(0.008, B.crankR, 0.012), [0.05, -B.crankR / 2, 0]),
          place(new THREE.BoxGeometry(0.008, B.crankR, 0.012), [-0.05, B.crankR / 2, 0]),
          place(new THREE.BoxGeometry(0.05, 0.012, 0.03), [0.078, -B.crankR, 0]),
          place(new THREE.BoxGeometry(0.05, 0.012, 0.03), [-0.078, B.crankR, 0])
        ]))} m={mat("#2c3038", { rough: 0.5, metal: 0.3 })} />
      </group>
    </group>
  );
}

/** Finger needs skin colour: rendered separately so its material can change. */
export function Finger({ n, skin }: { n: PropNodes; skin: string }) {
  return (
    <group ref={reg(n, "finger")}>
      <M g={geo("finger", () => capsule(0.015, 0.04).translate(0, -0.075, 0.0))} m={mat(skin)} />
    </group>
  );
}

/** Book held at the chest (spine frame) + wash bubbles in front of the hands. */
export function ChestProps({ n }: { n: PropNodes }) {
  return (
    <>
      <group ref={reg(n, "book")} position={[0, 0.15, 0.21]} rotation={[-0.75, 0, 0]}>
        <M g={geo("bookCover", () => merge([
          place(rbox(0.1, 0.008, 0.13, 0.003), [-0.048, 0, 0], [0, 0, 0.2]),
          place(rbox(0.1, 0.008, 0.13, 0.003), [0.048, 0, 0], [0, 0, -0.2])
        ]))} m={mat("#e8576a")} />
        <M g={geo("bookPages", () => merge([
          place(rbox(0.092, 0.012, 0.118, 0.003), [-0.046, 0.008, 0], [0, 0, 0.2]),
          place(rbox(0.092, 0.012, 0.118, 0.003), [0.046, 0.008, 0], [0, 0, -0.2])
        ]))} m={mat("#fbf7ee")} shadow={false} />
      </group>
      {/* laptop on the lap / desk under the typing hands; Avatar keeps it level */}
      <group ref={reg(n, "laptop")} position={[0, 0.1, 0.19]}>
        <group ref={(g) => { n.laptop = g; }}>
          <M g={geo("laptopBody", () => merge([
            rbox(0.17, 0.012, 0.11, 0.004),
            // the lid, hinged at the far edge and tilted back
            place(rbox(0.17, 0.11, 0.008, 0.004), [0, 0.053, 0.069], [0.25, 0, 0])
          ]))} m={mat("#9aa3ad", { rough: 0.35, metal: 0.5 })} />
          <M g={geo("laptopKeys", () => place(new THREE.BoxGeometry(0.14, 0.002, 0.05), [0, 0.007, -0.012]))} m={mat("#2c3038", { rough: 0.6 })} shadow={false} />
          <M g={geo("laptopScreen", () => place(new THREE.PlaneGeometry(0.15, 0.09), [0, 0.054, 0.064], [0.25 + Math.PI, 0, 0]))}
            m={mat("#bfe6ff", { rough: 0.2 })} shadow={false} />
        </group>
      </group>
      <group ref={reg(n, "bubbles")} position={[0, 0.1, 0.2]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={geo("bubble", () => sphere(0.022, 12, 8))} material={mat("#e6f6ff", { rough: 0.1, opacity: 0.75 })}
            ref={(o) => { if (o) n.bubbles[i] = o; }} />
        ))}
      </group>
    </>
  );
}

/** Things in the avatar's root frame (bike, basket on the ground, water drops, sleep z's). */
export function RootProps({ n }: { n: PropNodes }) {
  return (
    <>
      <Bike n={n} />
      {/* on the ground at the right side while digging (handle top 0.15 above the floor) */}
      <group ref={reg(n, "basketGround")} position={[-0.3, 0.15, 0.14]} rotation={[0, 0.5, 0]}>
        <Basket />
      </group>
      <group>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={geo("drop", () => sphere(0.011, 8, 6).scale(1, 1.5, 1))} material={mat("#6ec3ff", { rough: 0.2, opacity: 0.85 })}
            visible={false} ref={(o) => { if (o) n.drops[i] = o; }} />
        ))}
      </group>
      <group ref={reg(n, "zzz")}>
        {[0, 1].map((i) => (
          <sprite key={i} material={zzzMaterial()} scale={0.09 + i * 0.04} ref={(o) => { if (o) n.zs[i] = o; }} />
        ))}
      </group>
    </>
  );
}
