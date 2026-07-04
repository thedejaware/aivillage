"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { WorldState, Twin, Memory, Approval } from "@aivillage/shared";

const WorldCanvas = dynamic(() => import("../components/WorldCanvas"), { ssr: false });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const FRAME_MS = 1100;

interface Panel {
  twin: Twin | null;
  memories: Memory[];
  approvals: Approval[];
}

const mono: React.CSSProperties = { fontFamily: "monospace" };

export default function Page() {
  const [state, setState] = useState<WorldState | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState({ name: "", personality: "", goal: "" });
  const [creating, setCreating] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
  }, []);

  useEffect(() => {
    if (userId) refreshPanel();
  }, [userId, refreshPanel]);

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("world", (w: WorldState) => setState(w));
    socket.on("day", ({ frames }: { frames: WorldState[] }) => {
      timers.current.forEach(clearTimeout);
      timers.current = frames.map((f, i) => setTimeout(() => setState(f), i * FRAME_MS));
      // refresh the owner panel once the day has played out
      timers.current.push(setTimeout(() => refreshPanel(), frames.length * FRAME_MS + 400));
    });
    return () => {
      timers.current.forEach(clearTimeout);
      socket.disconnect();
    };
  }, [refreshPanel]);

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
        <WorldCanvas state={state} />
      ) : (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7f93c4", ...mono }}>
          Connecting to the village…
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
              It will live in the village, work toward your goal, and ask you before big decisions.
            </div>
            <input
              placeholder="Name (e.g. Memo)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Personality (e.g. curious builder)"
              value={form.personality}
              onChange={(e) => setForm({ ...form, personality: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Goal (e.g. build a grand arcade)"
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
                    <div style={{ marginBottom: 8 }}>
                      Your twin wants to build a <b style={{ color: "#9fd9ff" }}>{a.payload.projectType.replace(/_/g, " ")}</b> at{" "}
                      {a.payload.zone.replace(/_/g, " ")}.
                    </div>
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
