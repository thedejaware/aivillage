"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { C, FONT } from "../../components/hud/theme";
import { PageShell, buttonStyle, helpText } from "../../components/settings/ui";
import TwinManager from "../../components/settings/TwinManager";
import AiSettingsForm from "../../components/settings/AiSettingsForm";

type Tab = "twins" | "ai";
const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "twins", label: "Twins", emoji: "🧑‍🤝‍🧑" },
  { id: "ai", label: "AI model", emoji: "✨" }
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("twins");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // /settings?tab=ai (or #ai) opens the AI tab directly; the default is Twins
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q === "ai" || window.location.hash === "#ai") setTab("ai");
  }, []);

  const choose = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "ai" ? "?tab=ai" : window.location.pathname);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + TABS.length) % TABS.length;
    choose(TABS[next].id);
    refs.current[next]?.focus();
  };

  return (
    <PageShell>
      <header style={{ display: "grid", gap: 18, marginBottom: 22 }}>
        <div>
          <Link href="/" className="av-btn" style={{ ...buttonStyle("secondary", "sm") }}>
            ← Back to the village
          </Link>
        </div>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Settings</h1>
          <p style={{ ...helpText, marginTop: 6, fontSize: 15 }}>Your twins, and the AI that makes them think.</p>
        </div>
        <div
          role="tablist"
          aria-label="Settings sections"
          style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 14, background: "rgba(255,255,255,0.7)", border: `1px solid ${C.border}`, justifySelf: "start" }}
        >
          {TABS.map((t, i) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(t.id)}
                onKeyDown={(e) => onKey(e, i)}
                className="av-focus"
                style={{
                  padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: FONT,
                  fontSize: 15, fontWeight: 600,
                  background: on ? C.blue : "transparent", color: on ? "#fff" : C.muted,
                  boxShadow: on ? "0 2px 8px rgba(47,107,255,0.3)" : "none"
                }}
              >
                <span aria-hidden style={{ marginRight: 6 }}>{t.emoji}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "twins" ? <TwinManager /> : <AiSettingsForm />}
      </div>
    </PageShell>
  );
}
