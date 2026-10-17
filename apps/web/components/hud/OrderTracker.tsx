"use client";

/**
 * OrderTracker — WareTrack's shipment stepper, mapped to the twin's current
 * owner order: given → walking → arrived → doing the thing.
 * The parent decides placement; this only renders the card.
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { PerformedAction } from "@aivillage/shared";
import { C, FONT, card, caps } from "./theme";

export interface TrackedOrder {
  kind: "go" | "talk_to" | "stay" | "act";
  label: string;
  zone: string;
  targetName: string | null;
  action?: PerformedAction | null;
}

interface Step { icon: string; label: string }

const CSS = `
@keyframes hud-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(47,107,255,0.40); }
  70%  { box-shadow: 0 0 0 6px rgba(47,107,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(47,107,255,0); }
}
.hud-step-current { animation: hud-pulse 1.8s ease-out infinite; }
@media (prefers-reduced-motion: reduce) { .hud-step-current { animation: none; } }
@media (max-width: 559px) { .hud-step-time { display: none; } .hud-step-label { font-size: 10.5px !important; } }
`;

function stepsFor(order: TrackedOrder): Step[] {
  if (order.kind === "stay") return [{ icon: "💬", label: "Asked" }, { icon: "📍", label: "Staying" }];
  if (order.kind === "talk_to") {
    return [
      { icon: "💬", label: "Asked" },
      { icon: "🚶", label: "Walking" },
      { icon: "👀", label: `Found ${order.targetName ?? "them"}` },
      { icon: "💬", label: "Talking" }
    ];
  }
  if (order.kind === "act" && order.action) {
    const a = order.action;
    return [
      { icon: "💬", label: "Asked" },
      { icon: "🚶", label: "Walking" },
      { icon: a.targetName ? "👀" : "📍", label: a.targetName ? `Found ${a.targetName}` : "Arrived" },
      a.refused ? { icon: "🙅", label: `${a.targetName ?? "They"} said no` } : { icon: a.emoji, label: a.label }
    ];
  }
  return [
    { icon: "💬", label: "Asked" },
    { icon: "🚶", label: "Walking" },
    { icon: "📍", label: "Arrived" },
    { icon: "✨", label: "Hanging out" }
  ];
}

/** Index of the step in progress; everything before it is done. */
function currentStep(kind: TrackedOrder["kind"], arrived: boolean, talking: boolean): number {
  if (kind === "stay") return 1;
  if (kind === "talk_to") return talking ? 3 : arrived ? 2 : 1;
  return arrived ? 3 : 1;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function OrderTracker({
  twinName,
  order,
  arrived,
  talking,
  issuedAt,
  style
}: {
  twinName: string;
  order: TrackedOrder | null;
  arrived: boolean;
  talking: boolean;
  issuedAt: number | null;
  style?: CSSProperties;
}) {
  const steps = useMemo(() => (order ? stepsFor(order) : []), [order]);
  const current = order ? currentStep(order.kind, arrived, talking) : 0;

  // when each step was first reached (step 0 = issuedAt); reset per order
  const orderKey = order ? `${order.kind}:${order.zone}:${order.targetName ?? ""}:${issuedAt ?? ""}` : "";
  const [stamps, setStamps] = useState<Record<number, number>>({});
  useEffect(() => { setStamps({}); }, [orderKey]);
  useEffect(() => {
    if (!order) return;
    setStamps((s) => (s[current] ? s : { ...s, [current]: Date.now() }));
  }, [order, current]);

  if (!order) return null;

  const timeFor = (i: number): string => {
    if (i === 0) return issuedAt ? clock(issuedAt) : "";
    if (i > current) return "—";
    if (i === current) return "now";
    return stamps[i] ? clock(stamps[i]) : "✓";
  };

  return (
    <section
      aria-label={`What ${twinName} is doing`}
      style={{ ...card, width: "min(400px, calc(100vw - 32px))", boxSizing: "border-box", padding: "8px 12px 9px", fontFamily: FONT, ...style }}
    >
      <style>{CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>What {twinName} is doing</span>
        <span style={{ fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {order.label}
        </span>
      </div>

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "flex-start" }}>
        {steps.map((s, i) => {
          const done = i < current;
          const isCurrent = i === current;
          const circle: CSSProperties = {
            width: 24, height: 24, borderRadius: 999, flexShrink: 0, position: "relative", zIndex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: done ? 11 : 12, fontWeight: 700,
            background: done ? C.blue : isCurrent ? C.blueSoft : C.greySoft,
            color: done ? "#fff" : C.text,
            border: `2px solid ${done || isCurrent ? C.blue : "rgba(20,40,80,0.10)"}`,
            filter: !done && !isCurrent ? "grayscale(1)" : undefined,
            opacity: !done && !isCurrent ? 0.7 : 1
          };
          return (
            <li
              key={i}
              aria-current={isCurrent ? "step" : undefined}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: 0 }}
            >
              {/* connector to the previous step */}
              {i > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute", top: 11, right: "50%", width: "100%", height: 2,
                    background: i <= current ? C.blue : "rgba(20,40,80,0.10)"
                  }}
                />
              )}
              <span className={isCurrent ? "hud-step-current" : undefined} style={circle}>{done ? "✓" : s.icon}</span>
              <span
                className="hud-step-label"
                style={{
                  marginTop: 3, fontSize: 10.5, fontWeight: isCurrent ? 700 : 600, textAlign: "center", padding: "0 2px",
                  color: done || isCurrent ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%"
                }}
              >
                {s.label}
              </span>
              <span className="hud-step-time" style={{ ...caps, fontSize: 9, letterSpacing: "0.02em", textTransform: "none", fontWeight: 500, color: isCurrent ? C.blue : C.faint }}>
                {timeFor(i)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
