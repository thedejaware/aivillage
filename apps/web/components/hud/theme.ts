/**
 * HUD design tokens — the light "WareTrack" look: floating white cards over
 * the bright 3D village. Every HUD panel pulls its colours and shapes from here.
 */

import type { CSSProperties } from "react";

export type Tone = "blue" | "green" | "amber" | "red" | "grey";

export const C = {
  text: "#1b2433",
  muted: "#6b7a90",
  faint: "#a3aec0",
  line: "rgba(20,40,80,0.08)",
  border: "rgba(20,40,80,0.06)",
  card: "rgba(255,255,255,0.92)",
  blue: "#2f6bff",
  blueSoft: "#eaf0ff",
  green: "#22a861",
  greenSoft: "#e6f6ec",
  amber: "#d9822b",
  amberSoft: "#fff3e2",
  red: "#e5484d",
  redSoft: "#fdecec",
  grey: "#6b7a90",
  greySoft: "#f1f4f9"
} as const;

export const RADIUS = 14;
export const SHADOW = "0 8px 28px rgba(20,40,80,0.14)";
export const FONT = "var(--font-ui), Inter, system-ui, sans-serif";

// Stacking order for the HUD layer (the 3D canvas sits below 10).
export const Z = { card: 20, chat: 22, overlay: 30 } as const;

const TONES: Record<Tone, { fg: string; bg: string }> = {
  blue: { fg: C.blue, bg: C.blueSoft },
  green: { fg: C.green, bg: C.greenSoft },
  amber: { fg: C.amber, bg: C.amberSoft },
  red: { fg: C.red, bg: C.redSoft },
  grey: { fg: C.grey, bg: C.greySoft }
};

export function toneColors(tone: Tone): { fg: string; bg: string } {
  return TONES[tone];
}

/** The floating white card every panel is built on. */
export const card: CSSProperties = {
  background: C.card,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS,
  boxShadow: SHADOW,
  color: C.text,
  fontFamily: FONT
};

/** Pill-shaped status badge in a tone. */
export function pill(tone: Tone): CSSProperties {
  const t = TONES[tone];
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 9px", borderRadius: 999,
    background: t.bg, color: t.fg,
    fontSize: 11, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap"
  };
}

/** Small caps label ("YOUR TWIN", section titles). */
export const caps: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase"
};

/** Small square icon button (close, focus, collapse). */
export const iconButton: CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.greySoft, color: C.muted, cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 13, lineHeight: 1, padding: 0, fontFamily: FONT
};

/** 0xRRGGBB → "#rrggbb". */
export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** "3m ago" style relative time; empty on bad input. */
export function relTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Thin progress bar (value 0..1). */
export function barStyle(value: number, tone: Tone = "blue"): { track: CSSProperties; fill: CSSProperties } {
  const v = Math.max(0, Math.min(1, value));
  return {
    track: { height: 6, borderRadius: 999, background: C.greySoft, overflow: "hidden", flex: 1 },
    fill: { width: `${v * 100}%`, height: "100%", borderRadius: 999, background: TONES[tone].fg, transition: "width 300ms ease" }
  };
}
