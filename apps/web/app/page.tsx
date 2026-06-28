"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { WorldState } from "@aivillage/shared";

const WorldCanvas = dynamic(() => import("../components/WorldCanvas"), { ssr: false });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function Page() {
  const [state, setState] = useState<WorldState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${API}/api/world`);
    setState((await r.json()) as WorldState);
  }, []);

  useEffect(() => {
    load().catch(() => setState(null));
  }, [load]);

  const liveADay = async () => {
    setBusy(true);
    try {
      await fetch(`${API}/api/run-day`, { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <div style={{ position: "fixed", top: 18, left: 22, zIndex: 10, color: "#eaf0ff", fontSize: 18, opacity: 0.9 }}>
        AiVillage <span style={{ color: "#5be0c8", fontSize: 11 }}>● LIVE</span>
        <span style={{ color: "#7f93c4", fontSize: 11, marginLeft: 8 }}>from the database</span>
      </div>

      <button
        onClick={liveADay}
        disabled={busy}
        style={{
          position: "fixed", top: 16, right: 22, zIndex: 10,
          background: busy ? "#1c2740" : "#16314f", color: "#9fd9ff",
          border: "1px solid #2f63a0", borderRadius: 8, padding: "8px 14px",
          fontFamily: "monospace", fontSize: 13, cursor: busy ? "default" : "pointer"
        }}
      >
        {busy ? "living a day…" : "▶ Live a day"}
      </button>

      {state ? (
        <WorldCanvas state={state} />
      ) : (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7f93c4", fontFamily: "monospace" }}>
          Loading village…
        </div>
      )}
    </main>
  );
}
