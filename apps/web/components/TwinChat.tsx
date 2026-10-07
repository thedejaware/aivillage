"use client";

/**
 * TwinChat — the TALK phase of the v3 loop. You talk, your twin remembers,
 * and what you share fuels its village life (gossip, goals, drama).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorldTwinView } from "@aivillage/shared";
import { C, FONT, Z, card, iconButton } from "./hud/theme";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Msg {
  id: string;
  /** "event" = something the twin DID (walked off, arrived) */
  role: "owner" | "twin" | "event";
  content: string;
}

type Order = WorldTwinView["order"];

// Light HUD card; on screens ≥ 1100px the width shrinks so the bottom-center
// lane (≤520px wide: order tracker / caption bar) stays uncovered.
const CHAT_CSS = `
.hud-chat { width: min(320px, calc(100vw - 32px)); }
@media (min-width: 1100px) { .hud-chat { width: clamp(260px, calc(50vw - 300px), 320px); } }
.hud-chat input:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 3px ${C.blueSoft}; }
`;

export default function TwinChat({
  userId,
  twinName,
  order,
  event
}: {
  userId: string;
  twinName: string | null;
  /** the twin's current owner order (from the live world) */
  order: Order;
  /** a world event about this twin to log in the chat (e.g. it arrived) */
  event: { id: string; text: string } | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/chat?userId=${encodeURIComponent(userId)}`);
        const data = (await r.json()) as { messages?: { id: string; role: "owner" | "twin"; content: string }[] };
        if (!cancelled && data.messages) setMessages(data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })));
      } catch {
        /* history is best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (event) setMessages((m) => (m.some((x) => x.id === event.id) ? m : [...m, { id: event.id, role: "event", content: event.text }]));
  }, [event]);

  const release = useCallback(async () => {
    try {
      await fetch(`${API}/api/order/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId })
      });
    } catch {
      /* the world update will tell us */
    }
  }, [userId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, thinking, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "owner", content: text }]);
    setThinking(true);
    try {
      const r = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, message: text })
      });
      const data = (await r.json()) as {
        reply?: string;
        error?: string;
        command?: { type: string } | null;
        order?: { label: string } | null;
      };
      const stamp = Date.now();
      setMessages((m) => {
        const next: Msg[] = [...m, { id: `local-${stamp}-r`, role: "twin", content: data.reply ?? data.error ?? "…" }];
        if (data.command?.type === "free") next.push({ id: `local-${stamp}-e`, role: "event", content: "🕊 back to its own village life" });
        else if (data.command && data.order) next.push({ id: `local-${stamp}-e`, role: "event", content: `${data.command.type === "stay" ? "📍" : "🚶"} ${data.order.label}` });
        return next;
      });
    } catch {
      setMessages((m) => [...m, { id: `local-${Date.now()}-e`, role: "twin", content: "(connection lost — try again)" }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, userId]);

  const name = twinName ?? "your twin";

  return (
    <div
      className="hud-chat"
      style={{ ...card, position: "fixed", left: 16, bottom: 16, zIndex: Z.chat, boxSizing: "border-box", overflow: "hidden" }}
    >
      <style>{CHAT_CSS}</style>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Collapse chat" : "Expand chat"}
        style={{
          width: "100%", background: "transparent", border: "none", cursor: "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 14px", color: C.text, fontSize: 14, fontWeight: 700, fontFamily: FONT
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 Talk to {name}</span>
        <span aria-hidden style={{ ...iconButton, width: 24, height: 24, fontSize: 11 }}>{open ? "▾" : "▴"}</span>
      </button>

      {open && order && (
        <div
          style={{
            margin: "0 12px 8px", padding: "6px 8px 6px 10px", borderRadius: 10, background: C.amberSoft,
            color: C.amber, fontSize: 12, fontWeight: 600,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8
          }}
        >
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📌 {order.label}</span>
          <button
            type="button"
            onClick={() => void release()}
            title="End the order — your twin goes back to its own life"
            style={{
              background: "#fff", border: "1px solid rgba(217,130,43,0.35)", borderRadius: 999, color: C.amber,
              fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "3px 9px", whiteSpace: "nowrap", fontFamily: FONT
            }}
          >
            ✕ let it roam
          </button>
        </div>
      )}

      {open && (
        <>
          <div
            ref={listRef}
            style={{
              maxHeight: "34vh", overflowY: "auto", padding: "4px 12px 10px", display: "flex", flexDirection: "column", gap: 6,
              borderTop: `1px solid ${C.line}`
            }}
          >
            {messages.length === 0 && (
              <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, paddingTop: 6 }}>
                Tell {name} about your day, your plans, your secrets. It remembers — and lives it out in the village.
              </div>
            )}
            {messages.map((m) => m.role === "event" ? (
              <div
                key={m.id}
                style={{
                  alignSelf: "center", fontSize: 11, fontWeight: 600, padding: "2px 0", textAlign: "center",
                  color: m.content.startsWith("🕊") ? C.green : C.amber
                }}
              >
                {m.content}
              </div>
            ) : (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === "owner" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: m.role === "owner" ? C.blue : C.greySoft,
                  borderRadius: 14,
                  borderBottomRightRadius: m.role === "owner" ? 4 : 14,
                  borderBottomLeftRadius: m.role === "owner" ? 14 : 4,
                  padding: "7px 11px",
                  color: m.role === "owner" ? "#fff" : C.text,
                  fontSize: 13,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap"
                }}
              >
                {m.content}
              </div>
            ))}
            {thinking && (
              <div style={{ alignSelf: "flex-start", color: C.muted, fontSize: 12, fontStyle: "italic" }}>
                {name} is thinking…
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, padding: "0 12px 12px" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
              placeholder={`Message ${name}…`}
              aria-label={`Message ${name}`}
              style={{
                flex: 1, minWidth: 0, boxSizing: "border-box", padding: "9px 12px",
                background: "#fff", border: "1px solid rgba(20,40,80,0.14)", borderRadius: 999,
                color: C.text, fontSize: 13, outline: "none", fontFamily: FONT
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={thinking || !input.trim()}
              aria-label="Send message"
              style={{
                width: 36, height: 36, flexShrink: 0, background: C.blue, color: "#fff", border: "none",
                borderRadius: 999, fontSize: 16, fontWeight: 700, fontFamily: FONT,
                cursor: thinking ? "default" : "pointer", opacity: thinking || !input.trim() ? 0.45 : 1
              }}
            >
              ↑
            </button>
          </div>
        </>
      )}
    </div>
  );
}
