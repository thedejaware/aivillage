"use client";

/**
 * ApprovalCard — a big move your twin wants to make; it waits for your call.
 * The parent decides placement; this only renders the card.
 */

import type { CSSProperties, ReactNode } from "react";
import { C, FONT, card, caps } from "./theme";

const btn: CSSProperties = {
  flex: 1, padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: FONT
};

export function ApprovalCard({
  text,
  onApprove,
  onDecline,
  style
}: {
  text: ReactNode;
  onApprove: () => void;
  onDecline: () => void;
  style?: CSSProperties;
}) {
  return (
    <section
      aria-label="Needs your decision"
      style={{ ...card, borderLeft: `4px solid ${C.amber}`, padding: "12px 14px", fontFamily: FONT, ...style }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          aria-hidden
          style={{
            width: 24, height: 24, borderRadius: 8, background: C.amberSoft, color: C.amber,
            display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13
          }}
        >
          ⚡
        </span>
        <span style={{ ...caps, color: C.amber }}>Needs your decision</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: C.text, marginBottom: 12 }}>{text}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onDecline} style={{ ...btn, background: "#fff", color: C.red, border: `1px solid rgba(229,72,77,0.35)` }}>
          Decline
        </button>
        <button type="button" onClick={onApprove} style={{ ...btn, background: C.green, color: "#fff", border: `1px solid ${C.green}` }}>
          Approve
        </button>
      </div>
    </section>
  );
}
