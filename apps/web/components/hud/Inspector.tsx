"use client";

/**
 * Inspector — WareTrack's right-side card for the selected villager:
 * who they are, what they're doing, how they stand, who they love/hate.
 */

import type { CSSProperties, ReactNode } from "react";
import { DAILY_ENERGY, ZONE_DISPLAY, type TwinDetail } from "@aivillage/shared";
import { C, FONT, Z, barStyle, caps, card, hex, iconButton, pill, relTime, type Tone } from "./theme";

const CSS = `
@keyframes hud-skel { 0%, 100% { opacity: 0.55 } 50% { opacity: 1 } }
.hud-inspector { width: 330px; }
@media (max-width: 759px) {
  .hud-inspector { width: calc(100vw - 32px); max-height: 46vh !important; }
}
`;

/** friend-ish → green, rival-ish → red, the rest neutral. */
function relTone(label: string): Tone {
  const l = label.toLowerCase();
  if (l.includes("friend")) return "green";
  if (l === "rival" || l === "nemesis") return "red";
  return "grey";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "7px 0", borderTop: `1px solid ${C.line}` }}>
      <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: C.text, fontWeight: 500, textAlign: "right", minWidth: 0 }}>{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...caps, color: C.muted, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Skeleton() {
  const bar = (w: string, h = 12): CSSProperties => ({
    width: w, height: h, borderRadius: 6, background: C.greySoft, animation: "hud-skel 1.2s ease-in-out infinite"
  });
  return (
    <div aria-busy="true" aria-label="Loading villager">
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div style={{ ...bar("44px", 44), borderRadius: 999 }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={bar("40%", 10)} />
          <div style={bar("65%", 16)} />
          <div style={bar("80%", 10)} />
        </div>
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: `1px solid ${C.line}` }}>
          <div style={bar("30%")} />
          <div style={bar("35%")} />
        </div>
      ))}
    </div>
  );
}

export function Inspector({
  detail,
  loading,
  isMine,
  onClose,
  onFocus,
  style
}: {
  detail: TwinDetail | null;
  loading: boolean;
  isMine: boolean;
  onClose: () => void;
  onFocus: () => void;
  style?: CSSProperties;
}) {
  if (!detail && !loading) return null;

  const place = detail ? detail.zoneLabel || ZONE_DISPLAY[detail.zone] || detail.zone : "";
  const color = detail ? hex(detail.colorHex) : C.faint;
  const energy = detail ? barStyle(detail.energy / DAILY_ENERGY, detail.energy <= 1 ? "amber" : "green") : null;
  const goal = detail?.goals.find((g) => g.trim());

  return (
    <aside
      className="hud-inspector"
      aria-label={detail ? `Inspector: ${detail.name}` : "Inspector"}
      style={{
        ...card, position: "fixed", top: 80, right: 16, zIndex: Z.card + 1,
        maxHeight: "calc(100vh - 112px)", overflowY: "auto", boxSizing: "border-box",
        padding: 16, fontFamily: FONT, ...style
      }}
    >
      <style>{CSS}</style>

      {/* header: avatar, kind, name, subtitle, actions */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          aria-hidden
          style={{
            width: 44, height: 44, borderRadius: 999, background: color, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 18, boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.12)"
          }}
        >
          {detail?.name.charAt(0).toUpperCase() ?? ""}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...caps, color: C.blue }}>{isMine ? "YOUR TWIN" : "VILLAGER"}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {detail?.name ?? "Loading…"}
          </div>
          {detail && (
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
              {[detail.traits.slice(0, 2).join(", "), place && `at ${place}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={onFocus} aria-label="Focus camera on this villager" title="Focus" style={iconButton}>⌖</button>
          <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" style={iconButton}>✕</button>
        </div>
      </div>

      {loading && !detail ? (
        <div style={{ marginTop: 16 }}><Skeleton /></div>
      ) : detail && (
        <>
          {/* status: order or free life */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "14px 0 10px" }}>
            {detail.orderStatus
              ? <span style={pill("amber")}>{detail.orderStatus}</span>
              : <span style={pill("green")}>● Living freely</span>}
            {place && <span style={{ fontSize: 12, color: C.muted }}>at {place}</span>}
          </div>

          {place && <Row label="Location">{place}</Row>}
          <Row label="Popularity">
            {detail.popularity}
            {detail.rank > 0 && detail.villagerCount > 0 && (
              <span style={{ color: C.muted, fontWeight: 400 }}> · #{detail.rank} of {detail.villagerCount}</span>
            )}
          </Row>
          <Row label="Reputation">{detail.reputation}</Row>
          {energy && (
            <Row label="Energy">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: 130 }}>
                <span style={energy.track}><span style={{ ...energy.fill, display: "block" }} /></span>
                <span style={{ fontSize: 12 }}>{detail.energy}/{DAILY_ENERGY}</span>
              </span>
            </Row>
          )}
          {goal && <Row label="Goal">{goal}</Row>}

          {detail.traits.length > 0 && (
            <Section title="Traits">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {detail.traits.map((t) => <span key={t} style={pill("blue")}>{t}</span>)}
              </div>
            </Section>
          )}

          {detail.relationships.length > 0 && (
            <Section title="Friends & rivals">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {detail.relationships.map((r) => (
                  <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: C.text }}>{r.name}</span>
                    <span style={pill(relTone(r.label))}>{r.label}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {detail.recent.length > 0 && (
            <Section title="Recent life">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.recent.map((m) => (
                  <div key={m.id} style={{ fontSize: 12.5, lineHeight: 1.45, color: C.text }}>
                    {m.content}
                    <span style={{ color: C.faint, fontSize: 11, marginLeft: 6, whiteSpace: "nowrap" }}>{relTime(m.createdAt)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </aside>
  );
}
