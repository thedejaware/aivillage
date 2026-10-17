"use client";

/**
 * Hand-held props (cup, phone, broom, watering can, apple, book) and small
 * effects (bubbles, water drops, sleep "z"). They are always mounted but
 * hidden; Avatar.tsx shows the one the current anim needs and orients it.
 */
import * as THREE from "three";
import type { PropId } from "./pose";
import { geo, mat, merge, place, sphere, capsule, rbox, zzzMaterial } from "./assets";
import { M } from "./Look";

export interface PropNodes {
  groups: Partial<Record<PropId, THREE.Object3D>>;
  /** inner nodes that Avatar re-orients each frame (upright in the avatar's frame) */
  cup: THREE.Group | null;
  phone: THREE.Group | null;
  can: THREE.Group | null;
  broom: THREE.Group | null;
  bubbles: THREE.Object3D[];
  drops: THREE.Object3D[];
  zs: THREE.Sprite[];
}

export const newPropNodes = (): PropNodes => ({ groups: {}, cup: null, phone: null, can: null, broom: null, bubbles: [], drops: [], zs: [] });

const reg = (n: PropNodes, id: PropId) => (o: THREE.Object3D | null) => {
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
    </>
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
      <group ref={reg(n, "bubbles")} position={[0, 0.1, 0.2]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={geo("bubble", () => sphere(0.022, 12, 8))} material={mat("#e6f6ff", { rough: 0.1, opacity: 0.75 })}
            ref={(o) => { if (o) n.bubbles[i] = o; }} />
        ))}
      </group>
    </>
  );
}

/** Effects in the avatar's root frame (water drops, sleep z's). */
export function RootProps({ n }: { n: PropNodes }) {
  return (
    <>
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
