"use client";

/**
 * WorldCanvas3D — Three.js renderer for the village (v3 "living world").
 *
 * Antigravity-style ambient life, all client-side (zero LLM cost):
 *  - twins walk along a waypoint road network (no straight-line cutting)
 *  - venue activities: café coffee, bench sitting, lawn picnics, stage moments
 *  - a full day/night lighting cycle (sun ↔ moon, lamps glow at night)
 *  - ambient canned conversations when idle twins bump into each other
 * Real drama still comes from the server (socket "day" frames + caption bar).
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { ZONE_DISPLAY, ZONE_TAGLINE, orderStatus } from "@aivillage/shared";
import type { WorldState, WorldTwinView, WorldStructureView, WorldZone, ProjectType } from "@aivillage/shared";

// ---- grid mapping: tile (col,row) -> world (x,z). One tile = 1 unit. ----
const C0 = -2, C1 = 9;
const CX = 3.5, CZ = 3.5;
const gx = (col: number) => col - CX;
const gz = (row: number) => row - CZ;

const TWIN_HEIGHT = 1.05;
/** If the characters walk sideways/backwards, tune this yaw offset (radians). */
const MODEL_YAW = 0;
/** Walking speed, world units per second. */
const WALK_SPEED = 0.85;
/** Full day/night cycle length. 720s = 12 min. Set 86400 for real time. */
const DAY_CYCLE_SECONDS = 720;

const ZONE_ACCENT: Record<string, number> = {
  plaza: 0x5be0c8, maker_space: 0xffa24b, network_hub: 0x3ddc97, event_space: 0xff9a5b
};

const prettyZone = (n: string) => ZONE_DISPLAY[n] ?? n.replace(/_/g, " ").toUpperCase();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hexCss = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ---------------- path network ----------------

interface Pt { x: number; z: number; }

/** Waypoints: the four venues, the plaza, connector bends and a scenic ring. */
const NODES: Record<string, Pt> = {
  C:     { x: -0.5, z: -0.5 }, // THE STAGE (plaza)
  CAFE:  { x: -3.5, z: 1.5 },
  QUIET: { x: 2.5,  z: -3.5 },
  LAWN:  { x: 2.5,  z: 2.5 },
  M1:    { x: -2.0, z: 0.6 },
  M2:    { x: 0.9,  z: -2.0 },
  M3:    { x: 0.9,  z: 1.4 },
  R2:    { x: -0.8, z: 3.0 },
  R3:    { x: 3.4,  z: -0.6 },
  R4:    { x: -1.4, z: -3.0 }
};
const EDGES: [string, string][] = [
  ["C", "M1"], ["M1", "CAFE"],
  ["C", "M2"], ["M2", "QUIET"],
  ["C", "M3"], ["M3", "LAWN"],
  ["CAFE", "R2"], ["R2", "LAWN"],
  ["QUIET", "R3"], ["R3", "LAWN"],
  ["CAFE", "R4"], ["R4", "QUIET"]
];

const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

const NEIGHBORS: Record<string, string[]> = {};
for (const [a, b] of EDGES) {
  (NEIGHBORS[a] ??= []).push(b);
  (NEIGHBORS[b] ??= []).push(a);
}

function nearestNode(p: Pt): string {
  let best = "C", bd = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = dist2(p, n);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/** Dijkstra over the tiny waypoint graph. */
function nodePath(fromId: string, toId: string): string[] {
  if (fromId === toId) return [fromId];
  const distm: Record<string, number> = { [fromId]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set(Object.keys(NODES));
  while (open.size > 0) {
    let cur: string | null = null, cd = Infinity;
    for (const id of open) {
      const d = distm[id];
      if (d !== undefined && d < cd) { cd = d; cur = id; }
    }
    if (!cur) break;
    open.delete(cur);
    if (cur === toId) break;
    for (const nb of NEIGHBORS[cur] ?? []) {
      if (!open.has(nb)) continue;
      const nd = cd + Math.sqrt(dist2(NODES[cur], NODES[nb]));
      if (distm[nb] === undefined || nd < distm[nb]) {
        distm[nb] = nd;
        prev[nb] = cur;
      }
    }
  }
  const out: string[] = [];
  let c: string | undefined = toId;
  while (c) { out.unshift(c); c = prev[c]; }
  return out[0] === fromId ? out : [fromId, toId];
}

/** Route from an arbitrary point to another, walking the roads in between. */
function findRoute(from: Pt, to: Pt): Pt[] {
  if (dist2(from, to) < 2.6) return [to]; // short hops go direct
  const na = nearestNode(from);
  const nb = nearestNode(to);
  const ids = nodePath(na, nb);
  const pts = ids.map((id) => NODES[id]);
  // drop a leading waypoint that would make us walk backwards
  if (pts.length > 1 && dist2(from, pts[1]) < dist2(from, pts[0])) pts.shift();
  const route = [...pts, to];
  // drop a final waypoint that overshoots the destination
  if (route.length > 1 && dist2(route[route.length - 2], to) < 0.09) route.splice(route.length - 2, 1);
  return route;
}

// ---------------- materials & mesh helpers ----------------

const mat = (color: number, opts: { emissive?: number; ei?: number; rough?: number; metal?: number } = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.ei ?? 1,
    roughness: opts.rough ?? 0.85,
    metalness: opts.metal ?? 0.05
  });
const glowMat = (color: number, opacity = 0.35) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function labelDiv(html: string, css: Partial<CSSStyleDeclaration> = {}): HTMLDivElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  Object.assign(el.style, {
    fontFamily: "monospace",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    textAlign: "center",
    ...css
  } as Partial<CSSStyleDeclaration>);
  return el;
}

// ---------------- activities ----------------

type ActivityKind = "coffee" | "bench" | "blanket" | "stage";

interface Spot {
  x: number; z: number;
  zone: string;
  kind: ActivityKind;
  yaw: number;          // facing while doing the activity
  busyBy: string | null;
}

const ACTIVITY_EMOJI: Record<ActivityKind, string[]> = {
  coffee: ["☕", "😋", "☕"],
  bench: ["💭", "😌", "🌙"],
  blanket: ["🌸", "🎶", "😊"],
  stage: ["🎤", "✨", "💃"]
};
const ACTIVITY_DURATION: Record<ActivityKind, [number, number]> = {
  coffee: [10, 18], bench: [9, 16], blanket: [10, 18], stage: [6, 11]
};

/** Sitting pose offsets for the (unrigged) chibi bodies — stylized but readable. */
const SIT_DROP: Record<ActivityKind, number> = { coffee: 0, bench: 0.17, blanket: 0.2, stage: 0 };

// ---------------- ambient conversations (canned — zero LLM cost) ----------------

const AMBIENT_DIALOGS: string[][] = [
  ["Psst — did you hear about {n}?", "No! Tell me everything.", "Not here. Too many ears."],
  ["The café smells amazing today.", "Race you to the counter!"],
  ["I'm plotting something big.", "You always say that.", "This time it's real."],
  ["Nice night up here, isn't it?", "Every night is nice on a floating island."],
  ["{n} has been acting strange lately…", "Strange how?", "Stage-strange. Watch them."],
  ["My owner told me a secret.", "Ooooh. Trade you for mine?"],
  ["I want a bigger house near the lawn.", "Dream big, build bigger."]
];
const TALK_LINE_SECONDS = 2.4;
const TALK_RANGE = 1.35;
const PAIR_COOLDOWN_S = 90;

// ---------------- twin runtime state ----------------

type Mode = "idle" | "walk" | "activity" | "talk";

interface Twin3D {
  id: string;
  root: THREE.Group;
  body: THREE.Group;
  ring: THREE.Mesh;
  mark: CSS2DObject;        // 💬 while its line is on the TV caption bar
  bubbleEl: HTMLDivElement; // ambient speech bubble
  cup: THREE.Group;         // coffee prop
  mode: Mode;
  route: Pt[];
  /** what to do when the current route completes */
  onArrive: { spot: Spot } | null;
  activity: { spot: Spot; until: number; emojiAt: number } | null;
  talk: { partnerId: string; lines: string[]; mine: boolean[]; idx: number; nextAt: number } | null;
  // owner order: the twin walks there, stays, and shows its status
  order: WorldTwinView["order"];
  orderKey: string;
  orderArrived: boolean;
  statusEl: HTMLDivElement;
  /** someone was sent to talk to this twin — it waits in place until then */
  heldUntil: number;
  // server-frame staggering
  ax: number; az: number;
  nextTx: number; nextTz: number;
  applyAt: number;
  nextWanderAt: number;
  speedMul: number;
  walkPhase: number;
  phase: number;
  yaw: number;
}

interface Scene3D {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  twins: Map<string, Twin3D>;
  namesById: Map<string, string>;
  structures: Set<string>;
  occupied: Set<string>;
  overflow: Map<string, { count: number; el: HTMLDivElement }>;
  zones: WorldZone[];
  models: THREE.Group[];
  sprays: THREE.Mesh[];
  spots: Spot[];
  glow: { m: THREE.MeshStandardMaterial; base: number }[];
  // day/night rig
  keyLight: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  stars: THREE.Points;
  dayOffset: number;
  // ambient talk bookkeeping
  pairCooldown: Map<string, number>;
  nextTalkScan: number;
  lastT: number;
  myId: { readonly current: string | null };
  speakingId: { readonly current: string | null };
  onOrderArrive: { readonly current: ((twinId: string, status: string) => void) | null };
}

export default function WorldCanvas3D({
  state,
  myTwinId,
  speakingTwinId,
  onOrderArrive
}: {
  state: WorldState;
  myTwinId?: string | null;
  speakingTwinId?: string | null;
  /** fired once when a twin reaches the place its owner sent it */
  onOrderArrive?: (twinId: string, status: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const pending = useRef<WorldState>(state);
  const myIdRef = useRef<string | null>(myTwinId ?? null);
  const speakingRef = useRef<string | null>(speakingTwinId ?? null);

  useEffect(() => { myIdRef.current = myTwinId ?? null; }, [myTwinId]);
  useEffect(() => { speakingRef.current = speakingTwinId ?? null; }, [speakingTwinId]);
  const onArriveRef = useRef(onOrderArrive ?? null);
  useEffect(() => { onArriveRef.current = onOrderArrive ?? null; }, [onOrderArrive]);

  const zoom = (factor: number) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const dir = sc.camera.position.clone().sub(sc.controls.target);
    const d = clamp(dir.length() / factor, 4, 34);
    sc.camera.position.copy(sc.controls.target).addScaledVector(dir.normalize(), d);
  };

  useEffect(() => {
    let destroyed = false;
    let raf = 0;
    const cleanups: Array<() => void> = [];

    (async () => {
      const host = ref.current!;
      const W = () => window.innerWidth;
      const H = () => window.innerHeight;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W(), H());
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const labels = new CSS2DRenderer();
      labels.setSize(W(), H());
      Object.assign(labels.domElement.style, { position: "absolute", top: "0", pointerEvents: "none" } as Partial<CSSStyleDeclaration>);

      host.replaceChildren(renderer.domElement, labels.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05070f);

      const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 200);
      camera.position.set(11, 11.5, 11);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = 1.32;
      controls.minPolarAngle = 0.35;
      controls.minDistance = 4;
      controls.maxDistance = 34;

      // ---- lights (day/night rig) ----
      const hemi = new THREE.HemisphereLight(0x8fb6ff, 0x0a1226, 0.55);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xfff1d6, 1.5);
      key.position.set(8, 14, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -10; key.shadow.camera.right = 10;
      key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
      key.shadow.bias = -0.0004;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x39d0ff, 0.5);
      rim.position.set(-9, 6, -8);
      scene.add(rim);

      // ---- starfield ----
      const stars = (() => {
        const n = 900;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const v = new THREE.Vector3().randomDirection().multiplyScalar(55 + Math.random() * 60);
          pos.set([v.x, Math.abs(v.y) * (Math.random() > 0.25 ? 1 : -0.35), v.z], i * 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe9ff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.8 }));
        scene.add(p);
        return p;
      })();

      buildIsland(scene);
      buildPaths(scene);
      buildZones(scene, pending.current.zones);

      const sc: Scene3D = {
        renderer, labels, scene, camera, controls,
        twins: new Map(), namesById: new Map(), structures: new Set(), occupied: new Set(), overflow: new Map(),
        zones: pending.current.zones, models: [], sprays: [], spots: [], glow: [],
        keyLight: key, hemi, stars,
        dayOffset: (Date.now() / 1000) % DAY_CYCLE_SECONDS,
        pairCooldown: new Map(), nextTalkScan: 0, lastT: 0,
        myId: myIdRef, speakingId: speakingRef, onOrderArrive: onArriveRef
      };
      sceneRef.current = sc;
      buildVenueProps(sc);
      registerGlowMaterials(sc, scene);

      // ---- load the two GLB twins (Higgsfield image_to_3d) ----
      const loader = new GLTFLoader();
      const load = (url: string) =>
        new Promise<THREE.Group>((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej));
      try {
        const [male, female] = await Promise.all([
          load("/models/twin_male.glb"),
          load("/models/twin_female.glb")
        ]);
        if (destroyed) return;
        for (const m of [male, female]) {
          normalizeModel(m, TWIN_HEIGHT);
          m.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = false; }
          });
        }
        sc.models = [male, female];
      } catch {
        sc.models = []; // GLBs missing → capsule fallback keeps the world alive
      }

      reconcile(sc, pending.current);

      const clock = new THREE.Clock();
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const t = clock.getElapsedTime();
        animate(sc, t);
        sc.lastT = t;
        controls.update();
        renderer.render(scene, camera);
        labels.render(scene, camera);
      };
      tick();

      const onResize = () => {
        camera.aspect = W() / H();
        camera.updateProjectionMatrix();
        renderer.setSize(W(), H());
        labels.setSize(W(), H());
      };
      window.addEventListener("resize", onResize);
      cleanups.push(() => window.removeEventListener("resize", onResize));
    })();

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      for (const c of cleanups) c();
      const sc = sceneRef.current;
      sceneRef.current = null;
      if (sc) {
        sc.controls.dispose();
        sc.renderer.dispose();
        sc.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry?.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mm of mats) mm?.dispose();
          }
        });
      }
    };
  }, []);

  useEffect(() => {
    pending.current = state;
    const sc = sceneRef.current;
    if (sc && (sc.models.length > 0 || sc.twins.size > 0)) reconcile(sc, state);
  }, [state]);

  return (
    <>
      <div ref={ref} style={{ position: "fixed", inset: 0 }} />
      <div style={{ position: "fixed", left: 22, bottom: 20, zIndex: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => zoom(1.25)} style={zoomBtn}>+</button>
        <button onClick={() => zoom(1 / 1.25)} style={zoomBtn}>−</button>
        <span style={{ color: "#5e729c", fontSize: 11, fontFamily: "monospace" }}>drag to orbit · scroll to zoom · right-drag to pan</span>
      </div>
    </>
  );
}

const zoomBtn: React.CSSProperties = {
  width: 30, height: 30, background: "#16314f", color: "#9fd9ff", border: "1px solid #2f63a0",
  borderRadius: 6, fontSize: 16, cursor: "pointer", fontFamily: "monospace"
};

// ---------------- world dressing ----------------

function normalizeModel(model: THREE.Group, targetH: number): void {
  const b1 = new THREE.Box3().setFromObject(model);
  const size = b1.getSize(new THREE.Vector3());
  const s = targetH / Math.max(size.y, 0.0001);
  model.scale.setScalar(s);
  model.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(model);
  const c = b2.getCenter(new THREE.Vector3());
  model.position.x -= c.x;
  model.position.z -= c.z;
  model.position.y -= b2.min.y; // feet on the ground
}

function buildIsland(scene: THREE.Scene): void {
  const w = C1 - C0 + 1; // 12 tiles
  const slabH = 0.55;

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(w, slabH, w),
    [mat(0x0d1c3a), mat(0x0a1226), mat(0x10224a, { rough: 0.95 }), mat(0x060a14), mat(0x0d1c3a), mat(0x0a1226)]
  );
  top.position.y = -slabH / 2;
  top.receiveShadow = true;
  scene.add(top);

  const under = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 3.4, 7), mat(0x070d1c, { rough: 1 }));
  under.rotation.x = Math.PI;
  under.rotation.y = 0.4;
  under.position.y = -slabH - 1.7;
  scene.add(under);

  const grid = new THREE.GridHelper(w, w, 0x3a7bd5, 0x3a7bd5);
  (grid.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = 0.13;
  (grid.material as THREE.Material & { opacity: number; transparent: boolean }).transparent = true;
  grid.position.y = 0.004;
  scene.add(grid);

  const rimGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.02, slabH, w + 0.02));
  const rimLine = new THREE.LineSegments(rimGeo, new THREE.LineBasicMaterial({ color: 0x5be0c8, transparent: true, opacity: 0.55 }));
  rimLine.position.y = -slabH / 2;
  scene.add(rimLine);

  const glow = new THREE.Mesh(new THREE.CircleGeometry(w * 0.66, 40), glowMat(0x1b7ad0, 0.16));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -slabH - 3.6;
  scene.add(glow);
}

/** Visible stone paths along every road edge, with little discs at the joints. */
function buildPaths(scene: THREE.Scene): void {
  const pathMat = mat(0x233757, { rough: 1, emissive: 0x16233c, ei: 0.35 });
  for (const [a, b] of EDGES) {
    const pa = NODES[a], pb = NODES[b];
    const len = Math.sqrt(dist2(pa, pb));
    const geo = new THREE.PlaneGeometry(len, 0.34);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, pathMat);
    m.position.set((pa.x + pb.x) / 2, 0.006, (pa.z + pb.z) / 2);
    m.rotation.y = -Math.atan2(pb.z - pa.z, pb.x - pa.x);
    m.receiveShadow = true;
    scene.add(m);
  }
  for (const n of Object.values(NODES)) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), pathMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(n.x, 0.007, n.z);
    disc.receiveShadow = true;
    scene.add(disc);
  }
}

function buildZones(scene: THREE.Scene, zones: WorldZone[]): void {
  for (const z of zones) {
    const accent = ZONE_ACCENT[z.name] ?? 0x5b8cff;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 36),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.06, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(gx(z.col), 0.01, gz(z.row));
    scene.add(disc);
    const ringM = new THREE.Mesh(
      new THREE.RingGeometry(1.62, 1.7, 48),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.32, depthWrite: false })
    );
    ringM.rotation.x = -Math.PI / 2;
    ringM.position.set(gx(z.col), 0.012, gz(z.row));
    scene.add(ringM);

    const el = labelDiv(
      `<div style="color:${hexCss(accent)};font-size:11px;font-weight:700;letter-spacing:2px">${prettyZone(z.name)}</div>` +
      `<div style="color:#8fa8d8;font-size:8.5px;font-style:italic">${ZONE_TAGLINE[z.name] ?? ""}</div>`,
      { background: "rgba(6,10,20,0.85)", border: `1px solid ${hexCss(accent)}66`, borderRadius: "4px", padding: "4px 10px" }
    );
    const obj = new CSS2DObject(el);
    obj.position.set(gx(z.col), 0.05, gz(z.row) + 2.05);
    scene.add(obj);
  }
}

/** Venue scenery + the activity spots twins can occupy (sit, sip, perform). */
function buildVenueProps(sc: Scene3D): void {
  for (const z of sc.zones) {
    const g = new THREE.Group();
    const vx = gx(z.col), vz = gz(z.row);
    g.position.set(vx, 0, vz);

    switch (z.name) {
      case "maker_space": { // THE CAFÉ
        g.add(box(0.9, 0.85, 0.8, mat(0xa8442e), -0.1, 0, -0.65));
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.5, 4), mat(0xd94f4f));
        roof.position.set(-0.1, 1.12, -0.65);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        g.add(roof);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.26), mat(0xffdf9e, { emissive: 0xffc866, ei: 1.6 }));
        win.position.set(-0.1, 0.5, -0.24);
        g.add(win);
        for (const [tx, tz] of [[-0.9, 0.45], [0.7, 0.2]] as const) {
          g.add(cyl(0.22, 0.22, 0.3, mat(0x8a5a34), tx, 0, tz));
          g.add(ball(0.045, mat(0xfff3c4, { emissive: 0xfff3c4, ei: 0.7 }), tx - 0.07, 0.36, tz));
          g.add(ball(0.045, mat(0x9fd9ff, { emissive: 0x9fd9ff, ei: 0.5 }), tx + 0.07, 0.36, tz));
          // one seat per table, facing the table
          sc.spots.push({ zone: z.name, x: vx + tx + 0.42, z: vz + tz + 0.3, kind: "coffee", yaw: Math.atan2(-0.42, -0.3) + MODEL_YAW, busyBy: null });
        }
        g.add(ball(0.07, mat(0xffd166, { emissive: 0xffb347, ei: 2.2 }), 0.45, 0.95, -0.35));
        break;
      }
      case "plaza": { // THE STAGE
        g.add(cyl(1.05, 1.15, 0.22, mat(0x8a4a2e), 0, 0, 0));
        g.add(cyl(0.05, 0.05, 1.5, mat(0x333a4d), -1.0, 0.2, 0));
        g.add(cyl(0.05, 0.05, 1.5, mat(0x333a4d), 1.0, 0.2, 0));
        g.add(box(2.15, 0.09, 0.12, mat(0x222836), 0, 1.66, 0));
        for (const lx of [-0.7, 0, 0.7]) {
          g.add(ball(0.07, mat(0xfff3c4, { emissive: 0xffe28a, ei: 2.6 }), lx, 1.6, 0));
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.35, 20, 1, true), glowMat(0xffe28a, 0.07));
          cone.position.set(lx, 0.92, 0);
          g.add(cone);
        }
        sc.spots.push({ zone: z.name, x: vx, z: vz + 0.25, kind: "stage", yaw: Math.PI * 0.25 + MODEL_YAW, busyBy: null });
        break;
      }
      case "event_space": { // THE LAWN
        const blanket = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.65), mat(0xd94f6a, { rough: 1 }));
        blanket.rotation.x = -Math.PI / 2;
        blanket.position.y = 0.015;
        blanket.receiveShadow = true;
        g.add(blanket);
        sc.spots.push({ zone: z.name, x: vx - 0.22, z: vz + 0.14, kind: "blanket", yaw: Math.PI / 2 + MODEL_YAW, busyBy: null });
        sc.spots.push({ zone: z.name, x: vx + 0.26, z: vz - 0.12, kind: "blanket", yaw: -Math.PI / 2 + MODEL_YAW, busyBy: null });
        for (const [bx, bz, r] of [[-1.0, -0.4, 0.26], [0.9, -0.55, 0.3], [1.15, 0.4, 0.22]] as const) {
          g.add(ball(r, mat(0x1f8a54), bx, r * 0.8, bz));
          g.add(ball(r * 0.7, mat(0x3ddc97), bx - 0.05, r * 1.3, bz - 0.05));
        }
        g.add(cyl(0.035, 0.035, 1.1, mat(0x333a4d), -1.3, 0, 0.1));
        g.add(cyl(0.035, 0.035, 1.1, mat(0x333a4d), 1.3, 0, -0.15));
        const cols = [0xffd166, 0xff6f9c, 0x5be0c8, 0x9fd9ff, 0xffd166];
        for (let i = 1; i < 6; i++) {
          const t = i / 6;
          const lx = -1.3 + t * 2.6;
          const ly = 1.06 - (1 - (2 * t - 1) ** 2) * 0.22;
          g.add(ball(0.05, mat(cols[i - 1], { emissive: cols[i - 1], ei: 1.8 }), lx, ly, 0.1 - t * 0.25));
        }
        break;
      }
      case "network_hub": { // QUIET CORNER
        g.add(box(0.85, 0.16, 0.32, mat(0x4a3a2c), -0.2, 0.18, 0.1));
        g.add(box(0.85, 0.3, 0.06, mat(0x5a4636), -0.2, 0.34, -0.06));
        sc.spots.push({ zone: z.name, x: vx - 0.42, z: vz + 0.16, kind: "bench", yaw: MODEL_YAW, busyBy: null });
        sc.spots.push({ zone: z.name, x: vx + 0.05, z: vz + 0.16, kind: "bench", yaw: MODEL_YAW, busyBy: null });
        g.add(cyl(0.04, 0.04, 1.5, mat(0x333a4d), 0.9, 0, -0.3));
        g.add(ball(0.09, mat(0xcfe0ff, { emissive: 0x9fb4d8, ei: 2 }), 0.9, 1.58, -0.3));
        const trunk = cyl(0.035, 0.06, 0.9, mat(0x3a2f28), -1.1, 0, -0.5);
        trunk.rotation.z = 0.08;
        g.add(trunk);
        const branch = cyl(0.02, 0.03, 0.45, mat(0x3a2f28), -1.25, 0.62, -0.5);
        branch.rotation.z = 0.7;
        g.add(branch);
        break;
      }
    }
    sc.scene.add(g);
  }
}

/** Collect every emissive material so night can turn the lights up. */
function registerGlowMaterials(sc: Scene3D, root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mm of mats) {
      const std = mm as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial && std.emissiveIntensity > 0 && std.emissive.getHex() !== 0x000000) {
        if (!sc.glow.some((gl) => gl.m === std)) sc.glow.push({ m: std, base: std.emissiveIntensity });
      }
    }
  });
}

// ---------------- day/night ----------------

const NIGHT_BG = new THREE.Color(0x05070f);
const DAY_BG = new THREE.Color(0x2b4a7a);
const NIGHT_SUN = new THREE.Color(0x8fb4ff);
const DAY_SUN = new THREE.Color(0xfff1d6);
const tmpColor = new THREE.Color();

function updateDayNight(sc: Scene3D, t: number): void {
  const phase = ((t + sc.dayOffset) % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS; // 0 = midnight
  const dayness = Math.max(0, Math.sin((phase - 0.25) * Math.PI * 2)); // 0 at 6am/6pm, 1 at noon

  (sc.scene.background as THREE.Color).copy(tmpColor.copy(NIGHT_BG).lerp(DAY_BG, dayness));
  sc.keyLight.intensity = 0.4 + 1.25 * dayness;
  sc.keyLight.color.copy(tmpColor.copy(NIGHT_SUN).lerp(DAY_SUN, Math.min(1, dayness * 1.4)));
  const sunA = phase * Math.PI * 2 - Math.PI / 2; // rises 6am, sets 6pm
  sc.keyLight.position.set(Math.cos(sunA) * 10, 6 + 9 * Math.max(0.12, dayness), Math.sin(sunA) * 7 + 3);
  sc.hemi.intensity = 0.3 + 0.45 * dayness;
  (sc.stars.material as THREE.PointsMaterial).opacity = 0.85 * (1 - dayness);
  const nightness = 1 - dayness;
  for (const gl of sc.glow) gl.m.emissiveIntensity = gl.base * (0.3 + 1.15 * nightness);
}

// ---------------- structures ----------------

const STRUCT_ACCENT: Record<ProjectType, number> = {
  fountain: 0x5be0c8, mural: 0xff6f9c, noodle_stand: 0xffd166, arcade_game: 0x5b8cff,
  garden: 0x3ddc97, observatory: 0xc98cff, stage: 0xff9a5b, workshop: 0xffa24b
};

function buildStructure(sc: Scene3D, type: ProjectType, x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const accent = STRUCT_ACCENT[type] ?? 0x5b8cff;

  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 28), glowMat(accent, 0.1));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.008;
  g.add(glow);

  switch (type) {
    case "fountain": {
      g.add(cyl(0.42, 0.48, 0.22, mat(0x2e5d8a), 0, 0, 0));
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), mat(0x53d6e8, { emissive: 0x2ba8c8, ei: 0.8, rough: 0.25 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.2;
      g.add(water);
      g.add(cyl(0.07, 0.09, 0.5, mat(0x3a6d9a), 0, 0.1, 0));
      const spray = ball(0.09, mat(0xbdf6ff, { emissive: 0xbdf6ff, ei: 1.6 }), 0, 0.78, 0);
      g.add(spray);
      sc.sprays.push(spray);
      break;
    }
    case "workshop": {
      g.add(box(0.75, 0.62, 0.65, mat(0xb96a2e), 0, 0, 0));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.4, 4), mat(0x7a4620));
      roof.position.y = 0.84;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.18), mat(0xffdf9e, { emissive: 0xffc866, ei: 1.7 }));
      win.position.set(0.15, 0.36, 0.331);
      g.add(win);
      g.add(cyl(0.012, 0.012, 0.34, mat(0x888888), 0.2, 1.0, -0.1));
      g.add(ball(0.045, mat(0xff6b6b, { emissive: 0xff4b4b, ei: 2 }), 0.2, 1.38, -0.1));
      break;
    }
    case "stage": {
      g.add(cyl(0.55, 0.62, 0.18, mat(0x8a4a2e), 0, 0, 0));
      g.add(cyl(0.035, 0.035, 0.95, mat(0x333a4d), -0.45, 0.16, 0));
      g.add(cyl(0.035, 0.035, 0.95, mat(0x333a4d), 0.45, 0.16, 0));
      g.add(box(1.0, 0.06, 0.08, mat(0x222836), 0, 1.08, 0));
      for (const lx of [-0.3, 0, 0.3]) g.add(ball(0.05, mat(0xfff3c4, { emissive: 0xffe28a, ei: 2.4 }), lx, 1.05, 0));
      break;
    }
    case "garden": {
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.1, 6), mat(0x2c4a2e));
      bed.position.y = 0.05;
      bed.receiveShadow = true;
      g.add(bed);
      for (const [bx, bz, r] of [[-0.18, -0.05, 0.16], [0.12, -0.16, 0.19], [0.2, 0.12, 0.13]] as const) {
        g.add(ball(r, mat(0x1f8a54), bx, 0.1 + r * 0.8, bz));
        g.add(ball(r * 0.66, mat(0x3ddc97), bx - 0.03, 0.1 + r * 1.4, bz - 0.03));
      }
      g.add(ball(0.028, mat(0xffd1e8, { emissive: 0xffd1e8, ei: 0.8 }), -0.1, 0.42, -0.1));
      g.add(ball(0.028, mat(0xfff3a6, { emissive: 0xfff3a6, ei: 0.8 }), 0.2, 0.46, 0.05));
      break;
    }
    case "arcade_game": {
      g.add(box(0.5, 0.85, 0.4, mat(0x3b5bd9), 0, 0, 0));
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), mat(0x54e8ff, { emissive: 0x54e8ff, ei: 1.8 }));
      screen.position.set(0, 0.56, 0.201);
      screen.rotation.x = -0.12;
      g.add(screen);
      g.add(box(0.56, 0.1, 0.44, mat(0x8fb0ff, { emissive: 0x5b8cff, ei: 0.5 }), 0, 0.85, 0));
      break;
    }
    case "observatory": {
      g.add(cyl(0.4, 0.46, 0.6, mat(0x7a4ecb), 0, 0, 0));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xa88ae0, { rough: 0.5 }));
      dome.position.y = 0.6;
      dome.castShadow = true;
      g.add(dome);
      g.add(box(0.07, 0.3, 0.05, mat(0x2a1e44), 0, 0.72, 0.22));
      break;
    }
    case "noodle_stand": {
      g.add(box(0.6, 0.5, 0.5, mat(0xc9a13c), 0, 0, 0));
      const awn = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.3, 4), mat(0xd94f4f));
      awn.position.y = 0.68;
      awn.rotation.y = Math.PI / 4;
      awn.castShadow = true;
      g.add(awn);
      g.add(ball(0.06, mat(0xffd166, { emissive: 0xffb347, ei: 2.2 }), -0.34, 0.52, 0.3));
      break;
    }
    default: { // mural
      g.add(box(0.8, 0.55, 0.12, mat(0x8a3a5a), 0, 0, 0));
      const cols = [0xff6f9c, 0x5be0c8, 0xffd166, 0x5b8cff, 0x3ddc97];
      for (let i = 0; i < 5; i++) {
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), mat(cols[i], { emissive: cols[i], ei: 0.6 }));
        tile.position.set(-0.28 + i * 0.14, 0.28 + (i % 2) * 0.14, 0.061);
        g.add(tile);
      }
    }
  }
  sc.scene.add(g);
  registerGlowMaterials(sc, g);
  return g;
}

// ---------------- twins ----------------

function fallbackBody(colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 6, 14), mat(colorHex));
  body.position.y = 0.43;
  body.castShadow = true;
  g.add(body);
  g.add(ball(0.17, mat(0xf2cda6), 0, 0.95, 0));
  return g;
}

function createTwin(t: WorldTwinView, sc: Scene3D): Twin3D {
  const root = new THREE.Group();

  const body = new THREE.Group();
  if (sc.models.length > 0) {
    const template = sc.models[hash(t.id) % sc.models.length];
    body.add(template.clone(true));
  } else {
    body.add(fallbackBody(t.colorHex));
  }
  body.rotation.y = MODEL_YAW;
  root.add(body);

  // coffee prop (visible only during café activity)
  const cup = new THREE.Group();
  cup.add(cyl(0.045, 0.038, 0.09, mat(0xfff3e0, { rough: 0.4 }), 0, 0, 0, 12));
  cup.add(cyl(0.05, 0.05, 0.012, mat(0x6b4a2e), 0, 0.085, 0, 12));
  cup.position.set(0.2, 0.58, 0.2);
  cup.visible = false;
  body.add(cup);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.4, 36),
    new THREE.MeshBasicMaterial({ color: t.colorHex, transparent: true, opacity: 0.55, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  root.add(ring);

  const nameEl = labelDiv(
    `${t.flag ? t.flag + " " : ""}${t.name}`,
    {
      color: "#eaf0ff", fontSize: "10px", background: "rgba(7,11,22,0.7)",
      borderRadius: "3px", padding: "1px 6px", border: `1px solid ${hexCss(t.colorHex)}55`
    }
  );
  const nameObj = new CSS2DObject(nameEl);
  nameObj.position.set(0, -0.12, 0.35);
  root.add(nameObj);

  // owner-order status ("🚶 Heading to THE CAFÉ"), under the name
  const statusEl = labelDiv("", {
    color: "#ffe9a8", fontSize: "9.5px", background: "rgba(40,30,6,0.88)",
    border: "1px solid #ffd16688", borderRadius: "10px", padding: "1px 7px", display: "none"
  });
  const statusObj = new CSS2DObject(statusEl);
  statusObj.position.set(0, -0.32, 0.35);
  root.add(statusObj);

  // ambient speech bubble (canned chatter + activity emoji)
  const bubbleEl = labelDiv("", {
    color: "#e6edf7", fontSize: "10px", background: "rgba(10,16,30,0.92)",
    border: `1px solid ${hexCss(t.colorHex)}77`, borderRadius: "8px",
    padding: "3px 8px", display: "none", maxWidth: "150px", whiteSpace: "normal"
  });
  const bubbleObj = new CSS2DObject(bubbleEl);
  bubbleObj.position.set(0, TWIN_HEIGHT + 0.34, 0);
  root.add(bubbleObj);

  // 💬 marker while its line is on the TV caption bar
  const markEl = labelDiv("💬", {
    fontSize: "14px", background: hexCss(t.colorHex), borderRadius: "8px",
    padding: "1px 6px 2px", display: "none"
  });
  const mark = new CSS2DObject(markEl);
  mark.position.set(0, TWIN_HEIGHT + 0.62, 0);
  root.add(mark);

  root.position.set(gx(t.col), 0, gz(t.row));
  sc.scene.add(root);

  const now = performance.now() / 1000;
  return {
    id: t.id, root, body, ring, mark, bubbleEl, cup,
    mode: "idle", route: [], onArrive: null, activity: null, talk: null,
    order: null, orderKey: "", orderArrived: false, statusEl, heldUntil: 0,
    ax: root.position.x, az: root.position.z,
    nextTx: root.position.x, nextTz: root.position.z,
    applyAt: 0,
    nextWanderAt: now + 2 + Math.random() * 5,
    speedMul: 0.85 + ((hash(t.id) >> 4) % 30) / 100,
    walkPhase: 0,
    phase: (hash(t.id) % 628) / 100,
    yaw: MODEL_YAW
  };
}

// ---------------- reconcile ----------------

function nearestZone(sc: Scene3D, col: number, row: number): WorldZone {
  let best = sc.zones[0];
  let bd = Infinity;
  for (const z of sc.zones) {
    const d = (z.col - col) ** 2 + (z.row - row) ** 2;
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}

function addStructure(st: WorldStructureView, sc: Scene3D): void {
  const key = `${Math.round(st.col * 2)},${Math.round(st.row * 2)}`;
  if (sc.occupied.has(key)) {
    const z = nearestZone(sc, st.col, st.row);
    let o = sc.overflow.get(z.name);
    if (!o) {
      const el = labelDiv("", { color: "#8fa8d8", fontSize: "9px" });
      const obj = new CSS2DObject(el);
      obj.position.set(gx(z.col), 0.05, gz(z.row) + 2.55);
      sc.scene.add(obj);
      o = { count: 0, el };
      sc.overflow.set(z.name, o);
    }
    o.count += 1;
    o.el.textContent = `+${o.count} more built`;
    return;
  }
  sc.occupied.add(key);
  const g = buildStructure(sc, st.type, gx(st.col), gz(st.row));
  if (st.builtByTwinId && st.builtByTwinId === sc.myId.current) {
    const star = labelDiv("★ yours", { color: "#ffd166", fontSize: "9px" });
    const obj = new CSS2DObject(star);
    obj.position.set(0, 1.35, 0);
    g.add(obj);
  }
}

function reconcile(sc: Scene3D, s: WorldState): void {
  for (const t of s.twins) {
    sc.namesById.set(t.id, t.name);
    let tw = sc.twins.get(t.id);
    if (!tw) {
      tw = createTwin(t, sc);
      sc.twins.set(t.id, tw);
    }
    const nx = gx(t.col);
    const nz = gz(t.row);
    const key = t.order ? `${t.order.kind}:${t.order.zone}:${t.order.targetName ?? ""}` : "";
    if (key !== tw.orderKey) {
      tw.orderKey = key;
      tw.order = t.order;
      startOrder(sc, tw);
    }
    if (tw.order && tw.order.kind !== "talk_to") {
      // the twin is at its ordered spot — server tile positions don't drag it around
      tw.ax = nx;
      tw.az = nz;
      continue;
    }
    if (nx !== tw.ax || nz !== tw.az) {
      tw.nextTx = nx;
      tw.nextTz = nz;
      tw.applyAt = performance.now() / 1000 + Math.random() * 0.9;
    }
  }
  for (const st of s.structures) {
    if (!sc.structures.has(st.id)) {
      addStructure(st, sc);
      sc.structures.add(st.id);
    }
  }
}

// ---------------- behavior helpers ----------------

function stopActivity(tw: Twin3D): void {
  if (tw.activity) {
    tw.activity.spot.busyBy = null;
    tw.activity = null;
  }
  tw.cup.visible = false;
  tw.body.position.y = 0;
  tw.body.rotation.x = 0;
  hideBubble(tw);
}

function stopTalk(sc: Scene3D, tw: Twin3D): void {
  if (!tw.talk) return;
  const partner = sc.twins.get(tw.talk.partnerId);
  tw.talk = null;
  tw.mode = "idle";
  hideBubble(tw);
  if (partner?.talk?.partnerId === tw.id) {
    partner.talk = null;
    partner.mode = "idle";
    hideBubble(partner);
  }
}

function showBubble(tw: Twin3D, text: string): void {
  tw.bubbleEl.textContent = text;
  tw.bubbleEl.style.display = "block";
}
function hideBubble(tw: Twin3D): void {
  tw.bubbleEl.style.display = "none";
}

// ---------------- owner orders ----------------

function zoneCenter(sc: Scene3D, zone: string): Pt {
  const z = sc.zones.find((zz) => zz.name === zone) ?? sc.zones[0];
  return { x: gx(z.col), z: gz(z.row) };
}

function setStatus(tw: Twin3D): void {
  if (!tw.order) {
    tw.statusEl.style.display = "none";
    return;
  }
  tw.statusEl.textContent = orderStatus(tw.order, tw.orderArrived);
  tw.statusEl.style.display = "block";
}

/** A new owner order (or none) arrived from the server: act on it right away. */
function startOrder(sc: Scene3D, tw: Twin3D): void {
  stopActivity(tw);
  stopTalk(sc, tw);
  tw.applyAt = 0;
  tw.orderArrived = false;
  const now = performance.now() / 1000;
  const order = tw.order;
  if (!order) {
    setStatus(tw);
    tw.route = [];
    tw.mode = "idle";
    tw.nextWanderAt = now + 1.5;
    return;
  }
  if (order.kind === "stay") {
    tw.route = [];
    tw.mode = "idle";
    arriveOrder(sc, tw);
    return;
  }
  if (order.kind === "talk_to") {
    const targetId = [...sc.namesById.entries()].find(([, n]) => n === order.targetName)?.[0];
    const target = targetId ? sc.twins.get(targetId) : undefined;
    if (target && !target.order) {
      // the target waits for its visitor instead of wandering off
      stopTalk(sc, target);
      if (target.mode === "walk") {
        target.route = [];
        target.mode = "idle";
      }
      target.heldUntil = now + 40;
    }
    const c = target ? { x: target.root.position.x, z: target.root.position.z } : zoneCenter(sc, order.zone);
    walkTo(tw, { x: c.x - 0.55, z: c.z + 0.35 }, null);
    setStatus(tw);
    return;
  }
  // go: take a seat at the venue — even if someone else is sitting there
  const spots = sc.spots.filter((sp) => sp.zone === order.zone);
  const spot = spots.find((sp) => sp.busyBy === null || sp.busyBy === tw.id) ?? spots[0];
  if (spot) {
    const sitter = spot.busyBy && spot.busyBy !== tw.id ? sc.twins.get(spot.busyBy) : undefined;
    if (sitter && !sitter.order) {
      stopActivity(sitter);
      sitter.route = [];
      sitter.mode = "idle";
      sitter.nextWanderAt = now + 0.5;
    }
    spot.busyBy = tw.id;
    walkTo(tw, { x: spot.x, z: spot.z }, { spot });
  } else {
    const c = zoneCenter(sc, order.zone);
    walkTo(tw, { x: c.x + 0.4, z: c.z + 0.4 }, null);
  }
  setStatus(tw);
}

function arriveOrder(sc: Scene3D, tw: Twin3D): void {
  if (!tw.order || tw.orderArrived) return;
  tw.orderArrived = true;
  if (tw.order.kind === "talk_to") {
    const targetId = [...sc.namesById.entries()].find(([, n]) => n === tw.order!.targetName)?.[0];
    const target = targetId ? sc.twins.get(targetId) : undefined;
    if (target) {
      tw.yaw = Math.atan2(target.root.position.x - tw.root.position.x, target.root.position.z - tw.root.position.z) + MODEL_YAW;
      tw.body.rotation.y = tw.yaw;
    }
  }
  setStatus(tw);
  sc.onOrderArrive.current?.(tw.id, orderStatus(tw.order, true));
}

/** Send a twin somewhere along the roads. */
function walkTo(tw: Twin3D, to: Pt, arrive: { spot: Spot } | null): void {
  tw.route = findRoute({ x: tw.root.position.x, z: tw.root.position.z }, to);
  tw.onArrive = arrive;
  tw.mode = "walk";
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// ---------------- animate ----------------

function animate(sc: Scene3D, t: number): void {
  const dt = Math.min(0.1, Math.max(0.001, t - sc.lastT));
  const now = performance.now() / 1000;

  updateDayNight(sc, t);

  // ---- ambient conversation matchmaking (every 2s) ----
  if (t >= sc.nextTalkScan) {
    sc.nextTalkScan = t + 2;
    const idle: Twin3D[] = [];
    for (const tw of sc.twins.values()) {
      if (tw.mode === "idle" && !tw.activity && !tw.order && tw.heldUntil < now && sc.speakingId.current !== tw.id) idle.push(tw);
    }
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i], b = idle[j];
        if (a.talk || b.talk) continue;
        const d = Math.hypot(a.root.position.x - b.root.position.x, a.root.position.z - b.root.position.z);
        if (d > TALK_RANGE) continue;
        const key = pairKey(a.id, b.id);
        if ((sc.pairCooldown.get(key) ?? 0) > t) continue;
        sc.pairCooldown.set(key, t + PAIR_COOLDOWN_S + Math.random() * 60);
        // pick a dialog; {n} = some other villager's name
        const raw = AMBIENT_DIALOGS[Math.floor(Math.random() * AMBIENT_DIALOGS.length)];
        const others = [...sc.namesById.entries()].filter(([id]) => id !== a.id && id !== b.id).map(([, n]) => n);
        const n = others[Math.floor(Math.random() * Math.max(1, others.length))] ?? "someone";
        const lines = raw.map((l) => l.replace("{n}", n));
        const mine = lines.map((_, k) => k % 2 === 0);
        a.talk = { partnerId: b.id, lines, mine, idx: -1, nextAt: t + 0.3 };
        b.talk = { partnerId: a.id, lines, mine: mine.map((v) => !v), idx: -1, nextAt: Infinity };
        a.mode = "talk";
        b.mode = "talk";
        // face each other
        a.yaw = Math.atan2(b.root.position.x - a.root.position.x, b.root.position.z - a.root.position.z) + MODEL_YAW;
        b.yaw = Math.atan2(a.root.position.x - b.root.position.x, a.root.position.z - b.root.position.z) + MODEL_YAW;
        a.body.rotation.y = a.yaw;
        b.body.rotation.y = b.yaw;
      }
    }
  }

  for (const [id, tw] of sc.twins) {
    // ---- server frame targets override ambient behavior (staggered) ----
    if (tw.applyAt > 0 && now >= tw.applyAt) {
      tw.applyAt = 0;
      tw.ax = tw.nextTx;
      tw.az = tw.nextTz;
      stopActivity(tw);
      stopTalk(sc, tw);
      walkTo(tw, { x: tw.nextTx, z: tw.nextTz }, null);
      tw.nextWanderAt = now + 4 + Math.random() * 5;
    }

    // ---- movement along the road route ----
    if (tw.route.length > 0) {
      const target = tw.route[0];
      const dx = target.x - tw.root.position.x;
      const dz = target.z - tw.root.position.z;
      const d = Math.hypot(dx, dz);
      const step = WALK_SPEED * tw.speedMul * dt;
      if (d <= step) {
        tw.root.position.x = target.x;
        tw.root.position.z = target.z;
        tw.route.shift();
        if (tw.route.length === 0) {
          // arrived
          tw.walkPhase = 0;
          tw.body.position.y = 0;
          if (tw.onArrive) {
            const spot = tw.onArrive.spot;
            tw.onArrive = null;
            if (spot.busyBy === id) {
              const [lo, hi] = ACTIVITY_DURATION[spot.kind];
              // an owner order holds the twin at its spot until the order changes
              const until = tw.order ? Infinity : now + lo + Math.random() * (hi - lo);
              tw.activity = { spot, until, emojiAt: now + 1 + Math.random() * 2 };
              tw.mode = "activity";
              tw.yaw = spot.yaw;
              tw.body.rotation.y = tw.yaw;
              tw.body.position.y = -SIT_DROP[spot.kind];
              if (spot.kind === "bench" || spot.kind === "blanket") tw.body.rotation.x = -0.1;
              if (spot.kind === "coffee") tw.cup.visible = true;
            } else {
              tw.mode = "idle";
              tw.nextWanderAt = now + 1;
            }
          } else {
            tw.mode = "idle";
            tw.nextWanderAt = now + 2 + Math.random() * 4;
          }
          if (tw.order) arriveOrder(sc, tw);
        }
      } else {
        tw.root.position.x += (dx / d) * step;
        tw.root.position.z += (dz / d) * step;
        tw.walkPhase += dt * 9;
        const targetYaw = Math.atan2(dx, dz) + MODEL_YAW;
        let dy = targetYaw - tw.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        tw.yaw += dy * Math.min(1, dt * 8);
        tw.body.rotation.y = tw.yaw;
        tw.body.position.y = Math.abs(Math.sin(tw.walkPhase)) * 0.045;
        tw.body.rotation.z = Math.sin(tw.walkPhase) * 0.035;
      }
    } else if (tw.mode === "activity" && tw.activity) {
      // ---- doing something at a venue ----
      const act = tw.activity;
      const k = act.spot.kind;
      if (k === "coffee") {
        // raise the cup for a sip every few seconds
        const sip = Math.max(0, Math.sin((now * 1.4 + tw.phase) % (Math.PI * 2)));
        tw.cup.position.y = 0.58 + sip * 0.14;
        tw.body.position.y = Math.sin(t * 1.1 + tw.phase) * 0.008;
      } else if (k === "stage") {
        tw.body.position.y = Math.abs(Math.sin(t * 3 + tw.phase)) * 0.08; // little performance hops
        tw.body.rotation.y = tw.yaw + Math.sin(t * 1.4 + tw.phase) * 0.4;
      } else {
        tw.body.position.y = -SIT_DROP[k] + Math.sin(t * 1.1 + tw.phase) * 0.008; // seated breathing
      }
      if (now >= act.emojiAt) {
        const pool = ACTIVITY_EMOJI[k];
        showBubble(tw, pool[Math.floor(Math.random() * pool.length)]);
        act.emojiAt = now + 4 + Math.random() * 4;
        setTimeout(() => { if (tw.activity === act) hideBubble(tw); }, 1800);
      }
      if (now >= act.until) {
        stopActivity(tw);
        tw.mode = "idle";
        tw.nextWanderAt = now + 1 + Math.random() * 3;
      }
    } else if (tw.mode === "talk" && tw.talk) {
      // ---- ambient conversation: alternate canned lines ----
      const talk = tw.talk;
      tw.body.position.y = Math.sin(t * 1.3 + tw.phase) * 0.012;
      if (t >= talk.nextAt) {
        talk.idx += 1;
        if (talk.idx >= talk.lines.length) {
          stopTalk(sc, tw);
          tw.nextWanderAt = now + 2 + Math.random() * 4;
        } else {
          const partner = sc.twins.get(talk.partnerId);
          if (talk.mine[talk.idx]) {
            showBubble(tw, talk.lines[talk.idx]);
            if (partner) hideBubble(partner);
          } else if (partner?.talk) {
            showBubble(partner, talk.lines[talk.idx]);
            hideBubble(tw);
          }
          talk.nextAt = t + TALK_LINE_SECONDS;
        }
      }
    } else {
      // ---- idle: breathe, then decide what to do next ----
      tw.body.position.y = Math.sin(t * 1.1 + tw.phase) * 0.012;
      tw.body.rotation.z = 0;
      if (now >= tw.nextWanderAt && !tw.order && tw.heldUntil < now) {
        const roll = Math.random();
        const freeSpots = sc.spots.filter((s) => s.busyBy === null);
        if (roll < 0.45 && freeSpots.length > 0) {
          // go do something at a venue (sit, sip, perform)
          const spot = freeSpots[Math.floor(Math.random() * freeSpots.length)];
          spot.busyBy = id;
          walkTo(tw, { x: spot.x, z: spot.z }, { spot });
        } else if (roll < 0.8) {
          // stroll the roads to somewhere else on the island
          const dest: Pt = {
            x: clamp(tw.root.position.x + (Math.random() - 0.5) * 7, -5.2, 5.2),
            z: clamp(tw.root.position.z + (Math.random() - 0.5) * 7, -5.2, 5.2)
          };
          tw.ax = dest.x;
          tw.az = dest.z;
          walkTo(tw, dest, null);
        } else {
          // loiter near the current spot
          walkTo(tw, {
            x: clamp(tw.root.position.x + (Math.random() - 0.5) * 1.4, -5.4, 5.4),
            z: clamp(tw.root.position.z + (Math.random() - 0.5) * 1.4, -5.4, 5.4)
          }, null);
        }
        tw.nextWanderAt = now + 6 + Math.random() * 9;
      }
    }

    const pulse = 1 + Math.sin(t * 2.2 + tw.phase) * 0.12;
    tw.ring.scale.set(pulse, pulse, 1);

    const speaking = sc.speakingId.current === id;
    (tw.mark.element as HTMLElement).style.display = speaking ? "block" : "none";
    if (speaking) tw.mark.position.y = TWIN_HEIGHT + 0.62 + Math.sin(t * 3.2) * 0.05;
  }

  for (const sp of sc.sprays) {
    sp.position.y = 0.78 + Math.sin(t * 2.4 + sp.parent!.position.x) * 0.05;
    const m = sp.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 1.3 + Math.sin(t * 3 + sp.parent!.position.x) * 0.5;
  }
}
