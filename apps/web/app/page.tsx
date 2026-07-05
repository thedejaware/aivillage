"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { WorldState, Twin, Memory, Approval } from "@aivillage/shared";

const WorldCanvas = dynamic(() => import("../components/WorldCanvas"), { ssr: false });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const QUIET_FRAME_MS = 1100;

/** One line on the TV caption bar (reality-show subtitles). */
interface Caption {
  twinId: string;
  name: string;
  color: string;
  text: string;
}

const hexColor = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** Reading time scaled to line length: 2s floor, 7s ceiling. */
const captionDur = (text: string) => Math.min(7000, Math.max(2000, 1200 + text.length * 45));

interface Panel {
  twin: Twin | null;
  memories: Memory[];
  approvals: Approval[];
  relationships?: { name: string; label: string; score: number }[];
  leaderboard?: { twinId: string; name: string; popularity: number }[];
}

function approvalText(a: Approval): React.ReactNode {
  if ("projectType" in a.payload) {
    return (
      <>
        Your twin wants to build a <b style={{ color: "#9fd9ff" }}>{a.payload.projectType.replace(/_/g, " ")}</b> at{" "}
        {a.payload.zone.replace(/_/g, " ")}.
      </>
    );
  }
  const t = <b style={{ color: "#9fd9ff" }}>{a.payload.targetName}</b>;
  switch (a.payload.move) {
    case "confront":
      return <>Your twin wants to publicly <b style={{ color: "#ff8a9c" }}>confront</b> {t}. Let it happen?</>;
    case "confess":
      return <>Your twin wants to tell {t} they are its <b style={{ color: "#7fe0a8" }}>best friend</b>. Allow it?</>;
    case "party":
      return <>Your twin wants to throw a <b style={{ color: "#ffd166" }}>party</b> in {t}&apos;s honour. Fund the fun?</>;
    case "reconcile":
      return <>Your twin wants to <b style={{ color: "#7fe0a8" }}>make peace</b> with {t}. Bury the hatchet?</>;
    default:
      return <>Your twin is planning something involving {t}.</>;
  }
}

const labelColor = (label: string) =>
  label === "nemesis" || label === "rival" ? "#ff8a9c" : label === "acquaintance" ? "#8fa8d8" : "#7fe0a8";

const mono: React.CSSProperties = { fontFamily: "monospace" };

export default function Page() {
  const [state, setState] = useState<WorldState | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [myTwinId, setMyTwinId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState({ name: "", personality: "", goal: "" });
  const [creating, setCreating] = useState(false);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const playGen = useRef(0);
  const stateRef = useRef<WorldState | null>(null);
  stateRef.current = state;

  const refreshPanel = useCallback(async () => {
    const uid = localStorage.getItem("aiv.userId");
    if (!uid) return;
    try {
      const r = await fetch(`${API}/api/me?userId=${encodeURIComponent(uid)}`);
      setPanel((await r.json()) as Panel);
    } catch {
      /* panel refresh is best-effort */
    }
  }, []);

  useEffect(() => {
    setUserId(localStorage.getItem("aiv.userId"));
    setMyTwinId(localStorage.getItem("aiv.twinId"));
  }, []);

  useEffect(() => {
    if (userId) refreshPanel();
  }, [userId, refreshPanel]);

  /**
   * Episode playback: frames advance the world; every NEW spoken line plays
   * one at a time on the TV caption bar while its speaker shows a 💬 marker.
   */
  const playEpisode = useCallback(
    async (frames: WorldState[]) => {
      const gen = ++playGen.current;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const prevSay: Record<string, string | null> = {};
      for (const t of stateRef.current?.twins ?? []) prevSay[t.id] = t.say;

      for (const f of frames) {
        if (playGen.current !== gen) return;
        setState(f);
        const fresh = f.twins.filter((t) => t.say && t.say !== prevSay[t.id]);
        for (const t of f.twins) prevSay[t.id] = t.say;
        if (fresh.length === 0) {
          await sleep(QUIET_FRAME_MS);
          continue;
        }
        for (const t of fresh) {
          if (playGen.current !== gen) return;
          setCaption({ twinId: t.id, name: t.name, color: hexColor(t.colorHex), text: t.say! });
          setSpeakingId(t.id);
          await sleep(captionDur(t.say!));
        }
      }
      if (playGen.current !== gen) return;
      setCaption(null);
      setSpeakingId(null);
      refreshPanel();
    },
    [refreshPanel]
  );

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("world", (w: WorldState) => setState(w));
    socket.on("day", ({ frames }: { frames: WorldState[] }) => {
      void playEpisode(frames);
    });
    return () => {
      playGen.current += 1; // cancel any in-flight playback
      socket.disconnect();
    };
  }, [playEpisode]);

  const liveADay = async () => {
    setBusy(true);
    try {
      await fetch(`${API}/api/run-day`, { method: "POST" });
    } finally {
      setBusy(false);
    }
  };

  const createTwin = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/twins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await r.json()) as { userId?: string; twinId?: string; error?: string };
      if (data.userId) {
        localStorage.setItem("aiv.userId", data.userId);
        localStorage.setItem("aiv.twinId", data.twinId ?? "");
        setUserId(data.userId);
        setMyTwinId(data.twinId ?? null);
      }
    } finally {
      setCreating(false);
    }
  };

  const resolveApproval = async (id: string, approve: boolean) => {
    await fetch(`${API}/api/approvals/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve })
    });
    await refreshPanel();
  };

  return (
    <main>
      <div style={{ position: "fixed", top: 18, left: 22, zIndex: 10, color: "#eaf0ff", fontSize: 18, opacity: 0.9, ...mono }}>
        AiVillage <span style={{ color: live ? "#5be0c8" : "#7f93c4", fontSize: 11 }}>● {live ? "LIVE" : "…"}</span>
      </div>

      {state ? (
        <WorldCanvas state={state} myTwinId={myTwinId} speakingTwinId={speakingId} />
      ) : (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7f93c4", ...mono }}>
          Connecting to the village…
        </div>
      )}

      {/* ---- TV caption bar (reality-show subtitles) ---- */}
      {caption && (
        <div
          key={`${caption.twinId}:${caption.text}`}
          style={{
            position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
            zIndex: 11, width: "min(660px, 82vw)", boxSizing: "border-box",
            background: "rgba(7,11,22,0.95)", border: "1px solid #24365c",
            borderLeft: `3px solid ${caption.color}`, borderRadius: 10,
            padding: "10px 16px 11px", boxShadow: "0 6px 24px rgba(0,0,0,0.5)", ...mono
          }}
        >
          <div style={{ color: caption.color, fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
            ● {caption.name.toUpperCase()}
          </div>
          <div style={{ color: "#e6edf7", fontSize: 13, lineHeight: 1.45 }}>{caption.text}</div>
        </div>
      )}

      {/* ---- owner side panel ---- */}
      <div
        style={{
          position: "fixed", top: 16, right: 16, zIndex: 10, width: 300,
          background: "rgba(7,11,22,0.92)", border: "1px solid #24365c", borderRadius: 10,
          padding: 14, color: "#c3d2f0", fontSize: 12, lineHeight: 1.5, ...mono,
          maxHeight: "calc(100vh - 40px)", overflowY: "auto"
        }}
      >
        {!userId ? (
          <>
            <div style={{ color: "#eaf0ff", fontSize: 14, marginBottom: 4 }}>Create your twin</div>
            <div style={{ color: "#7f93c4", marginBottom: 10 }}>
              It will live among the others — making friends, rivals and drama — and ask you before its big moves.
            </div>
            <input
              placeholder="Name (e.g. Memo)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Personality (e.g. charming gossip)"
              value={form.personality}
              onChange={(e) => setForm({ ...form, personality: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Goal (e.g. become the most loved in the village)"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              style={inputStyle}
            />
            <button onClick={createTwin} disabled={creating || !form.name.trim()} style={{ ...btnStyle, width: "100%", marginTop: 4 }}>
              {creating ? "creating…" : "✨ Enter the village"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ color: "#eaf0ff", fontSize: 14 }}>
                {panel?.twin ? `🧍 ${panel.twin.name}` : "Your twin"}
              </div>
              <button onClick={liveADay} disabled={busy} style={btnStyle}>
                {busy ? "living…" : "▶ Live a day"}
              </button>
            </div>

            {panel?.twin && (
              <div style={{ color: "#7f93c4", marginBottom: 10 }}>
                {panel.twin.goals[0] ? `goal: ${panel.twin.goals[0]}` : ""}
                {" · "}rep {panel.twin.reputation}
              </div>
            )}

            {panel && panel.approvals.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#ffd166", marginBottom: 6 }}>Needs your decision</div>
                {panel.approvals.map((a) => (
                  <div key={a.id} style={{ background: "#101a30", border: "1px solid #3a5a9a", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <div style={{ marginBottom: 8 }}>{approvalText(a)}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => resolveApproval(a.id, true)} style={{ ...btnStyle, background: "#143c26", borderColor: "#2e7d4f", color: "#7fe0a8" }}>
                        ✓ Approve
                      </button>
                      <button onClick={() => resolveApproval(a.id, false)} style={{ ...btnStyle, background: "#3c1420", borderColor: "#7d2e42", color: "#ff8a9c" }}>
                        ✕ Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panel && (panel.leaderboard?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#7f93c4", marginBottom: 6 }}>🏆 Village standings</div>
                {panel.leaderboard!.map((row, i) => {
                  const mine = row.twinId === myTwinId;
                  return (
                    <div key={row.twinId} style={{ display: "flex", justifyContent: "space-between", padding: "2px 6px", borderRadius: 4, background: mine ? "#16314f" : "transparent", color: mine ? "#9fd9ff" : "#a9bce0" }}>
                      <span>{i + 1}. {row.name}{mine ? " ← you" : ""}</span>
                      <span style={{ color: row.popularity < 0 ? "#ff8a9c" : "#7fe0a8" }}>{row.popularity}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {panel && (panel.relationships?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#7f93c4", marginBottom: 6 }}>Friends &amp; rivals</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {panel.relationships!.map((r) => (
                    <span key={r.name} style={{ border: `1px solid ${labelColor(r.label)}`, color: labelColor(r.label), borderRadius: 12, padding: "2px 8px", fontSize: 11 }}>
                      {r.name} · {r.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ color: "#7f93c4", marginBottom: 6 }}>While you were away</div>
            {panel && panel.memories.length > 0 ? (
              panel.memories.map((m) => (
                <div key={m.id} style={{ borderLeft: "2px solid #24365c", paddingLeft: 8, marginBottom: 6, color: "#a9bce0" }}>
                  {m.content}
                </div>
              ))
            ) : (
              <div style={{ color: "#5e729c" }}>Nothing yet — press “Live a day”.</div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "8px 10px",
  background: "#0c1526", border: "1px solid #24365c", borderRadius: 6,
  color: "#eaf0ff", fontFamily: "monospace", fontSize: 12, outline: "none"
};

const btnStyle: React.CSSProperties = {
  background: "#16314f", color: "#9fd9ff", border: "1px solid #2f63a0",
  borderRadius: 7, padding: "6px 12px", fontFamily: "monospace", fontSize: 12, cursor: "pointer"
};
