"use client";

/**
 * StatCards — WareTrack's top-left row of village stats (icon tile, label,
 * big number, small delta). On narrow screens only the first card stays.
 */

import type { CSSProperties } from "react";
import { C, FONT, Z, card, toneColors } from "./theme";

export interface StatCardItem {
  key: string;
  /** an emoji, shown in a soft blue rounded tile */
  icon: string;
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; tone: "green" | "red" | "grey" };
}

const CSS = `
@media (max-width: 759px) {
  .hud-stat:not(:first-child) { display: none !important; }
}
`;

export function StatCards({ stats, style }: { stats: StatCardItem[]; style?: CSSProperties }) {
  if (stats.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed", top: 80, left: 16, zIndex: Z.card,
        display: "flex", gap: 12, fontFamily: FONT, pointerEvents: "none", ...style
      }}
    >
      <style>{CSS}</style>
      {stats.map((s) => (
        <div
          key={s.key}
          className="hud-stat"
          style={{ ...card, pointerEvents: "auto", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px 12px 12px", minWidth: 150 }}
        >
          <div
            aria-hidden
            style={{
              width: 40, height: 40, borderRadius: 10, background: C.blueSoft, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20
            }}
          >
            {s.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{s.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{s.value}</span>
              {s.sub && <span style={{ fontSize: 12, color: C.muted }}>{s.sub}</span>}
            </div>
            {s.delta && (
              <div style={{ fontSize: 11, fontWeight: 600, color: toneColors(s.delta.tone).fg, whiteSpace: "nowrap" }}>
                {s.delta.text}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
