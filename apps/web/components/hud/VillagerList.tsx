"use client";

/**
 * VillagerList — WareTrack's bottom-right tabbed list: every villager (with
 * where they are and what they're up to), every place with headcounts, and
 * the twins' past talks (newest first).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ZONE_DISPLAY, ZONE_EMOJI, ZONE_TAGLINE, type ConversationView } from "@aivillage/shared";
import { hasOlder, mergeTalks, speakerTwin, talkMeta, talkNames, talksUrl } from "../../lib/hud/talks";
import { C, FONT, Z, card, hex, iconButton, pill, type Tone } from "./theme";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface VillagerRow {
  id: string;
  name: string;
  colorHex: number;
  /** zone id of the place nearest the twin */
  zone?: string;
  zoneLabel: string;
  /** energy below the tired line: shows 😴 */
  tired?: boolean;
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
.hud-tname:hover { text-decoration: underline; }
.hud-tname:focus-visible { outline: 2px solid ${C.blue}; outline-offset: 1px; border-radius: 3px; }
`;

type Tab = "villagers" | "venues" | "talks";

export function VillagerList({
  villagers,
  selectedId,
  onSelect,
  talksVersion = 0,
  style
}: {
  villagers: VillagerRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** bumped by the page each time new frames (and maybe a new talk) arrive */
  talksVersion?: number;
  style?: CSSProperties;
}) {
  const [tab, setTab] = useState<Tab>("villagers");
  const [open, setOpen] = useState(true);
  const viewingTalks = open && tab === "talks";

  // ── talks: newest page on open / on each new day; "Show older" pages on demand
  const [talks, setTalks] = useState<ConversationView[]>([]);
  const [talksStatus, setTalksStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [moreTalks, setMoreTalks] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** newest talk id the owner has seen; null until the first load sets a baseline */
  const [seenTalkId, setSeenTalkId] = useState<string | null>(null);
  const olderLoaded = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const loadNewest = useCallback(async () => {
    setTalksStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const r = await fetch(talksUrl(API));
      if (!r.ok) throw new Error(`talks ${r.status}`);
      const { conversations } = (await r.json()) as { conversations: ConversationView[] };
      if (!alive.current) return;
      setTalks((cur) => mergeTalks(cur, conversations));
      if (!olderLoaded.current) setMoreTalks(hasOlder(conversations.length));
      setSeenTalkId((s) => (s === null ? conversations[0]?.id ?? "" : s));
      setTalksStatus("ready");
    } catch {
      if (alive.current) setTalksStatus((s) => (s === "ready" ? s : "error"));
    }
  }, []);

  const loadOlder = useCallback(async () => {
    const last = talks[talks.length - 1];
    if (!last || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await fetch(talksUrl(API, last.createdAt));
      if (!r.ok) throw new Error(`talks ${r.status}`);
      const { conversations } = (await r.json()) as { conversations: ConversationView[] };
      if (!alive.current) return;
      olderLoaded.current = true;
      setTalks((cur) => mergeTalks(cur, conversations));
      setMoreTalks(hasOlder(conversations.length));
    } catch {
      /* keep the button; the owner can try again */
    } finally {
      if (alive.current) setLoadingOlder(false);
    }
  }, [talks, loadingOlder]);

  // refresh after each played day (and once on mount, as the "seen" baseline)
  useEffect(() => { void loadNewest(); }, [talksVersion, loadNewest]);
  // fetch when the Talks tab opens
  useEffect(() => { if (viewingTalks) void loadNewest(); }, [viewingTalks, loadNewest]);

  const newestTalkId = talks[0]?.id ?? null;
  useEffect(() => {
    if (viewingTalks && newestTalkId) setSeenTalkId(newestTalkId);
  }, [viewingTalks, newestTalkId]);
  const newTalks = !viewingTalks && seenTalkId !== null && newestTalkId !== null && newestTalkId !== seenTalkId;

  // start collapsed on phones so the list doesn't bury the village
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 759px)").matches) setOpen(false);
  }, []);

  const venues = useMemo(
    () =>
      Object.entries(ZONE_DISPLAY).map(([zone, label]) => {
        const here = villagers.filter((v) => (v.zone ? v.zone === zone : v.zoneLabel === label));
        return { zone, label, emoji: ZONE_EMOJI[zone] ?? "📍", tagline: ZONE_TAGLINE[zone] ?? "", count: here.length, names: here.map((v) => v.name) };
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
          <button role="tab" aria-selected={tab === "talks"} type="button" onClick={() => { setTab("talks"); setOpen(true); }} style={{ ...tabBtn("talks"), position: "relative" }}>
            Talks
            {newTalks && (
              <span
                aria-label="new talks"
                title="New talks"
                style={{ position: "absolute", top: 2, right: -8, width: 6, height: 6, borderRadius: 999, background: C.blue }}
              />
            )}
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
          {tab === "talks" ? (
            <TalksPanel
              talks={talks}
              status={talksStatus}
              more={moreTalks}
              loadingOlder={loadingOlder}
              onOlder={() => void loadOlder()}
              onSelect={onSelect}
            />
          ) : tab === "villagers" ? (
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
                        {v.tired && <span title="Tired" aria-label="tired">😴</span>}
                        {v.isMine && <span style={{ ...pill("blue"), padding: "1px 6px", fontSize: 10 }}>you</span>}
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.zone && ZONE_EMOJI[v.zone] ? `${ZONE_EMOJI[v.zone]} ` : ""}{v.zoneLabel}{typeof v.popularity === "number" ? ` · ★ ${v.popularity}` : ""}
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
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{z.emoji} {z.label}</span>
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

const nameBtn: CSSProperties = {
  background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer",
  font: "inherit", fontWeight: 700
};

function TalksPanel({
  talks,
  status,
  more,
  loadingOlder,
  onOlder,
  onSelect
}: {
  talks: ConversationView[];
  status: "idle" | "loading" | "ready" | "error";
  more: boolean;
  loadingOlder: boolean;
  onOlder: () => void;
  onSelect: (id: string) => void;
}) {
  if (talks.length === 0) {
    const msg =
      status === "error" ? "Couldn't load talks." :
      status === "ready" ? "No talks yet — twins chat while the village is open." :
      "Loading talks…";
    return <div style={{ padding: "14px 16px", fontSize: 12, color: C.muted }}>{msg}</div>;
  }
  const now = Date.now();
  return (
    <>
      {talks.map((t, i) => (
        <article
          key={t.id}
          style={{
            padding: "8px 16px", fontSize: 12.5, lineHeight: 1.4, color: C.text,
            borderTop: i === 0 ? "none" : `1px solid ${C.line}`,
            overflowWrap: "anywhere", wordBreak: "break-word"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>
              {talkNames(t).map((n) => (
                <span key={n.id}>
                  {n.sep}
                  <button type="button" className="hud-tname" onClick={() => onSelect(n.id)} style={{ ...nameBtn, color: n.color }}>
                    {n.name}
                  </button>
                </span>
              ))}
            </span>
            {t.kind === "talk" && <span style={{ ...pill("blue"), padding: "1px 6px", fontSize: 10 }}>your order</span>}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>{talkMeta(t, now)}</div>
          {t.kind === "bigmove" ? (
            t.lines.map((l, j) => (
              <div key={j} style={{ fontStyle: "italic" }}>🎬 {l.text}</div>
            ))
          ) : (
            t.lines.map((l, j) => {
              const who = speakerTwin(t, l.speaker);
              return (
                <div key={j}>
                  {who ? (
                    <button type="button" className="hud-tname" onClick={() => onSelect(who.id)} style={{ ...nameBtn, color: hex(who.colorHex) }}>
                      {l.speaker}
                    </button>
                  ) : (
                    <b>{l.speaker}</b>
                  )}
                  : {l.text}
                </div>
              );
            })
          )}
          {t.moment && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>✨ {t.moment}</div>}
        </article>
      ))}
      {more && (
        <div style={{ padding: "6px 16px 8px" }}>
          <button
            type="button"
            onClick={onOlder}
            disabled={loadingOlder}
            style={{
              width: "100%", padding: "6px 0", borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.greySoft, color: C.muted, fontFamily: FONT, fontSize: 12, fontWeight: 600,
              cursor: loadingOlder ? "default" : "pointer"
            }}
          >
            {loadingOlder ? "Loading…" : "Show older"}
          </button>
        </div>
      )}
    </>
  );
}
