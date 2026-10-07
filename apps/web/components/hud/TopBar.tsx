"use client";

/**
 * TopBar — WareTrack's header: brand, a search that jumps to any villager,
 * the live village clock, and the owner's twin.
 */
import { useEffect, useMemo, useState } from "react";
import { villageClock } from "../../lib/village/clock";
import { C, FONT, Z, card, hex } from "./theme";

export interface SearchItem { id: string; name: string; colorHex: number; sub: string; }

export function TopBar({
  live,
  items,
  onPick,
  me
}: {
  live: boolean;
  items: SearchItem[];
  onPick: (id: string) => void;
  /** the owner's twin, if they have one */
  me: { name: string; colorHex: number } | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // client-only: a server-rendered time would never match the browser's (hydration error)
  const [clock, setClock] = useState("--:--");

  useEffect(() => {
    setClock(villageClock(Date.now()));
    const h = setInterval(() => setClock(villageClock(Date.now())), 1000);
    return () => clearInterval(h);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items).slice(0, 6);
  }, [items, query]);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <header
      style={{
        position: "fixed", top: 12, left: 16, right: 16, zIndex: Z.overlay, height: 56,
        display: "flex", alignItems: "center", gap: 14, padding: "0 12px 0 14px", ...card
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg, ${C.blue}, #6f9bff)`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
            boxShadow: "0 4px 12px rgba(47,107,255,0.35)"
          }}
        >
          🏘️
        </div>
        <span className="hud-topbar-brand" style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em" }}>AiVillage</span>
      </div>

      <div style={{ position: "relative", flex: "1 1 auto", maxWidth: 520 }}>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches[0]) pick(matches[0].id);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search villagers…"
          aria-label="Search villagers"
          style={{
            width: "100%", height: 38, borderRadius: 10, border: `1px solid ${C.line}`, background: "#f6f8fc",
            padding: "0 12px 0 34px", fontSize: 13.5, color: C.text, outline: "none", fontFamily: FONT
          }}
        />
        <span style={{ position: "absolute", left: 12, top: 10, fontSize: 14, color: C.faint, pointerEvents: "none" }}>⌕</span>
        {open && matches.length > 0 && (
          <div style={{ position: "absolute", top: 44, left: 0, right: 0, padding: 6, ...card }}>
            {matches.map((m) => (
              <button
                key={m.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", border: "none",
                  background: "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: FONT
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: 9, background: hex(m.colorHex) }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.name}</span>
                <span style={{ fontSize: 12, color: C.muted, marginLeft: "auto" }}>{m.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span
          title={live ? "Connected — the village is live" : "Reconnecting…"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999,
            background: live ? C.greenSoft : C.greySoft, color: live ? C.green : C.muted, fontSize: 13, fontWeight: 600
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 8, background: live ? C.green : C.faint }} />
          {live ? "Live" : "…"} <span style={{ color: C.text, fontVariantNumeric: "tabular-nums" }}>{clock}</span>
        </span>
        {me && (
          <div className="hud-topbar-me" style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 12, borderLeft: `1px solid ${C.line}` }}>
            <div
              style={{
                width: 34, height: 34, borderRadius: 34, background: hex(me.colorHex), color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14
              }}
            >
              {me.name.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{me.name}</div>
              <div style={{ fontSize: 11.5, color: C.muted }}>Your twin</div>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 759px) { .hud-topbar-brand, .hud-topbar-me { display: none !important; } }
      `}</style>
    </header>
  );
}
