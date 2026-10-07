"use client";

/**
 * VillagerList — WareTrack's bottom-right tabbed list: every villager (with
 * where they are and what they're up to) and the four venues with headcounts.
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ZONE_DISPLAY, ZONE_TAGLINE } from "@aivillage/shared";
import { C, FONT, Z, card, hex, iconButton, pill, type Tone } from "./theme";

export interface VillagerRow {
  id: string;
  name: string;
  colorHex: number;
  zoneLabel: string;
  status: string;
  tone: Tone;
  isMine: boolean;
  popularity?: number;
}

const ROW_H = 52;

// Width stays clear of the bottom-center lane (≤520px) on screens ≥ 1100px.
const CSS = `
.hud-vlist { width: min(340px, calc(100vw - 32px)); }
@media (min-width: 1100px) { .hud-vlist { width: clamp(260px, calc(50vw - 300px), 340px); } }
@media (max-width: 759px) { .hud-vlist { width: min(280px, calc(100vw - 32px)); } }
.hud-vrow:hover { background: #f6f8fc; }
.hud-vrow:focus-visible { outline: 2px solid ${C.blue}; outline-offset: -2px; }
`;

type Tab = "villagers" | "venues";

export function VillagerList({
  villagers,
  selectedId,
  onSelect,
  style
}: {
  villagers: VillagerRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  style?: CSSProperties;
}) {
  const [tab, setTab] = useState<Tab>("villagers");
  const [open, setOpen] = useState(true);

  // start collapsed on phones so the list doesn't bury the village
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 759px)").matches) setOpen(false);
  }, []);

  const venues = useMemo(
    () =>
      Object.entries(ZONE_DISPLAY).map(([zone, label]) => {
        const here = villagers.filter((v) => v.zoneLabel === label);
        return { zone, label, tagline: ZONE_TAGLINE[zone] ?? "", count: here.length, names: here.map((v) => v.name) };
      }),
    [villagers]
  );

  const tabBtn = (t: Tab): CSSProperties => ({
    background: "transparent", border: "none", padding: "4px 0", cursor: "pointer", fontFamily: FONT,
    fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? C.text : C.muted,
    borderBottom: `2px solid ${tab === t ? C.blue : "transparent"}`
  });

  return (
    <section
      className="hud-vlist"
      aria-label="Villagers"
      style={{
        ...card, position: "fixed", right: 16, bottom: 16, zIndex: Z.card,
        boxSizing: "border-box", overflow: "hidden", fontFamily: FONT, ...style
      }}
    >
      <style>{CSS}</style>

      {/* header: tabs + collapse toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 12px 8px 16px", borderBottom: open ? `1px solid ${C.line}` : "none" }}>
        <div role="tablist" style={{ display: "flex", gap: 16, flex: 1 }}>
          <button role="tab" aria-selected={tab === "villagers"} type="button" onClick={() => { setTab("villagers"); setOpen(true); }} style={tabBtn("villagers")}>
            Villagers <span style={{ color: C.muted, fontWeight: 500 }}>{villagers.length}</span>
          </button>
          <button role="tab" aria-selected={tab === "venues"} type="button" onClick={() => { setTab("venues"); setOpen(true); }} style={tabBtn("venues")}>
            Venues <span style={{ color: C.muted, fontWeight: 500 }}>{venues.length}</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Collapse list" : "Expand list"}
          style={{ ...iconButton, width: 26, height: 26 }}
        >
          {open ? "▾" : "▴"}
        </button>
      </div>

      {open && (
        <div role="tabpanel" style={{ maxHeight: ROW_H * 5 + 8, overflowY: "auto", padding: "4px 0" }}>
          {tab === "villagers" ? (
            villagers.length === 0 ? (
              <div style={{ padding: "14px 16px", fontSize: 12, color: C.muted }}>No villagers yet.</div>
            ) : (
              villagers.map((v) => {
                const selected = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="hud-vrow"
                    onClick={() => onSelect(v.id)}
                    aria-pressed={selected}
                    style={{
                      width: "100%", minHeight: ROW_H, display: "flex", alignItems: "center", gap: 10,
                      padding: "6px 12px 6px 16px", border: "none", cursor: "pointer", textAlign: "left",
                      background: selected ? C.blueSoft : "transparent", fontFamily: FONT, color: C.text
                    }}
                  >
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: hex(v.colorHex), flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                        {v.isMine && <span style={{ ...pill("blue"), padding: "1px 6px", fontSize: 10 }}>you</span>}
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.zoneLabel}{typeof v.popularity === "number" ? ` · ★ ${v.popularity}` : ""}
                      </span>
                    </span>
                    <span style={{ ...pill(v.tone), maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{v.status}</span>
                    <span aria-hidden style={{ color: C.faint, fontSize: 16, lineHeight: 1 }}>›</span>
                  </button>
                );
              })
            )
          ) : (
            venues.map((z) => (
              <div key={z.zone} style={{ minHeight: ROW_H, display: "flex", alignItems: "center", gap: 10, padding: "6px 16px" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{z.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {z.names.length > 0 ? z.names.join(", ") : z.tagline}
                  </span>
                </span>
                <span style={pill(z.count > 0 ? "blue" : "grey")}>{z.count} here</span>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
