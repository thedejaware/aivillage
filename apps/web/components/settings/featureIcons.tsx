"use client";

/**
 * Small picture icons for the avatar builder's tiles (Bitmoji style).
 * Every icon is a 48×48 SVG with the same friendly line weight, and uses the
 * look's current colours (skin, hair, eyes, lips, clothes) so the tiles
 * show what the twin would actually get.
 */

import { useId, type ReactNode } from "react";
import {
  EYE_COLORS, HAIR_COLORS, LIP_COLORS, OUTFIT_COLORS, SKIN_TONES, colorHex, type Appearance
} from "@aivillage/shared";

const INK = "#3b4252";
const SW = 1.75; // one line weight for every icon
const line = { stroke: INK, strokeWidth: SW, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
const outlined = (fill: string) => ({ ...line, fill });

/** Darker (amt < 0) or lighter (amt > 0) version of a hex colour. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

interface Colors { skin: string; hair: string; eye: string; lip: string; cloth: string; }

function colorsOf(look: Appearance): Colors {
  return {
    skin: colorHex(SKIN_TONES, look.skin),
    hair: colorHex(HAIR_COLORS, look.hairColor),
    eye: colorHex(EYE_COLORS, look.eyeColor),
    lip: colorHex(LIP_COLORS, look.lipColor),
    cloth: colorHex(OUTFIT_COLORS, look.outfitColor)
  };
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden focusable="false" style={{ display: "block", overflow: "visible" }}>
      {children}
    </svg>
  );
}

/** Mirror a drawing onto the other side of the face. */
const Mirror = ({ children }: { children: ReactNode }) => (
  <>
    {children}
    <g transform="translate(48 0) scale(-1 1)">{children}</g>
  </>
);

const Dots = ({ y = 24, gap = 5.5, r = 1.7 }: { y?: number; gap?: number; r?: number }) => (
  <>
    <circle cx={24 - gap} cy={y} r={r} fill={INK} />
    <circle cx={24 + gap} cy={y} r={r} fill={INK} />
  </>
);

const Smile = ({ y = 31, w = 5 }: { y?: number; w?: number }) => <path d={`M${24 - w} ${y} Q24 ${y + 4} ${24 + w} ${y}`} {...line} />;

/** A plain round head for icons that are about something else. */
const Head = ({ c, cy = 26, r = 13 }: { c: Colors; cy?: number; r?: number }) => <circle cx={24} cy={cy} r={r} {...outlined(c.skin)} />;

// ---------------- face shapes ----------------

const FACE_PATHS: Record<string, string> = {
  round: "M24 9a16 16 0 1 1 0 32a16 16 0 1 1 0-32Z",
  oval: "M24 7C32 7 37 14 37 24C37 35 31 42 24 42C17 42 11 35 11 24C11 14 16 7 24 7Z",
  heart: "M24 42C15 37 9.5 29 10 20C10.5 12 16.5 8 24 10C31.5 8 37.5 12 38 20C38.5 29 33 37 24 42Z",
  square: "M16 9H32Q39 9 39 16V33Q39 41 31 41H17Q9 41 9 33V16Q9 9 16 9Z",
  long: "M24 5C31 5 35 10 35 18V31C35 39 30 44 24 44C18 44 13 39 13 31V18C13 10 17 5 24 5Z",
  soft: "M24 9C31 9 35 13 35.5 19C38.5 25 38 33 33 38C30 41 27 42 24 42C21 42 18 41 15 38C10 33 9.5 25 12.5 19C13 13 17 9 24 9Z"
};

function FaceShapeIcon({ id, c }: { id: string; c: Colors }) {
  return (
    <Svg>
      <path d={FACE_PATHS[id] ?? FACE_PATHS.round} {...outlined(c.skin)} />
      <Dots y={23} />
      <Smile y={30} w={4} />
    </Svg>
  );
}

// ---------------- expressions ----------------

function ExpressionIcon({ id, c }: { id: string; c: Colors }) {
  const eyes: Record<string, ReactNode> = {
    smile: <Dots y={23} />,
    calm: <Mirror><path d="M16.5 23.5Q18.5 22 20.5 23.5" {...line} /></Mirror>,
    cheeky: <Dots y={23} />,
    sleepy: <Mirror><path d="M16 23Q18.5 25.5 21 23" {...line} /></Mirror>,
    bright: (
      <Mirror>
        <circle cx={18.5} cy={23} r={3.2} fill={INK} />
        <circle cx={19.6} cy={21.9} r={1.1} fill="#fff" />
      </Mirror>
    ),
    serious: <><Dots y={24} /><Mirror><path d="M15.5 19.5L21 20.5" {...line} /></Mirror></>,
    shy: <Mirror><path d="M16 24Q18.5 22 21 24" {...line} /></Mirror>,
    wink: <><circle cx={18.5} cy={23} r={1.7} fill={INK} /><path d="M27 23.5Q29.5 21 32 23.5" {...line} /></>
  };
  const mouths: Record<string, ReactNode> = {
    smile: <Smile y={30} w={5.5} />,
    calm: <path d="M20.5 31Q24 32.5 27.5 31" {...line} />,
    cheeky: (
      <>
        <path d="M24 31.5Q27.5 31.5 27.5 34Q27.5 36.5 24.5 36.5Q22 36.5 22.5 33.5" {...outlined("#e66f86")} />
        <path d="M18.5 30.5Q24 35 29.5 29.5" {...line} />
      </>
    ),
    sleepy: <circle cx={24} cy={32} r={1.8} {...line} />,
    bright: <path d="M18.5 29.5H29.5Q29.5 35.5 24 35.5Q18.5 35.5 18.5 29.5Z" {...outlined("#fff")} />,
    serious: <path d="M20 32H28" {...line} />,
    shy: <path d="M21.5 31.5Q24 33 26.5 31.5" {...line} />,
    wink: <Smile y={30} w={5.5} />
  };
  return (
    <Svg>
      <Head c={c} cy={25} r={15} />
      {id === "shy" && <Mirror><ellipse cx={15.5} cy={28.5} rx={2.8} ry={1.8} fill="#f08a9c" opacity={0.55} /></Mirror>}
      {eyes[id] ?? eyes.smile}
      {mouths[id] ?? mouths.smile}
    </Svg>
  );
}

// ---------------- eyes ----------------

const EYE_PATHS: Record<string, string> = {
  round: "M24 13C31.5 13 37 18 37 24C37 30 31.5 35 24 35C16.5 35 11 30 11 24C11 18 16.5 13 24 13Z",
  almond: "M7 24Q24 9 41 24Q24 37 7 24Z",
  wide: "M24 10C32.5 10 39 16 39 24C39 32 32.5 38 24 38C15.5 38 9 32 9 24C9 16 15.5 10 24 10Z",
  narrow: "M7 24Q24 15 41 24Q24 31 7 24Z",
  upturned: "M7 28Q19 12 41 17Q34 33 7 28Z",
  hooded: "M7 25Q24 12 41 25Q24 35 7 25Z"
};

function Eye({ shape, c, lashes }: { shape: string; c: Colors; lashes?: string }) {
  const clip = useId().replace(/:/g, "");
  const d = EYE_PATHS[shape] ?? EYE_PATHS.almond;
  const irisR = shape === "narrow" ? 7 : shape === "wide" ? 9.5 : 8;
  const cy = shape === "upturned" ? 23 : 24;
  return (
    <>
      <defs><clipPath id={clip}><path d={d} /></clipPath></defs>
      <path d={d} fill="#fff" />
      <g clipPath={`url(#${clip})`}>
        <circle cx={24} cy={cy} r={irisR} fill={c.eye} />
        <circle cx={24} cy={cy} r={irisR * 0.45} fill="#16110e" />
        <circle cx={26.5} cy={cy - 2.5} r={1.9} fill="#fff" />
        {shape === "hooded" && <path d="M5 25Q24 12 43 25L43 10H5Z" fill={c.skin} />}
      </g>
      {shape === "hooded" && <path d="M7 22.5Q24 13 41 22.5" {...line} />}
      <path d={d} {...line} />
      {lashes === "natural" && (
        <path d="M14 18.5L12.5 15.5M20 15.5L19.5 12.5M27 15.5L28 12.5M33.5 18L35.5 15" {...line} />
      )}
      {lashes === "long" && (
        <path d="M11 21Q8 18 7.5 14M16 16.5Q14 13 14 9.5M22 14.5Q21.5 11 22.5 7.5M28.5 14.5Q29.5 11 31.5 8M34 17Q36.5 14 39 12M38 20.5Q41 19 43 17.5" {...line} />
      )}
    </>
  );
}

function EyeShapeIcon({ id, c }: { id: string; c: Colors }) {
  return <Svg><Eye shape={id} c={c} /></Svg>;
}

function LashesIcon({ id, c, eyeShape }: { id: string; c: Colors; eyeShape: string }) {
  return (
    <Svg>
      <g transform="translate(0 4)"><Eye shape={eyeShape === "narrow" ? "almond" : eyeShape} c={c} lashes={id} /></g>
    </Svg>
  );
}

// ---------------- eyebrows ----------------

const BROW_SHAPES: Record<string, { d: string; w: number }> = {
  thin: { d: "M8 21Q14 15.5 21 18", w: 1.6 },
  natural: { d: "M8 20.5Q14 16 21 18", w: 3 },
  arched: { d: "M8 22Q13.5 12.5 21 18", w: 3 },
  straight: { d: "M8 19.5L21 18.5", w: 3.4 },
  thick: { d: "M8 20.5Q14 15.5 21 17.5", w: 5 },
  bushy: { d: "M7.5 21Q14 14.5 21.5 17.5", w: 6.5 }
};

function BrowsIcon({ id, c }: { id: string; c: Colors }) {
  const b = BROW_SHAPES[id] ?? BROW_SHAPES.natural;
  return (
    <Svg>
      <rect x={3} y={8} width={42} height={32} rx={14} fill={c.skin} opacity={0.55} />
      <Mirror>
        <path d={b.d} stroke={c.hair} strokeWidth={b.w} strokeLinecap="round" fill="none" />
        {id === "bushy" && <path d={b.d} stroke={shade(c.hair, -0.25)} strokeWidth={1} strokeDasharray="1 2.4" fill="none" />}
        <ellipse cx={14.5} cy={28} rx={3.4} ry={2.6} fill="#fff" stroke={INK} strokeWidth={1.3} />
        <circle cx={14.5} cy={28} r={1.7} fill={INK} />
      </Mirror>
    </Svg>
  );
}

// ---------------- nose ----------------

function NoseIcon({ id, c }: { id: string; c: Colors }) {
  const ink = { ...line, stroke: shade(c.skin, -0.55) };
  const noses: Record<string, ReactNode> = {
    button: (
      <>
        <circle cx={24} cy={27.5} r={4.2} fill={shade(c.skin, -0.1)} />
        <path d="M20 27Q20.5 31.5 24 31.5Q27.5 31.5 28 27" {...ink} />
        <circle cx={22.2} cy={29.4} r={1} fill={ink.stroke} />
        <circle cx={25.8} cy={29.4} r={1} fill={ink.stroke} />
      </>
    ),
    small: <path d="M24 22V27M21.5 29Q24 31 26.5 29" {...ink} />,
    round: <path d="M19.5 26.5Q17 33.5 24 33.5Q31 33.5 28.5 26.5M22 31.5H22.1M26 31.5H26.1" {...ink} />,
    straight: <path d="M23 13.5L22 28.5M19.5 30.5Q24 33.5 28.5 30.5" {...ink} />,
    wide: <path d="M24 18V27M15.5 28.5Q16.5 33.5 20.5 32M27.5 32Q31.5 33.5 32.5 28.5M20.5 32Q24 34 27.5 32" {...ink} />,
    pointed: <path d="M23 13L28.5 29L22.5 30.5" {...ink} />
  };
  return (
    <Svg>
      <circle cx={24} cy={24} r={19} fill={c.skin} />
      {noses[id] ?? noses.button}
    </Svg>
  );
}

// ---------------- mouth ----------------

const MOUTH_SIZES: Record<string, { w: number; up: number; low: number }> = {
  small: { w: 12, up: 3.5, low: 4 },
  natural: { w: 18, up: 4, low: 5 },
  wide: { w: 27, up: 3.6, low: 5 },
  full: { w: 19, up: 6.5, low: 8.5 },
  thin: { w: 19, up: 2.8, low: 3.2 }
};

function MouthIcon({ id, c }: { id: string; c: Colors }) {
  const m = MOUTH_SIZES[id] ?? MOUTH_SIZES.natural;
  const l = 24 - m.w / 2, r = 24 + m.w / 2, y = 25;
  const upper = `M${l} ${y}C${24 - m.w / 4} ${y - m.up} ${22} ${y - m.up} 24 ${y - m.up * 0.55}C26 ${y - m.up} ${24 + m.w / 4} ${y - m.up} ${r} ${y}Z`;
  const lower = `M${l} ${y}C${24 - m.w / 4} ${y + m.low * 1.25} ${24 + m.w / 4} ${y + m.low * 1.25} ${r} ${y}Z`;
  return (
    <Svg>
      <circle cx={24} cy={24} r={19} fill={c.skin} />
      <path d={lower} {...outlined(c.lip)} strokeWidth={1.3} />
      <path d={upper} {...outlined(shade(c.lip, -0.12))} strokeWidth={1.3} />
      <path d={`M${l} ${y}Q24 ${y + 1.2} ${r} ${y}`} {...line} strokeWidth={1.3} />
    </Svg>
  );
}

// ---------------- blush ----------------

function BlushIcon({ id, c }: { id: string; c: Colors }) {
  const amount = id === "rosy" ? 0.7 : id === "soft" ? 0.38 : 0;
  return (
    <Svg>
      <Head c={c} cy={24} r={16} />
      {amount > 0 && <Mirror><ellipse cx={14.5} cy={28} rx={id === "rosy" ? 4 : 3.4} ry={2.6} fill="#f0647d" opacity={amount} /></Mirror>}
      <Dots y={22} />
      <Smile y={29.5} w={4.5} />
    </Svg>
  );
}

// ---------------- facial hair ----------------

function FacialHairIcon({ id, c }: { id: string; c: Colors }) {
  const hair = c.hair;
  const shapes: Record<string, ReactNode> = {
    none: null,
    stubble: <path d="M11.5 25C12 36 17.5 41 24 41C30.5 41 36 36 36.5 25C34 31 30 32.5 24 32.5C18 32.5 14 31 11.5 25Z" fill={hair} opacity={0.32} />,
    moustache: <path d="M17 31Q20 27.5 24 29.5Q28 27.5 31 31Q27.5 31.8 24 30.8Q20.5 31.8 17 31Z" {...outlined(hair)} strokeWidth={1.3} />,
    goatee: (
      <>
        <path d="M18 31Q21 28 24 29.8Q27 28 30 31Q27 31.6 24 30.9Q21 31.6 18 31Z" {...outlined(hair)} strokeWidth={1.3} />
        <path d="M20.5 35.5Q24 34.5 27.5 35.5Q27 41 24 41.5Q21 41 20.5 35.5Z" {...outlined(hair)} strokeWidth={1.3} />
      </>
    ),
    short_beard: (
      <>
        <path d="M11 23C11 37 17 41.5 24 41.5C31 41.5 37 37 37 23C35 30 33 35.5 29 35.5Q24 33.5 19 35.5C15 35.5 13 30 11 23Z" {...outlined(hair)} strokeWidth={1.3} />
        <path d="M17.5 31Q21 28 24 29.8Q27 28 30.5 31Q27 31.8 24 30.9Q21 31.8 17.5 31Z" {...outlined(hair)} strokeWidth={1.3} />
      </>
    ),
    full_beard: (
      <>
        <path d="M10 21C9.5 39 16 46 24 46C32 46 38.5 39 38 21C36.5 28 33.5 30 30 30Q24 28 18 30C14.5 30 11.5 28 10 21Z" {...outlined(hair)} strokeWidth={1.3} />
        <path d="M20.5 33.5Q24 35 27.5 33.5" stroke={shade(c.skin, -0.4)} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      </>
    )
  };
  return (
    <Svg>
      <path d="M24 8C31.5 8 37 13.5 37 22C37 34 31 41.5 24 41.5C17 41.5 11 34 11 22C11 13.5 16.5 8 24 8Z" {...outlined(c.skin)} />
      <Dots y={21} r={1.6} />
      {id !== "full_beard" && id !== "short_beard" && id !== "goatee" && id !== "moustache" && <Smile y={33} w={3.5} />}
      {id === "goatee" || id === "moustache" ? <path d="M21.5 33.5Q24 34.6 26.5 33.5" {...line} strokeWidth={1.4} /> : null}
      {shapes[id]}
    </Svg>
  );
}

// ---------------- build & height ----------------

const BUILD_SIZES: Record<string, { s: number; w: number; h: number }> = {
  slim: { s: 12.5, w: 10, h: 11 },
  average: { s: 16, w: 14, h: 15 },
  athletic: { s: 21, w: 13, h: 14 },
  curvy: { s: 15.5, w: 11, h: 20 },
  broad: { s: 23, w: 21, h: 21 }
};

/** A simple standing person (head, arms, top, trousers); head top at y 3.5, feet at y 46. */
function Figure({ build, c, scale = 1 }: { build: string; c: Colors; scale?: number }) {
  const b = BUILD_SIZES[build] ?? BUILD_SIZES.average;
  const legW = b.h / 2 - 0.8;
  const torso = `M${24 - b.s / 2} 17.5Q24 14.5 ${24 + b.s / 2} 17.5L${24 + b.w / 2} 25.5L${24 + b.h / 2} 31H${24 - b.h / 2}L${24 - b.w / 2} 25.5Z`;
  const arm = (side: 1 | -1) => `M${24 + side * (b.s / 2 - 1)} 18.5L${24 + side * (Math.max(b.s, b.h) / 2 + 2)} 30`;
  const pants = shade(c.cloth, -0.35);
  return (
    <g transform={`translate(24 46) scale(${scale}) translate(-24 -46)`}>
      {([-1, 1] as const).map((side) => (
        <g key={side}>
          <path d={arm(side)} stroke={INK} strokeWidth={5.6} strokeLinecap="round" />
          <path d={arm(side)} stroke={c.cloth} strokeWidth={2.4} strokeLinecap="round" />
        </g>
      ))}
      <rect x={24 - b.h / 2} y={29.5} width={legW} height={16.5} rx={2.2} {...outlined(pants)} />
      <rect x={24 + b.h / 2 - legW} y={29.5} width={legW} height={16.5} rx={2.2} {...outlined(pants)} />
      <path d={torso} {...outlined(c.cloth)} />
      <circle cx={24} cy={9} r={5.5} {...outlined(c.skin)} />
    </g>
  );
}

function BuildIcon({ id, c }: { id: string; c: Colors }) {
  return <Svg><Figure build={id} c={c} /></Svg>;
}

function HeightIcon({ id, c, build }: { id: string; c: Colors; build: string }) {
  const scale = id === "short" ? 0.72 : id === "tall" ? 1.04 : 0.88;
  const top = 46 - 42.5 * scale - 1;
  return (
    <Svg>
      <path d="M6 46.5H42" {...line} stroke="#b8c2d3" />
      <path d={`M8 ${top}H40`} stroke="#9fb3d9" strokeWidth={1.2} strokeDasharray="2.5 2.5" />
      <Figure build={build} c={c} scale={scale} />
    </Svg>
  );
}

// ---------------- hairstyles ----------------

function HairIcon({ id, c }: { id: string; c: Colors }) {
  const h = c.hair;
  const hs = outlined(h);
  const back: Record<string, ReactNode> = {
    afro: <circle cx={24} cy={21} r={18} {...hs} />,
    bob: <path d="M8.5 25C8 12 15.5 7.5 24 7.5C32.5 7.5 40 12 39.5 25V35.5Q35 37 32 35H16Q13 37 8.5 35.5Z" {...hs} />,
    long: <path d="M9 24C8 11 16 6.5 24 6.5C32 6.5 40 11 39 24L41.5 46.5H6.5Z" {...hs} />,
    ponytail: <path d="M33 15Q44 17 42.5 30Q41.5 40 37 44Q38.5 34 34 25Z" {...hs} />,
    bun: <circle cx={24} cy={7.5} r={6} {...hs} />,
    pigtails: <><ellipse cx={8} cy={29} rx={4.5} ry={8} {...hs} /><ellipse cx={40} cy={29} rx={4.5} ry={8} {...hs} /></>
  };
  const cap = "M11 26C10 14 16.5 9.5 24 9.5C31.5 9.5 38 14 37 26C35.5 20.5 32 18 28 17.5C24 20 18.5 20 15.5 18.5C13.5 20.5 12 23 11 26Z";
  const front: Record<string, ReactNode> = {
    bald: <path d="M17.5 17Q20 14.5 23 14" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.65} fill="none" />,
    buzz: <path d="M11.5 25C11.5 15.5 17 12 24 12C31 12 36.5 15.5 36.5 25C34 20.5 30 18.5 24 18.5C18 18.5 14 20.5 11.5 25Z" fill={h} opacity={0.6} />,
    short: <path d={cap} {...hs} />,
    side_part: <path d="M11 27C9.5 14 16.5 9 25 9.5C33 9.5 38.5 14.5 37 27C36 21.5 34 19 32 18C27.5 17.5 21 19 16.5 23C14.5 24 12.5 25.5 11 27Z" {...hs} />,
    curly: (
      <g {...hs}>
        {[[12.5, 21], [14.5, 14.5], [19.5, 10.5], [26, 9.5], [32, 12], [35.5, 18], [36, 23.5]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={4.6} />
        ))}
      </g>
    ),
    afro: <path d="M11.5 23C13.5 17.5 18 16 24 16C30 16 34.5 17.5 36.5 23" {...line} stroke={shade(h, -0.3)} />,
    mohawk: (
      <>
        <path d="M11.5 25C11.5 15.5 17 12 24 12C31 12 36.5 15.5 36.5 25C34 20.5 30 18.5 24 18.5C18 18.5 14 20.5 11.5 25Z" fill={h} opacity={0.35} />
        <path d="M20.5 16L21.5 2.5H26.5L27.5 16Q24 17.5 20.5 16Z" {...hs} />
      </>
    ),
    bob: <path d="M11.5 22.5C11.5 14 17 10.5 24 10.5C31 10.5 36.5 14 36.5 22.5C32 18.5 16 18.5 11.5 22.5Z" {...hs} />,
    long: <path d="M11 27C10 15 16 9.5 24 9.5C32 9.5 38 15 37 27C35 20 31 16.5 24 14.5C17 16.5 13 20 11 27Z" {...hs} />,
    ponytail: <path d={cap} {...hs} />,
    bun: <path d={cap} {...hs} />,
    pigtails: <path d="M11 27C10 15 16 9.5 24 9.5C32 9.5 38 15 37 27C35 20 31 16.5 24 14.5C17 16.5 13 20 11 27Z" {...hs} />
  };
  return (
    <Svg>
      {back[id]}
      <circle cx={24} cy={27} r={12.5} {...outlined(c.skin)} />
      <Dots y={29} gap={4.6} r={1.4} />
      {front[id]}
    </Svg>
  );
}

// ---------------- outfits ----------------

function OutfitIcon({ id, c }: { id: string; c: Colors }) {
  const top = outlined(c.cloth);
  const dark = outlined(shade(c.cloth, -0.3));
  const denim = outlined("#4f72a8");
  const shirtWhite = outlined("#f7f8fb");
  const pants = (fill: ReturnType<typeof outlined>, short = false) => (
    <path d={`M15 27H33L34 ${short ? 36 : 45}H26L24 32L22 ${short ? 36 : 45}H14Z`} {...fill} />
  );
  const tee = "M17 6L12 8.5L6.5 15L11 18.5L15 15.5V28H33V15.5L37 18.5L41.5 15L36 8.5L31 6Q24 10.5 17 6Z";
  const longSleeve = "M17 6L11.5 8.5L6 24L11 25.5L15 16V28.5H33V16L37 25.5L42 24L36.5 8.5L31 6Q24 10 17 6Z";
  switch (id) {
    case "hoodie":
      return (
        <Svg>
          {pants(denim)}
          <path d={longSleeve} {...top} />
          <path d="M17 6Q18 1.5 24 1.5Q30 1.5 31 6Q24 12 17 6Z" {...dark} />
          <path d="M18.5 21H29.5L28 27H20Z" {...dark} />
          <path d="M21.5 9V14M26.5 9V14" {...line} />
        </Svg>
      );
    case "sweater_skirt":
      return (
        <Svg>
          <path d="M15.5 26H32.5L37 42H11Z" {...dark} />
          <path d={longSleeve} {...top} />
          <path d="M15 26H33" {...line} />
          <path d="M20 6.5Q24 9.5 28 6.5" {...line} />
        </Svg>
      );
    case "dress":
      return (
        <Svg>
          <path d="M18.5 4L20 9Q24 11 28 9L29.5 4M17.5 9L15 21Q11.5 32 9 44H39Q36.5 32 33 21L30.5 9Q24 13 17.5 9Z" {...top} />
          <path d="M15.5 20H32.5" {...line} />
        </Svg>
      );
    case "suit":
      return (
        <Svg>
          {pants(dark)}
          <path d={longSleeve} {...top} />
          <path d="M19 6.5L24 17L29 6.5Z" {...shirtWhite} />
          <path d="M24 9.5L22.5 12L24 22L25.5 12Z" fill="#c8323c" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M19 6.5L21 14L18.5 15.5L24 28M29 6.5L27 14L29.5 15.5L24 28" {...line} />
        </Svg>
      );
    case "overalls":
      return (
        <Svg>
          <path d={tee} {...shirtWhite} />
          <path d="M15 27H33L34 45H26L24 32L22 45H14Z" {...top} />
          <path d="M17 14H31V28H17Z" {...top} />
          <path d="M17.5 14L16 6.5M30.5 14L32 6.5" {...line} strokeWidth={2.4} />
          <circle cx={19} cy={16} r={1} fill={INK} />
          <circle cx={29} cy={16} r={1} fill={INK} />
          <path d="M21 19H27V23H21Z" {...line} strokeWidth={1.2} />
        </Svg>
      );
    case "tracksuit":
      return (
        <Svg>
          {pants(top)}
          <path d={longSleeve} {...top} />
          <path d="M24 9V28M9 13L7.5 23.5M39 13L40.5 23.5M18.5 29L16.5 44M29.5 29L31.5 44" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
          <path d="M24 9V28" {...line} strokeWidth={1.2} />
          <path d="M20 5.5L24 9L28 5.5" {...line} />
        </Svg>
      );
    case "shirt_shorts":
      return (
        <Svg>
          {pants(outlined("#c9b48a"), true)}
          <path d={tee} {...top} />
          <path d="M18 6L21.5 11L24 8.5L26.5 11L30 6" {...outlined(shade(c.cloth, 0.35))} />
          <path d="M24 9V28" {...line} strokeWidth={1.2} />
          <circle cx={24} cy={15} r={0.9} fill={INK} />
          <circle cx={24} cy={21} r={0.9} fill={INK} />
        </Svg>
      );
    case "tshirt_jeans":
    default:
      return (
        <Svg>
          {pants(denim)}
          <path d={tee} {...top} />
          <path d="M20 6.8Q24 10 28 6.8" {...line} />
        </Svg>
      );
  }
}

// ---------------- accessories ----------------

function AccessoryIcon({ id, c }: { id: string; c: Colors }) {
  const hairCap = <path d="M11.5 24C10.5 14 16.5 10 24 10C31.5 10 37.5 14 36.5 24C34 19.5 30 17.5 24 17.5C18 17.5 14 19.5 11.5 24Z" {...outlined(c.hair)} />;
  const items: Record<string, ReactNode> = {
    none: null,
    round_glasses: <><circle cx={18.5} cy={27} r={4.6} {...line} /><circle cx={29.5} cy={27} r={4.6} {...line} /><path d="M23 26.5Q24 25.5 25 26.5M13.9 26L11 24.5M34.1 26L37 24.5" {...line} /></>,
    square_glasses: <><rect x={13} y={23} width={10} height={8} rx={2} {...line} /><rect x={25} y={23} width={10} height={8} rx={2} {...line} /><path d="M23 26H25M13 25L11 24M35 25L37 24" {...line} /></>,
    sunglasses: <><path d="M12.5 23.5H23V27Q23 31.5 18 31.5Q12.5 31.5 12.5 27Z" {...outlined("#252a35")} /><path d="M25 23.5H35.5V27Q35.5 31.5 30 31.5Q25 31.5 25 27Z" {...outlined("#252a35")} /><path d="M23 25H25M12.5 24L11 23.5M35.5 24L37 23.5" {...line} /><path d="M15 25.5L17 25" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" opacity={0.7} /></>,
    cap: <><path d="M11 22C11 12 17 8 24 8C31 8 37 12 37 22Z" {...outlined(c.cloth)} /><path d="M24 22H43Q42 26 36 25.5H24Z" {...outlined(shade(c.cloth, -0.25))} /><circle cx={24} cy={8.5} r={1.3} fill={INK} /></>,
    beanie: <><path d="M11.5 21C11.5 11 17 6.5 24 6.5C31 6.5 36.5 11 36.5 21Z" {...outlined(c.cloth)} /><rect x={10} y={18.5} width={28} height={5.5} rx={2.5} {...outlined(shade(c.cloth, -0.2))} /><circle cx={24} cy={5} r={3} {...outlined(shade(c.cloth, 0.3))} /></>,
    headphones: <><path d="M9.5 27Q8.5 7 24 7Q39.5 7 38.5 27" {...line} strokeWidth={2.6} /><rect x={6.5} y={23} width={6.5} height={10} rx={3} {...outlined("#444b5a")} /><rect x={35} y={23} width={6.5} height={10} rx={3} {...outlined("#444b5a")} /></>,
    flower: (
      <g transform="translate(34 15)">
        {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={0} cy={-3.6} rx={2.6} ry={3.4} transform={`rotate(${a})`} fill="#f58bb0" stroke={INK} strokeWidth={1.1} />)}
        <circle r={2.1} fill="#f7c948" stroke={INK} strokeWidth={1.1} />
      </g>
    ),
    earrings: <><circle cx={11} cy={29} r={2.4} {...outlined(c.skin)} /><circle cx={37} cy={29} r={2.4} {...outlined(c.skin)} /><circle cx={11} cy={34.5} r={2.6} fill="none" stroke="#d9a520" strokeWidth={1.8} /><circle cx={37} cy={34.5} r={2.6} fill="none" stroke="#d9a520" strokeWidth={1.8} /></>
  };
  const hidesHair = id === "cap" || id === "beanie";
  return (
    <Svg>
      <circle cx={24} cy={26} r={13} {...outlined(c.skin)} />
      {!hidesHair && hairCap}
      {id !== "sunglasses" && <Dots y={27} gap={5.5} r={1.4} />}
      <Smile y={33} w={3} />
      {items[id]}
      {id === "none" && <path d="M33 37L41 45M41 37L33 45" stroke="#a3aec0" strokeWidth={SW} strokeLinecap="round" />}
    </Svg>
  );
}

/** The picture for one option of one look field, drawn with the look's current colours. */
export function FeatureIcon({ field, id, look }: { field: keyof Appearance; id: string; look: Appearance }) {
  const c = colorsOf(look);
  switch (field) {
    case "faceShape": return <FaceShapeIcon id={id} c={c} />;
    case "face": return <ExpressionIcon id={id} c={c} />;
    case "eyeShape": return <EyeShapeIcon id={id} c={c} />;
    case "lashes": return <LashesIcon id={id} c={c} eyeShape={look.eyeShape} />;
    case "brows": return <BrowsIcon id={id} c={c} />;
    case "nose": return <NoseIcon id={id} c={c} />;
    case "mouth": return <MouthIcon id={id} c={c} />;
    case "blush": return <BlushIcon id={id} c={c} />;
    case "facialHair": return <FacialHairIcon id={id} c={c} />;
    case "build": return <BuildIcon id={id} c={c} />;
    case "height": return <HeightIcon id={id} c={c} build={look.build} />;
    case "hair": return <HairIcon id={id} c={c} />;
    case "outfit": return <OutfitIcon id={id} c={c} />;
    case "accessory": return <AccessoryIcon id={id} c={c} />;
    default: return null;
  }
}
