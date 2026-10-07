"use client";

/**
 * CaptionBar — reality-show subtitles: who's talking and what they said.
 * Each new line (twinId + text) re-mounts and slides in.
 * The parent decides placement; this only renders the card.
 */

import type { CSSProperties } from "react";
import { C, FONT, card, caps } from "./theme";

const CSS = `
@keyframes hud-caption-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.hud-caption { animation: hud-caption-in 260ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .hud-caption { animation: none; } }
`;

export function CaptionBar({
  caption,
  style
}: {
  caption: { twinId: string; name: string; color: string; text: string } | null;
  style?: CSSProperties;
}) {
  if (!caption) return null;
  return (
    <>
      <style>{CSS}</style>
      <div
        key={`${caption.twinId}:${caption.text}`}
        className="hud-caption"
        aria-live="polite"
        style={{
          ...card, borderLeft: `4px solid ${caption.color}`, padding: "10px 16px", fontFamily: FONT,
          width: "min(520px, calc(100vw - 32px))", boxSizing: "border-box", ...style
        }}
      >
        <div style={{ ...caps, color: caption.color, marginBottom: 3 }}>● {caption.name}</div>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: C.text }}>{caption.text}</div>
      </div>
    </>
  );
}
