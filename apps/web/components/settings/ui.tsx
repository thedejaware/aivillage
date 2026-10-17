"use client";

/**
 * Small building blocks shared by the Settings page and the first-run setup:
 * buttons, option chips/swatches, fields, modal, confirm dialog, twin thumbnail.
 * Colours and shapes come from the HUD theme so everything matches the village.
 */

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { OUTFIT_COLORS, HAIR_COLORS, colorHex, type Appearance } from "@aivillage/shared";
import { C, FONT, RADIUS, SHADOW, caps } from "../hud/theme";
import { initialOf } from "../../lib/settings/twins";
import { nextIndex } from "../../lib/settings/builderTabs";

/** Hover/focus rules and responsive layout that inline styles cannot express. */
export function SettingsStyle() {
  return (
    <style>{`
      .av-btn { transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
      .av-btn:not(:disabled):hover { filter: brightness(0.97); box-shadow: 0 2px 8px rgba(20,40,80,0.10); }
      .av-btn:not(:disabled):active { transform: translateY(1px); }
      .av-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .av-focus:focus-visible, .av-btn:focus-visible, .av-input:focus-visible {
        outline: 3px solid rgba(47,107,255,0.45); outline-offset: 2px;
      }
      .av-input:focus { border-color: ${C.blue}; background: #fff; }
      .av-choice:hover { border-color: rgba(47,107,255,0.45); }
      /* avatar builder: preview beside the editor; on phones the preview and tab bar stick to the top */
      .av-bm { display: grid; grid-template-columns: minmax(300px, 0.85fr) 1.15fr; gap: 28px; align-items: start; }
      .av-bm-preview { position: sticky; top: 12px; z-index: 3; }
      .av-bm-tabs { position: sticky; top: 0; z-index: 2; background: #fff; padding: 6px 0 8px; }
      .av-bm-panel { scroll-margin-top: 72px; }
      @media (max-width: 899px) {
        .av-bm { grid-template-columns: 1fr; gap: 14px; }
        .av-bm-preview { top: 0; background: #fff; padding: 4px 0 8px; margin-top: -4px; }
        .av-bm-tabs { top: calc(var(--av-preview-h) + 8px); }
        .av-bm-panel { scroll-margin-top: calc(var(--av-preview-h) + 70px); }
      }
      .av-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); gap: 6px; }
      .av-tile { display: flex; flex-direction: column; align-items: center; gap: 5px; min-height: 92px; padding: 7px 4px 8px;
        border-radius: 14px; border: 1.5px solid rgba(20,40,80,0.10); background: #fff; cursor: pointer; font-family: ${FONT};
        transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
      .av-tile:hover { border-color: rgba(47,107,255,0.45); }
      .av-tile:active { transform: translateY(1px); }
      .av-tile[data-on] { border-color: ${C.blue}; background: ${C.blueSoft}; box-shadow: 0 0 0 2px ${C.blue}; }
      .av-tile-pic { width: 56px; height: 56px; border-radius: 12px; background: ${C.greySoft}; padding: 4px; display: block; }
      .av-tile[data-on] .av-tile-pic { background: #fff; }
      .av-tile-label { font-size: 11.5px; line-height: 1.2; font-weight: 600; color: ${C.muted}; text-align: center; }
      .av-tile[data-on] .av-tile-label { color: ${C.blue}; }
      .av-tabs { display: flex; gap: 4px; background: ${C.greySoft}; border-radius: 12px; padding: 4px; }
      .av-tab { flex: 1 1 0; min-height: 44px; padding: 6px 4px; border: none; border-radius: 9px; background: transparent;
        color: ${C.muted}; font-size: 14px; font-weight: 600; font-family: ${FONT}; cursor: pointer; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 1px; }
      .av-tab:hover { color: ${C.text}; }
      .av-tab[aria-selected=true] { background: #fff; color: ${C.blue}; box-shadow: 0 1px 4px rgba(20,40,80,0.14); }
      .av-link { background: none; border: none; padding: 2px 0; color: ${C.blue}; font-size: 13px; font-weight: 600;
        font-family: ${FONT}; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
      .av-twin-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
      .av-twin-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
      @media (max-width: 640px) { .av-twin-actions { margin-left: 0; width: 100%; } }
      .av-providers { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
      .av-spin { display: inline-block; width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid currentColor; border-right-color: transparent; animation: av-spin 0.8s linear infinite; }
      @keyframes av-spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}

// ---------- buttons ----------

export type ButtonKind = "primary" | "secondary" | "ghost" | "danger" | "dangerSoft";

const BUTTONS: Record<ButtonKind, CSSProperties> = {
  primary: { background: C.blue, color: "#fff", border: `1px solid ${C.blue}` },
  secondary: { background: "#fff", color: C.text, border: "1px solid rgba(20,40,80,0.14)" },
  ghost: { background: "transparent", color: C.muted, border: "1px solid transparent" },
  danger: { background: C.red, color: "#fff", border: `1px solid ${C.red}` },
  dangerSoft: { background: C.redSoft, color: C.red, border: "1px solid rgba(229,72,77,0.18)" }
};

export function buttonStyle(kind: ButtonKind = "secondary", size: "sm" | "md" | "lg" = "md"): CSSProperties {
  const pad = size === "sm" ? "7px 12px" : size === "lg" ? "13px 22px" : "10px 16px";
  return {
    ...BUTTONS[kind],
    padding: pad,
    borderRadius: 10,
    fontSize: size === "sm" ? 13 : size === "lg" ? 15.5 : 14,
    fontWeight: 600,
    fontFamily: FONT,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    textDecoration: "none"
  };
}

export function Button({
  kind = "secondary", size = "md", busy, children, style, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; size?: "sm" | "md" | "lg"; busy?: boolean }) {
  return (
    <button
      type="button"
      className="av-btn"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      style={{ ...buttonStyle(kind, size), ...style }}
    >
      {busy && <span className="av-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ---------- text ----------

export const sectionTitle: CSSProperties = { fontSize: 18, fontWeight: 700, color: C.text, margin: 0 };
export const helpText: CSSProperties = { fontSize: 13.5, color: C.muted, lineHeight: 1.5, margin: 0 };
export const labelStyle: CSSProperties = { ...caps, color: C.muted, display: "block", marginBottom: 8 };

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 10,
  border: "1px solid rgba(20,40,80,0.14)",
  background: C.greySoft,
  color: C.text,
  fontSize: 15,
  fontFamily: FONT,
  outline: "none"
};

/** A friendly white panel (a bit roomier than the HUD card). */
export const panel: CSSProperties = {
  background: "#fff",
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS + 4,
  boxShadow: "0 4px 20px rgba(20,40,80,0.08)",
  color: C.text,
  fontFamily: FONT
};

export function Notice({ tone, children, role }: { tone: "error" | "success" | "info"; children: ReactNode; role?: string }) {
  const t = tone === "error" ? { fg: C.red, bg: C.redSoft } : tone === "success" ? { fg: C.green, bg: C.greenSoft } : { fg: C.blue, bg: C.blueSoft };
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      style={{ background: t.bg, color: t.fg, borderRadius: 10, padding: "10px 14px", fontSize: 14, lineHeight: 1.45, fontWeight: 500 }}
    >
      {children}
    </div>
  );
}

// ---------- choices (chips / swatches / segmented) ----------

interface ChoiceOption { id: string; label: string; hex?: string; }

/**
 * A single-choice group. Radio semantics: Tab enters the group, arrow keys
 * move the choice (roving tabindex), like a native radio group.
 */
export function Choice({
  label, options, value, onChange, variant = "chip"
}: {
  label: string;
  options: ChoiceOption[];
  value: string;
  onChange(id: string): void;
  variant?: "chip" | "swatch" | "segmented";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();
  const current = Math.max(0, options.findIndex((o) => o.id === value));

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextIndex(i, e.key, options.length);
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  const wrap: CSSProperties =
    variant === "segmented"
      ? { display: "inline-flex", background: C.greySoft, borderRadius: 12, padding: 4, gap: 4, flexWrap: "wrap" }
      : { display: "flex", flexWrap: "wrap", gap: variant === "swatch" ? 10 : 8 };

  return (
    <div>
      <span id={labelId} style={labelStyle}>
        {label}
        {variant === "swatch" && options[current] && (
          <span aria-hidden style={{ color: C.text, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}> · {options[current].label}</span>
        )}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} style={wrap}>
        {options.map((o, i) => {
          const on = i === current;
          const common = {
            ref: (el: HTMLButtonElement | null) => { refs.current[i] = el; },
            type: "button" as const,
            role: "radio",
            "aria-checked": on,
            tabIndex: on ? 0 : -1,
            onClick: () => onChange(o.id),
            onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => onKey(e, i)
          };
          if (variant === "swatch") {
            return (
              <button
                key={o.id}
                {...common}
                aria-label={o.label}
                title={o.label}
                className="av-focus"
                style={{
                  width: 44, height: 44, borderRadius: "50%", cursor: "pointer", padding: 0,
                  background: o.hex,
                  border: "2px solid #fff",
                  boxShadow: on ? `0 0 0 3px ${C.blue}, 0 2px 6px rgba(20,40,80,0.18)` : "0 0 0 1px rgba(20,40,80,0.16), 0 1px 3px rgba(20,40,80,0.10)",
                  transform: on ? "scale(1.06)" : undefined,
                  transition: "box-shadow 120ms ease, transform 120ms ease"
                }}
              />
            );
          }
          if (variant === "segmented") {
            return (
              <button
                key={o.id}
                {...common}
                className="av-focus"
                style={{
                  padding: "9px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: on ? "#fff" : "transparent", color: on ? C.blue : C.muted,
                  boxShadow: on ? "0 1px 4px rgba(20,40,80,0.14)" : "none",
                  fontSize: 14, fontWeight: 600, fontFamily: FONT
                }}
              >
                {o.label}
              </button>
            );
          }
          return (
            <button
              key={o.id}
              {...common}
              className="av-focus av-choice"
              style={{
                padding: "9px 15px", minHeight: 40, borderRadius: 999, cursor: "pointer",
                border: `1.5px solid ${on ? C.blue : "rgba(20,40,80,0.12)"}`,
                background: on ? C.blueSoft : "#fff", color: on ? C.blue : C.text,
                fontSize: 14, fontWeight: on ? 600 : 500, fontFamily: FONT,
                transition: "border-color 120ms ease, background 120ms ease"
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- picture tiles (Bitmoji-style options) ----------

/**
 * A single-choice group shown as picture tiles with a small label under each.
 * Radio semantics + roving tabindex: Tab enters the group, arrow keys / Home / End move.
 */
export function TileChoice({
  label, options, value, onChange, renderIcon
}: {
  label: string;
  options: ChoiceOption[];
  value: string;
  onChange(id: string): void;
  renderIcon(id: string): ReactNode;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = useId();
  const current = Math.max(0, options.findIndex((o) => o.id === value));

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextIndex(i, e.key, options.length);
    if (next === null) return;
    e.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <span id={labelId} style={labelStyle}>{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="av-tiles">
        {options.map((o, i) => {
          const on = i === current;
          return (
            <button
              key={o.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => onKey(e, i)}
              className="av-focus av-tile"
              data-on={on || undefined}
            >
              <span className="av-tile-pic">{renderIcon(o.id)}</span>
              <span className="av-tile-label">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- modal + confirm ----------

export function Modal({
  title, onClose, children, width = 1040, labelledBy
}: { title: string; onClose(): void; children: ReactNode; width?: number; labelledBy?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // focus the first field (or the dialog itself) when it opens
    const first =
      box.current?.querySelector<HTMLElement>("input, textarea, select") ??
      box.current?.querySelector<HTMLElement>("button:not([data-close]), [tabindex='0']");
    (first ?? box.current)?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(20,32,56,0.38)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "max(16px, 4vh) 16px", overflowY: "auto"
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
        style={{ ...panel, width: "100%", maxWidth: width, padding: "22px 26px 26px", boxShadow: SHADOW, outline: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <h2 id={titleId} style={{ ...sectionTitle, fontSize: 20, flex: 1 }}>{title}</h2>
          <button
            type="button"
            data-close
            aria-label="Close"
            onClick={onClose}
            className="av-btn"
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: C.greySoft, color: C.muted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, children, confirmLabel, onConfirm, onCancel, busy, error
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <Modal title={title} onClose={onCancel} width={480}>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ fontSize: 15, lineHeight: 1.55, color: C.text }}>{children}</div>
        {error && <Notice tone="error">{error}</Notice>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button kind="danger" onClick={onConfirm} busy={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- twin thumbnail (cheap 2D, no 3D canvas) ----------

function isLight(hexColor: string): boolean {
  const n = parseInt(hexColor.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

export function TwinThumb({ name, appearance, size = 52, dim }: { name: string; appearance: Appearance; size?: number; dim?: boolean }) {
  const body = colorHex(OUTFIT_COLORS, appearance.outfitColor);
  const hair = colorHex(HAIR_COLORS, appearance.hairColor);
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: "50%", flex: "none",
        background: body, color: isLight(body) ? C.text : "#fff",
        boxShadow: `0 0 0 3px #fff, 0 0 0 ${size > 40 ? 6 : 5}px ${hair}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: size * 0.42, fontFamily: FONT,
        opacity: dim ? 0.5 : 1, filter: dim ? "grayscale(0.6)" : undefined,
        margin: size > 40 ? 6 : 5
      }}
    >
      {initialOf(name)}
    </div>
  );
}

// ---------- page shell ----------

/** Full-screen scroll area (the app's body has overflow hidden for the 3D village). */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, overflowY: "auto",
        background: "linear-gradient(180deg, #eef2f7 0%, #e9f0fb 100%)",
        fontFamily: FONT, color: C.text
      }}
    >
      <SettingsStyle />
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 20px 64px" }}>{children}</div>
    </div>
  );
}
