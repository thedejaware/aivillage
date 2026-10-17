"use client";

/**
 * Appearance pieces: outfit colours/details, hair and accessories. All meshes
 * use cached geometries/materials from assets.ts; nothing here animates on
 * its own (Avatar.tsx drives the rig), except the hair tails it registers.
 */
import * as THREE from "three";
import {
  geo, mat, merge, place, sphere, capsule, rbox, shade, lightness, hairGeometry, hatFit,
  facePoint, EYE_X, EYE_Y
} from "./assets";
import { baseTorsoRadiusAt, torsoRadiusAt, type BodyShape } from "./features";

/** A shadow-casting mesh with shared geometry + material. */
export function M({
  g, m, position, rotation, scale, shadow = true
}: {
  g: THREE.BufferGeometry;
  m: THREE.Material;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  shadow?: boolean;
}) {
  return <mesh geometry={g} material={m} position={position} rotation={rotation} scale={scale} castShadow={shadow} />;
}

// ---------------- outfits ----------------

export interface OutfitLook {
  top: string;
  sleeves: "short" | "long" | "puff";
  legs: "pants" | "shorts" | "skin";
  pants: string;
  skirt: { len: number; flare: number; color: string } | null;
  shoes: string;
}

const JEANS = "#3f63a3";
const SNEAKER = "#f4f5f8";

export function outfitLook(outfit: string, color: string): OutfitLook {
  const dark = lightness(color) < 0.3;
  switch (outfit) {
    case "hoodie":
      return { top: color, sleeves: "long", legs: "pants", pants: dark ? "#8a93a6" : "#4a5263", skirt: null, shoes: SNEAKER };
    case "sweater_skirt":
      return { top: color, sleeves: "long", legs: "skin", pants: color, skirt: { len: 0.115, flare: 0.06, color: lightness(color) < 0.5 ? "#d9c7a4" : "#3b4254" }, shoes: "#3a2b2b" };
    case "dress":
      return { top: color, sleeves: "puff", legs: "skin", pants: color, skirt: { len: 0.165, flare: 0.09, color }, shoes: "#3a2b2b" };
    case "suit":
      return { top: color, sleeves: "long", legs: "pants", pants: dark ? "#1d2029" : "#2b2f3a", skirt: null, shoes: "#1d2029" };
    case "overalls":
      return { top: lightness(color) > 0.85 ? "#ffd9e0" : "#f6f6f2", sleeves: "short", legs: "pants", pants: color, skirt: null, shoes: "#7a5234" };
    case "tracksuit":
      return { top: color, sleeves: "long", legs: "pants", pants: color, skirt: null, shoes: SNEAKER };
    case "shirt_shorts":
      return { top: color, sleeves: "short", legs: "shorts", pants: "#cdb68e", skirt: null, shoes: "#a0673f" };
    default: // tshirt_jeans
      return { top: color, sleeves: "short", legs: "pants", pants: JEANS, skirt: null, shoes: SNEAKER };
  }
}

/** Details fixed to the chest (spine frame), refitted to the body's torso. */
export function TorsoDetails({ outfit, color, body }: { outfit: string; color: string; body: BodyShape }) {
  return <Details outfit={outfit} color={color} body={body} />;
}

/** Scale a detail sitting at height y so it follows this body's torso width there. */
function Fit({ body, y, children }: { body: BodyShape; y: number; children: React.ReactNode }) {
  const kx = torsoRadiusAt(body, y) / baseTorsoRadiusAt(y);
  return <group scale={[kx, 1, body.depth]}>{children}</group>;
}

function Details({ outfit, color, body }: { outfit: string; color: string; body: BodyShape }) {
  const look = outfitLook(outfit, color);
  const top = look.top;
  const f = (y: number, el: React.ReactElement) => <Fit body={body} y={y}>{el}</Fit>;
  switch (outfit) {
    case "tshirt_jeans":
      return f(0.27, <M g={geo("neckRing", () => new THREE.TorusGeometry(0.058, 0.012, 8, 20))} m={mat(shade(top, -0.1))} position={[0, 0.278, 0]} rotation={[Math.PI / 2, 0, 0]} />);
    case "hoodie":
      return (
        <>
          {f(0.25, <M g={geo("hood", () => sphere(0.1, 18, 12).scale(1.5, 0.72, 0.9))} m={mat(shade(top, -0.07))} position={[0, 0.25, -0.07]} />)}
          {f(0.065, <M g={geo("pocket", () => rbox(0.16, 0.07, 0.03, 0.012))} m={mat(shade(top, -0.09))} position={[0, 0.065, 0.093]} rotation={[0.05, 0, 0]} />)}
          {f(0.215, <M g={geo("strings", () => merge([place(capsule(0.007, 0.055), [0.028, 0, 0]), place(capsule(0.007, 0.055), [-0.028, 0, 0])]))} m={mat("#ffffff")} position={[0, 0.215, 0.088]} rotation={[0.25, 0, 0]} />)}
        </>
      );
    case "sweater_skirt":
      return (
        <>
          {f(0.27, <M g={geo("rollNeck", () => new THREE.TorusGeometry(0.06, 0.022, 8, 20))} m={mat(shade(top, 0.07))} position={[0, 0.275, 0]} rotation={[Math.PI / 2, 0, 0]} />)}
          {f(0.11, <M g={geo("knitBand", () => new THREE.TorusGeometry(0.129, 0.011, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 0.79))} m={mat(shade(top, 0.12))} position={[0, 0.11, 0]} />)}
        </>
      );
    case "dress":
      return (
        <>
          {f(0.03, <M g={geo("waistband", () => new THREE.TorusGeometry(0.122, 0.013, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 0.8))} m={mat("#ffffff")} position={[0, 0.03, 0]} />)}
          {f(0.27, <M g={geo("neckRing", () => new THREE.TorusGeometry(0.058, 0.012, 8, 20))} m={mat("#ffffff")} position={[0, 0.278, 0]} rotation={[Math.PI / 2, 0, 0]} />)}
        </>
      );
    case "suit": {
      const tie = lightness(top) < 0.3 || top === "#d9534f" ? "#d9534f" : "#1f3c88";
      const tieUse = top === "#d9534f" ? "#1f3c88" : tie;
      return (
        <>
          {f(0.215, <M g={geo("shirtV", () => sphere(0.07, 14, 10).scale(0.9, 1.35, 0.35))} m={mat("#ffffff")} position={[0, 0.215, 0.085]} rotation={[-0.35, 0, 0]} />)}
          {f(0.2, <M g={geo("tie", () => merge([place(rbox(0.032, 0.12, 0.012, 0.005), [0, -0.06, 0]), place(sphere(0.017, 10, 8), [0, 0.0, 0.0], [0, 0, 0], [1.1, 0.9, 0.7])]))} m={mat(tieUse)} position={[0, 0.258, 0.09]} rotation={[-0.22, 0, 0]} />)}
          {f(0.2, <M g={geo("lapels", () => merge([
            place(rbox(0.03, 0.12, 0.01, 0.004), [0.042, 0.0, 0], [0, 0, 0.42]),
            place(rbox(0.03, 0.12, 0.01, 0.004), [-0.042, 0.0, 0], [0, 0, -0.42])
          ]))} m={mat(shade(top, -0.1))} position={[0, 0.2, 0.093]} rotation={[-0.3, 0, 0]} />)}
          {f(0.07, <M g={geo("suitButtons", () => merge([place(sphere(0.011, 8, 6), [0, 0.095, 0.101]), place(sphere(0.011, 8, 6), [0, 0.045, 0.1])]))} m={mat(shade(top, -0.2))} />)}
        </>
      );
    }
    case "overalls":
      return (
        <>
          {f(0.075, <M g={geo("bib", () => rbox(0.15, 0.12, 0.03, 0.012))} m={mat(color)} position={[0, 0.075, 0.09]} rotation={[0.04, 0, 0]} />)}
          {f(0.0, <M g={geo("overallWaist", () => new THREE.CylinderGeometry(0.126, 0.118, 0.07, 28).scale(1, 1, 0.8))} m={mat(color)} position={[0, 0.0, 0]} />)}
          {f(0.22, <M g={geo("straps", () => merge([0.056, -0.056].flatMap((x) => [
            place(rbox(0.03, 0.13, 0.014, 0.005), [x, 0.19, 0.098], [-0.28, 0, 0]),
            place(rbox(0.03, 0.12, 0.014, 0.005), [x, 0.272, 0.05], [-1.05, 0, 0])
          ])))} m={mat(color)} />)}
          {f(0.125, <M g={geo("bibButtons", () => merge([place(sphere(0.014, 8, 6), [0.055, 0.125, 0.105]), place(sphere(0.014, 8, 6), [-0.055, 0.125, 0.105])]))} m={mat("#f2c14e", { rough: 0.4, metal: 0.3 })} />)}
        </>
      );
    case "tracksuit":
      return (
        <>
          {f(0.14, <M g={geo("zip", () => rbox(0.012, 0.2, 0.012, 0.004))} m={mat("#ffffff")} position={[0, 0.14, 0.1]} rotation={[-0.08, 0, 0]} />)}
          {f(0.27, <M g={geo("trackCollar", () => new THREE.CylinderGeometry(0.07, 0.085, 0.045, 18, 1, true))} m={mat(shade(top, -0.06), { side: THREE.DoubleSide })} position={[0, 0.285, 0]} />)}
        </>
      );
    case "shirt_shorts": {
      const collar = shade(top, lightness(top) > 0.8 ? -0.12 : 0.18);
      return (
        <>
          {f(0.27, <M g={geo("collar", () => merge([
            place(rbox(0.06, 0.022, 0.05, 0.008), [0.032, 0, 0], [0.3, 0.3, -0.45]),
            place(rbox(0.06, 0.022, 0.05, 0.008), [-0.032, 0, 0], [0.3, -0.3, 0.45])
          ]))} m={mat(collar)} position={[0, 0.272, 0.045]} />)}
          {f(0.15, <M g={geo("shirtButtons", () => merge([0.21, 0.155, 0.1].map((y) => place(sphere(0.01, 8, 6), [0, y, y > 0.2 ? 0.094 : 0.1]))))} m={mat(collar)} />)}
        </>
      );
    }
    default:
      return null;
  }
}

/** Side stripes for the tracksuit (left/right outer side of a limb segment). */
export function Stripe({ outfit, side, len, x, y }: { outfit: string; side: 1 | -1; len: number; x: number; y: number }) {
  if (outfit !== "tracksuit") return null;
  return <M g={geo(`stripe|${len}`, () => rbox(0.012, len, 0.022, 0.005))} m={mat("#ffffff")} position={[side * x, y, 0]} shadow={false} />;
}

// ---------------- hair ----------------

export function Hair({
  style, color, registerTail
}: {
  style: string;
  color: string;
  registerTail: (i: number, g: THREE.Group | null) => void;
}) {
  const build = hairGeometry(style);
  const m = mat(color, { rough: 0.78, side: THREE.DoubleSide });
  return (
    <>
      {build.main && <M g={build.main} m={m} />}
      {build.tails.map((t, i) => (
        <group key={i} position={t.pos} rotation={t.rot} ref={(g) => registerTail(i, g)} userData={{ base: t.rot }}>
          <M g={t.geo} m={m} />
        </group>
      ))}
    </>
  );
}

// ---------------- accessories ----------------

function lensFrame(kind: string) {
  return geo(`frames|${kind}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const [x, y, z] = facePoint(256 + side * EYE_X, EYE_Y, 0.018);
      const ring =
        kind === "round"
          ? new THREE.TorusGeometry(0.047, 0.0075, 8, 24)
          : new THREE.TorusGeometry(kind === "sun" ? 0.07 : 0.064, kind === "sun" ? 0.011 : 0.01, 6, 4).rotateZ(Math.PI / 4).scale(1.0, 0.8, 1);
      parts.push(place(ring, [x, y, z], [0, side * 0.3, 0]));
      // temple arm back toward the ear
      parts.push(place(capsule(0.0055, 0.1).rotateX(Math.PI / 2), [side * 0.155, y + 0.008, 0.18], [0, -side * 0.62, 0]));
    }
    const [, by, bz] = facePoint(256, EYE_Y - 8, 0.022);
    parts.push(place(capsule(0.006, 0.05), [0, by, bz], [0, 0, Math.PI / 2]));
    return merge(parts);
  });
}

function lenses(kind: string) {
  return geo(`lenses|${kind}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const [x, y, z] = facePoint(256 + side * EYE_X, EYE_Y, 0.016);
      const disc = new THREE.CylinderGeometry(1, 1, 0.004, kind === "round" ? 24 : 4, 1).rotateX(Math.PI / 2);
      if (kind === "round") disc.scale(0.045, 0.045, 1);
      else {
        disc.rotateZ(Math.PI / 4);
        disc.scale(kind === "sun" ? 0.07 : 0.064, kind === "sun" ? 0.056 : 0.051, 1);
      }
      parts.push(place(disc, [x, y, z], [0, side * 0.3, 0]));
    }
    return merge(parts);
  });
}

export function Accessory({ kind, hair, outfitColor }: { kind: string; hair: string; outfitColor: string }) {
  const fit = hatFit(hair);
  const fitProps = { position: [0, fit.dy, fit.dz] as [number, number, number], scale: fit.s };
  switch (kind) {
    case "round_glasses":
      return (
        <>
          <M g={lensFrame("round")} m={mat("#2b2f3a", { rough: 0.4 })} shadow={false} />
          <M g={lenses("round")} m={mat("#cfe6ff", { rough: 0.1, opacity: 0.3 })} shadow={false} />
        </>
      );
    case "square_glasses":
      return (
        <>
          <M g={lensFrame("square")} m={mat("#7a4a2c", { rough: 0.45 })} shadow={false} />
          <M g={lenses("square")} m={mat("#cfe6ff", { rough: 0.1, opacity: 0.3 })} shadow={false} />
        </>
      );
    case "sunglasses":
      return (
        <>
          <M g={lensFrame("sun")} m={mat("#1b2433", { rough: 0.35 })} shadow={false} />
          <M g={lenses("sun")} m={mat("#1b2433", { rough: 0.15, metal: 0.4 })} shadow={false} />
        </>
      );
    case "cap": {
      const c = outfitColor;
      return (
        <group {...fitProps}>
          <group rotation={[-0.22, 0, 0]} position={[0, 0.045, -0.01]}>
            <M g={geo("capDome", () => merge([
              new THREE.SphereGeometry(0.245, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
              place(sphere(0.02, 8, 6), [0, 0.243, 0])
            ]))} m={mat(c, { side: THREE.DoubleSide })} />
            <M g={geo("capBrim", () => new THREE.CylinderGeometry(0.16, 0.16, 0.014, 24, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.05))} m={mat(shade(c, -0.12))} position={[0, 0.005, 0.15]} rotation={[0.1, 0, 0]} />
          </group>
        </group>
      );
    }
    case "beanie": {
      const c = outfitColor;
      return (
        <group {...fitProps}>
          <group rotation={[-0.3, 0, 0]} position={[0, 0.04, -0.01]}>
            <M g={geo("beanieDome", () => new THREE.SphereGeometry(0.248, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.12, 1))} m={mat(c, { rough: 0.9, side: THREE.DoubleSide })} />
            <M g={geo("beanieCuff", () => new THREE.TorusGeometry(0.247, 0.032, 8, 32).rotateX(Math.PI / 2).scale(1, 1.4, 1))} m={mat(shade(c, -0.08), { rough: 0.9 })} position={[0, 0.02, 0]} />
            <M g={geo("pom", () => sphere(0.055, 12, 10))} m={mat("#ffffff", { rough: 0.95 })} position={[0, 0.29, 0]} />
          </group>
        </group>
      );
    }
    case "headphones":
      return (
        <group {...fitProps}>
          <M g={geo("phBand", () => new THREE.TorusGeometry(0.252, 0.016, 8, 28, Math.PI))} m={mat("#2b2f3a", { rough: 0.5 })} position={[0, 0.0, -0.01]} />
          <M g={geo("phCups", () => merge([
            place(new THREE.CylinderGeometry(0.065, 0.065, 0.045, 18), [0.248, -0.01, -0.01], [0, 0, Math.PI / 2]),
            place(new THREE.CylinderGeometry(0.065, 0.065, 0.045, 18), [-0.248, -0.01, -0.01], [0, 0, Math.PI / 2])
          ]))} m={mat("#2f6bff", { rough: 0.45 })} />
        </group>
      );
    case "flower": {
      const pos: [number, number, number] = [0.165 * fit.s, 0.16 * fit.s + fit.dy, 0.1 + fit.dz * 0.5];
      return (
        <group position={pos} rotation={[-0.55, 0.95, 0]} scale={1.45}>
          <M g={geo("petals", () => merge([0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return place(sphere(0.03, 10, 8), [Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0], [0, 0, a], [1.25, 0.85, 0.45]);
          })))} m={mat("#ff8fa3")} />
          <M g={geo("flowerCenter", () => sphere(0.02, 10, 8))} m={mat("#ffd27a")} position={[0, 0, 0.012]} />
        </group>
      );
    }
    case "earrings":
      return (
        <M g={geo("earrings", () => merge([-1, 1].flatMap((side) => [
          place(new THREE.TorusGeometry(0.022, 0.006, 6, 16), [side * 0.198, -0.105, 0.075], [0, side * 0.55, 0]),
          place(sphere(0.013, 8, 6), [side * 0.2, -0.13, 0.078])
        ])))} m={mat("#f2c14e", { rough: 0.3, metal: 0.5 })} shadow={false} />
      );
    default:
      return null;
  }
}
