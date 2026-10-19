"use client";

/**
 * A chibi villager built from code: a rig of groups (hips → spine → head,
 * shoulders → elbows → hands, thighs → knees → feet) covered in rounded,
 * cached primitives. `pose()` is read every frame inside useFrame — no React
 * state per frame. Feet at the origin, facing +Z, ~1.05 tall at scale 1.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { colorHex, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES, type Appearance } from "@aivillage/shared";
import { bodyShape, headShape } from "./features";
import type { AvatarPose } from "./types";
import { LIMB, PoseBlender, bikeCrank, bikeWheel, chopLift, faceFor, hipHeight, kernelVisible, propFor, seatLift, type Rig } from "./pose";
import {
  FOREARM, G, HEAD_Y, NECK_Y, SHOULDER_Y, UPPER_ARM, acquireFace, beardGeometry, beardMaterial, blankFace, faceGeometry, headGeometry, mat,
  moustacheGeometry, releaseFace, stubbleMaterial, torsoGeometry
} from "./assets";
import { Accessory, Hair, M, Stripe, TorsoDetails, outfitLook } from "./Look";
import { ChestProps, Finger, ForearmProps, HandProps, LeftHandProps, RootProps, newPropNodes, nodeShown, type PropNodeKey } from "./Props";

interface Nodes {
  root: THREE.Group | null;
  body: THREE.Group | null;
  spine: THREE.Group | null;
  head: THREE.Group | null;
  headTop: THREE.Group | null;
  skirt: THREE.Group | null;
  face: THREE.Mesh | null;
  sh: [THREE.Group | null, THREE.Group | null];
  el: [THREE.Group | null, THREE.Group | null];
  ha: [THREE.Group | null, THREE.Group | null];
  th: [THREE.Group | null, THREE.Group | null];
  kn: [THREE.Group | null, THREE.Group | null];
  ft: [THREE.Group | null, THREE.Group | null];
  tails: (THREE.Group | null)[];
}

const newNodes = (): Nodes => ({
  root: null, body: null, spine: null, head: null, headTop: null, skirt: null, face: null,
  sh: [null, null], el: [null, null], ha: [null, null], th: [null, null], kn: [null, null], ft: [null, null], tails: []
});

/** index 0 = left (+X), 1 = right (−X) */
const SIDES = [1, -1] as const;

function applyRig(n: Nodes, r: Rig) {
  n.body?.position.set(0, hipHeight(r), r.z);
  n.body?.rotation.set(r.bx, r.by, r.bz);
  n.spine?.rotation.set(r.sx, r.sy, r.sz);
  n.head?.rotation.set(r.hx, r.hy, r.hz);
  n.sh[0]?.rotation.set(-r.lsf, r.lst, r.lso);
  n.sh[1]?.rotation.set(-r.rsf, -r.rst, -r.rso);
  n.el[0]?.rotation.set(-r.le, 0, r.lez);
  n.el[1]?.rotation.set(-r.re, 0, -r.rez);
  if (n.ha[0]) n.ha[0].rotation.x = -r.lw;
  if (n.ha[1]) n.ha[1].rotation.x = -r.rw;
  n.th[0]?.rotation.set(-r.ltf, 0, r.lto);
  n.th[1]?.rotation.set(-r.rtf, 0, -r.rto);
  if (n.kn[0]) n.kn[0].rotation.x = r.lk;
  if (n.kn[1]) n.kn[1].rotation.x = r.rk;
  // keep soles parallel to the hips' floor
  if (n.ft[0]) n.ft[0].rotation.x = r.ltf - r.lk;
  if (n.ft[1]) n.ft[1].rotation.x = r.rtf - r.rk;
}

const qRoot = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const qWant = new THREE.Quaternion();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
/** the wooden spoon points down and forward, into the pan */
const INTO_PAN = new THREE.Vector3(0, -1, 0.45).normalize();
const eTmp = new THREE.Euler();

/** Orient `obj` so it has rotation `want` relative to the avatar root (e.g. upright cup). */
function orientInRoot(obj: THREE.Object3D, root: THREE.Object3D, want: THREE.Quaternion) {
  if (!obj.parent) return;
  root.getWorldQuaternion(qRoot);
  obj.parent.getWorldQuaternion(qParent);
  obj.quaternion.copy(qParent.invert()).multiply(qRoot).multiply(want);
}

export function Avatar({ appearance, pose, scale = 1 }: { appearance: Appearance; pose: () => AvatarPose; scale?: number }) {
  const a = appearance;
  const body = bodyShape(a);
  const head = headShape(a.faceShape);
  const skin = colorHex(SKIN_TONES, a.skin);
  const hairHex = colorHex(HAIR_COLORS, a.hairColor);
  const outfitHex = colorHex(OUTFIT_COLORS, a.outfitColor);
  const look = outfitLook(a.outfit, outfitHex);
  const beard = beardGeometry(a.facialHair, a.faceShape);
  const moustache = moustacheGeometry(a.facialHair, a.faceShape);

  const n = useMemo(newNodes, []);
  const props = useMemo(newPropNodes, []);
  const blender = useMemo(() => new PoseBlender(Math.random()), []);
  const live = useRef({
    blinkAt: 1.5 + Math.random() * 3, faceKey: "", held: "", eyes: "", mouth: "", prop: "?" as string | null, dish: "", seed: Math.random() * 10
  });
  // let go of the shared face texture when this avatar goes away
  useEffect(() => () => {
    if (live.current.held) releaseFace(live.current.held);
    live.current.held = "";
  }, []);

  // a re-render may remount parts: re-apply face + prop visibility next frame
  live.current.faceKey = "";
  live.current.prop = "?";
  live.current.dish = "";

  const skinM = mat(skin);
  const topM = mat(look.top);
  const pantsM = mat(look.pants);
  const armM = look.sleeves === "long" ? topM : skinM;
  const legM = look.legs === "pants" ? pantsM : skinM;
  const pelvisM = look.skirt ? mat(look.skirt.color) : look.legs === "skin" ? topM : pantsM;
  const shoeM = mat(look.shoes, { rough: 0.6 });

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const p = pose();
    const r = blender.update(p, dt);
    applyRig(n, r);
    const L = live.current;
    const time = state.clock.elapsedTime + L.seed;

    // face: anim expression + blinking
    const f = faceFor(p);
    let eyes = f.eyes;
    if (eyes === "base" && time > L.blinkAt) {
      if (time > L.blinkAt + 0.13) L.blinkAt = time + 2.2 + Math.random() * 3.2;
      else eyes = "closed";
    }
    if ((eyes !== L.eyes || f.mouth !== L.mouth || !L.faceKey) && n.face) {
      L.eyes = eyes;
      L.mouth = f.mouth;
      const got = acquireFace(a, eyes, f.mouth);
      if (L.held) releaseFace(L.held);
      L.held = L.faceKey = got.key;
      n.face.material = got.material;
    }

    // seated: keep the hips on the seat whatever the body's height
    if (n.root) n.root.position.y = seatLift(r, p.anim, scale, body.scale);

    // hair tails sway
    n.tails.forEach((g, i) => {
      if (!g) return;
      const base = g.userData.base as [number, number, number];
      g.rotation.x = base[0] + 0.08 * Math.sin(time * 2.1 + i) + (p.walking ? 0.12 * p.speed : 0) - r.hx * 0.5;
      g.rotation.z = base[2] + 0.07 * Math.sin(time * 1.6 + i * 1.7) - r.hz * 0.4;
    });

    // skirt spreads over the thighs when they come forward (sitting)
    if (n.skirt) {
      const sit = Math.max(0, Math.min(1, (r.ltf + r.rtf) / 3));
      n.skirt.scale.set(1, 1 - 0.4 * sit, 1 + 0.1 * sit);
      n.skirt.position.set(0, 0.02 * sit, 0.03 * sit);
      n.skirt.rotation.x = -0.8 * sit;
    }

    // props (a held item overrides the anim's own prop; the basket waits on the ground while digging)
    const prop = propFor(p);
    const shown: PropNodeKey | null = prop === "basket" && p.anim === "dig" && !p.walking ? "basketGround" : prop;
    if (shown !== L.prop) {
      for (const [id, g] of Object.entries(props.groups)) if (g) g.visible = nodeShown(id, shown);
      for (const d of props.drops) d.visible = shown === "can";
      if (props.kernel) props.kernel.visible = false;
      L.prop = shown;
    }
    const root = n.root;
    if (!root || !prop) return;
    const lift = Math.max(0, Math.min(1, (r.re - 1.3) / 1.0));
    if (prop === "cup" && props.cup) {
      orientInRoot(props.cup, root, qWant.setFromEuler(eTmp.set(-0.75 * lift, 0, 0)));
    } else if (prop === "juice" && props.juice) {
      orientInRoot(props.juice, root, qWant.setFromEuler(eTmp.set(-0.6 * lift, 0, 0)));
    } else if (prop === "plate" || prop === "dish") {
      const plate = prop === "dish" ? props.dish : props.plate;
      if (plate) orientInRoot(plate, root, qWant.setFromEuler(eTmp.set(0.05, 0, 0)));
      if (prop === "dish") {
        // tell the hand which dish it holds (only when it changes)
        const look = p.dish ?? "plate";
        if (look !== L.dish && props.setDish) {
          L.dish = look;
          props.setDish(look);
        }
        // a drink is a glass: no fork
        if (props.groups.fork) props.groups.fork.visible = look !== "drink";
      }
      // fork: tines toward the plate at rest, toward the mouth when the hand comes up
      if (props.fork) orientInRoot(props.fork, root, qWant.setFromEuler(eTmp.set(0.9 - 2.1 * lift, 0, 0.25 - 0.25 * lift)));
    } else if (prop === "popcorn") {
      if (props.tub) orientInRoot(props.tub, root, qWant.setFromEuler(eTmp.set(0.12, 0, 0)));
      if (props.kernel) props.kernel.visible = p.anim === "watch" && kernelVisible(p.animTime);
    } else if (prop === "basket" && props.basket && shown === "basket") {
      orientInRoot(props.basket, root, qWant.setFromEuler(eTmp.set(p.walking ? 0.07 * Math.sin(p.walkPhase) : 0, 0, 0)));
    } else if (prop === "bike") {
      const w = bikeWheel(p);
      if (props.wheels[0]) props.wheels[0].rotation.x = w;
      if (props.wheels[1]) props.wheels[1].rotation.x = w;
      if (props.crank) props.crank.rotation.x = bikeCrank(p);
    } else if (prop === "knife" && props.knife) {
      // blade level over the board, tip up as the hand lifts
      orientInRoot(props.knife, root, qWant.setFromEuler(eTmp.set(0.12 - 0.55 * chopLift(p.animTime), 0, 0)));
    } else if (prop === "spatula" && props.spatula) {
      orientInRoot(props.spatula, root, qWant.setFromUnitVectors(DOWN, INTO_PAN));
    } else if (prop === "laptop" && props.laptop) {
      orientInRoot(props.laptop, root, qWant.identity());
    } else if (prop === "phone" && props.phone) {
      orientInRoot(props.phone, root, qWant.setFromEuler(eTmp.set(-0.15, 0, 0.12)));
    } else if (prop === "can" && props.can) {
      const tilt = 0.55 + 0.2 * Math.sin(time * 1.6);
      orientInRoot(props.can, root, qWant.setFromEuler(eTmp.set(tilt, 0, 0)));
      root.worldToLocal(props.can.localToWorld(vA.set(0, -0.02, 0.13)));
      props.drops.forEach((d, i) => {
        const ph = (time * 1.7 + i / 3) % 1;
        d.position.set(vA.x, vA.y - ph * 0.3, vA.z + ph * 0.06);
        d.scale.setScalar(1 - ph * 0.4);
      });
    } else if (prop === "broom" && props.broom) {
      root.worldToLocal(props.broom.getWorldPosition(vA));
      vB.set(Math.sin(r.sy) * 0.3 - 0.06, 0.03, 0.24 + Math.cos(r.sy) * 0.02).sub(vA).normalize();
      orientInRoot(props.broom, root, qWant.setFromUnitVectors(DOWN, vB));
    } else if (prop === "bubbles") {
      props.bubbles.forEach((b, i) => {
        const ph = (time * 0.55 + i / 4) % 1;
        b.position.set(Math.sin(i * 2.3 + time * 1.3) * 0.06, ph * 0.22, 0.015 * i);
        b.scale.setScalar(0.5 + 0.7 * Math.sin(Math.PI * ph));
      });
    } else if (prop === "zzz" && n.headTop) {
      root.worldToLocal(n.headTop.getWorldPosition(vA));
      props.zs.forEach((z, i) => {
        const ph = (time * 0.45 + i * 0.5) % 1;
        z.position.set(vA.x + 0.1 + ph * 0.12, vA.y + 0.14 + ph * 0.28, vA.z);
        z.scale.setScalar((0.07 + i * 0.03) * Math.sin(Math.PI * ph) + 0.01);
      });
    }
  });

  const registerTail = (i: number, g: THREE.Group | null) => {
    n.tails[i] = g;
  };

  return (
    <group ref={(g) => { n.root = g; }} scale={scale * body.scale}>
      <group ref={(g) => { n.body = g; }} position={[0, LIMB.restHip, 0]}>
        <M g={G.pelvis()} m={pelvisM} position={[0, -0.02, 0]} scale={[body.pelvisX, 1, body.pelvisZ]} />
        {look.skirt && (
          <group ref={(g) => { n.skirt = g; }}>
            <M
              g={G.skirt(look.skirt.len, look.skirt.flare)}
              m={mat(look.skirt.color, { side: THREE.DoubleSide })}
              scale={[Math.max(body.pelvisX, body.hem / 0.118), 1, Math.max(body.pelvisZ, body.depth)]}
            />
          </group>
        )}

        <group ref={(g) => { n.spine = g; }}>
          <M g={torsoGeometry(body)} m={topM} />
          <TorsoDetails outfit={a.outfit} color={outfitHex} body={body} />
          <ChestProps n={props} />

          <group ref={(g) => { n.head = g; }} position={[0, NECK_Y, 0]} scale={body.headScale}>
            <group position={[0, HEAD_Y, 0]} scale={[head.sx, head.sy, head.sz]}>
              <M g={headGeometry(a.faceShape)} m={skinM} />
              <M g={G.ear()} m={skinM} position={[0.212, -0.02, 0.0]} scale={[0.55, 1, 0.85]} />
              <M g={G.ear()} m={skinM} position={[-0.212, -0.02, 0.0]} scale={[0.55, 1, 0.85]} />
              <mesh ref={(m) => { n.face = m; }} geometry={faceGeometry(a.faceShape)} material={blankFace()} renderOrder={2} />
              {beard && a.facialHair === "stubble" && (
                <mesh geometry={beard} material={stubbleMaterial(hairHex)} renderOrder={3} />
              )}
              {beard && a.facialHair !== "stubble" && <M g={beard} m={beardMaterial(hairHex)} />}
              {moustache && <M g={moustache} m={mat(hairHex, { rough: 0.85 })} shadow={false} />}
              <Hair style={a.hair} color={hairHex} registerTail={registerTail} />
              <Accessory kind={a.accessory} hair={a.hair} outfitColor={outfitHex} />
              <group ref={(g) => { n.headTop = g; }} position={[0, 0.2, 0]} />
            </group>
          </group>

          {SIDES.map((side, i) => (
            <group key={side} ref={(g) => { n.sh[i] = g; }} position={[side * body.shoulderX, SHOULDER_Y, 0]}>
              <M g={G.upperArm()} m={armM} scale={[body.arm, 1, body.arm]} />
              {look.sleeves === "short" && <M g={G.shortSleeve()} m={topM} scale={[body.arm, 1, body.arm]} />}
              {look.sleeves === "puff" && <M g={G.puffSleeve()} m={topM} scale={[body.arm, 1, body.arm]} />}
              <Stripe outfit={a.outfit} side={side} len={0.1} x={0.035 * body.arm} y={-0.06} />
              <group ref={(g) => { n.el[i] = g; }} position={[0, -UPPER_ARM, 0]}>
                <M g={G.forearm()} m={armM} scale={[body.arm, 1, body.arm]} />
                {side === 1 && <ForearmProps n={props} />}
                <Stripe outfit={a.outfit} side={side} len={0.08} x={0.031 * body.arm} y={-0.045} />
                <group ref={(g) => { n.ha[i] = g; }} position={[0, -FOREARM, 0]}>
                  <M g={G.hand()} m={skinM} scale={body.hand} />
                  {side === -1 && (
                    <>
                      <HandProps n={props} />
                      <Finger n={props} skin={skin} />
                    </>
                  )}
                  {side === 1 && <LeftHandProps n={props} />}
                </group>
              </group>
            </group>
          ))}
        </group>

        {SIDES.map((side, i) => (
          <group key={side} ref={(g) => { n.th[i] = g; }} position={[side * body.hipX, -LIMB.hipDrop, 0]}>
            <M g={G.thigh()} m={legM} scale={[body.leg, 1, body.leg]} />
            {look.legs === "shorts" && <M g={G.shorts()} m={pantsM} scale={[body.leg, 1, body.leg]} />}
            <Stripe outfit={a.outfit} side={side} len={0.13} x={0.05 * body.leg} y={-0.07} />
            <group ref={(g) => { n.kn[i] = g; }} position={[0, -LIMB.thigh, 0]}>
              <M g={G.shin()} m={legM} scale={[0.5 + 0.5 * body.leg, 1, 0.5 + 0.5 * body.leg]} />
              <Stripe outfit={a.outfit} side={side} len={0.1} x={0.043 * (0.5 + 0.5 * body.leg)} y={-0.065} />
              <group ref={(g) => { n.ft[i] = g; }} position={[0, -LIMB.shin, 0]}>
                <M g={G.shoe()} m={shoeM} scale={[body.foot, 1, body.foot]} />
              </group>
            </group>
          </group>
        ))}
      </group>
      <RootProps n={props} />
    </group>
  );
}
