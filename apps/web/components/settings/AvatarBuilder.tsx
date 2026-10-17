"use client";

/**
 * The avatar builder, Bitmoji style: a big live 3D preview on one side, the
 * editor on the other. Name + gender on top (gender only picks a starting
 * face and body), then tabs — Body, Face, Hair, Style, About — with every
 * option shown as a picture tile. Used by the first-run setup and Settings.
 */

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { GENDERS, randomAppearance, withGender, type Appearance } from "@aivillage/shared";
import { C } from "../hud/theme";
import type { TwinFormValues } from "../../lib/settings/twins";
import { messageOf } from "../../lib/settings/api";
import { BUILDER_TABS, nextIndex, previewFocusFor, startingLook, switchGender, tabById, type TabId } from "../../lib/settings/builderTabs";
import { Button, Choice, Notice, SettingsStyle, TileChoice, helpText, inputStyle, labelStyle } from "./ui";
import { FeatureIcon } from "./featureIcons";

const AvatarPreview = dynamic(() => import("../village/avatar/AvatarPreview"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>
      Loading preview…
    </div>
  )
});

export type { TwinFormValues };

export interface AvatarBuilderProps {
  initial?: Partial<TwinFormValues>;
  role: "main" | "villager";
  submitLabel: string;
  onSubmit(values: TwinFormValues): Promise<void>;
  onCancel?(): void;
}

/** Preview height: tall beside the editor, smaller (but always visible) when stacked on narrow screens. */
function usePreviewHeight(): number {
  const [h, setH] = useState(500);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const update = () => setH(mq.matches ? 220 : 500);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return h;
}

const optional = <span style={{ color: C.faint, textTransform: "none", letterSpacing: 0 }}>(optional)</span>;

export default function AvatarBuilder({ initial, role, submitLabel, onSubmit, onCancel }: AvatarBuilderProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [look, setLook] = useState<Appearance>(() => startingLook(initial?.appearance));
  // an existing twin's hairstyle, or one the player picked, is never changed by a gender switch
  const hairChosen = useRef(!!initial?.appearance);
  const [personality, setPersonality] = useState(initial?.personality ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [tab, setTab] = useState<TabId>("body");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameMissing, setNameMissing] = useState(false);
  const uid = useId();
  const ids = { name: `${uid}-name`, personality: `${uid}-pers`, goal: `${uid}-goal`, nameErr: `${uid}-nameerr`, genderHint: `${uid}-ghint` };
  const tabId = (t: TabId) => `${uid}-tab-${t}`;
  const panelId = `${uid}-panel`;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const previewHeight = usePreviewHeight();
  const focus = previewFocusFor(tab);
  const set = (key: keyof Appearance) => (v: string) => {
    if (key === "hair") hairChosen.current = true;
    setLook((l) => ({ ...l, [key]: v }));
  };

  const openTab = (t: TabId) => {
    setTab(t);
    // if the editor was scrolled down into a long tab, jump back to the top of the new one
    const panel = panelRef.current;
    const tabs = tabRefs.current[0]?.parentElement;
    if (panel && tabs && panel.getBoundingClientRect().top < tabs.getBoundingClientRect().bottom - 1) {
      requestAnimationFrame(() => panel.scrollIntoView({ block: "start" }));
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = nextIndex(i, e.key, BUILDER_TABS.length);
    if (next === null) return;
    e.preventDefault();
    openTab(BUILDER_TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameMissing(true);
      document.getElementById(ids.name)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), appearance: look, personality: personality.trim(), goal: goal.trim() });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const current = tabById(tab);
  // on phones the preview sticks to the top; the tab bar sticks right under it
  const stickyVars = { "--av-preview-h": `${previewHeight}px` } as CSSProperties;

  return (
    <form onSubmit={submit} noValidate>
      <SettingsStyle />
      <div className="av-bm" style={stickyVars}>
        {/* the live preview */}
        <div className="av-bm-preview">
          <div
            style={{
              position: "relative", height: previewHeight, borderRadius: 18, overflow: "hidden",
              background: "radial-gradient(circle at 50% 35%, #ffffff 0%, #eaf0fb 70%, #dde7f7 100%)",
              border: `1px solid ${C.border}`
            }}
          >
            <AvatarPreview appearance={look} height={previewHeight} focus={focus} />
            <span
              style={{
                position: "absolute", left: 12, top: 12, right: 140, fontSize: 14, fontWeight: 700, pointerEvents: "none",
                color: name.trim() ? C.text : C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}
            >
              {name.trim() || (role === "main" ? "Your twin" : "New villager")}
            </span>
            <Button
              size="sm"
              onClick={() => setLook(randomAppearance())}
              style={{ position: "absolute", right: 10, top: 8, boxShadow: "0 2px 8px rgba(20,40,80,0.14)" }}
            >
              🎲 Surprise me
            </Button>
          </div>
        </div>

        {/* the editor */}
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <div>
            <label htmlFor={ids.name} style={labelStyle}>Full name</label>
            <input
              id={ids.name}
              className="av-input"
              value={name}
              onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameMissing(false); }}
              placeholder={role === "main" ? "e.g. Mehmet Akın" : "e.g. Ayşe Yılmaz"}
              maxLength={60}
              autoComplete="off"
              required
              aria-invalid={nameMissing || undefined}
              aria-describedby={nameMissing ? ids.nameErr : undefined}
              style={{ ...inputStyle, borderColor: nameMissing ? C.red : undefined }}
            />
            {nameMissing && <p id={ids.nameErr} style={{ ...helpText, color: C.red, marginTop: 6 }}>Please write a name.</p>}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <Choice label="Gender" variant="segmented" options={GENDERS} value={look.gender} onChange={(g) => setLook((l) => switchGender(l, g, hairChosen.current))} />
            <p id={ids.genderHint} style={{ ...helpText, fontSize: 13 }}>
              Gender sets a starting face and body — you can change every part below.{" "}
              <button type="button" className="av-link av-focus" onClick={() => setLook((l) => withGender(l, l.gender))}>
                Reset to gender defaults
              </button>
            </p>
          </div>

          <div>
            <div className="av-bm-tabs">
              <div role="tablist" aria-label="Look" className="av-tabs">
                {BUILDER_TABS.map((t, i) => (
                  <button
                    key={t.id}
                    ref={(el) => { tabRefs.current[i] = el; }}
                    id={tabId(t.id)}
                    type="button"
                    role="tab"
                    aria-selected={t.id === tab}
                    aria-controls={panelId}
                    tabIndex={t.id === tab ? 0 : -1}
                    onClick={() => openTab(t.id)}
                    onKeyDown={(e) => onTabKey(e, i)}
                    className="av-tab av-focus"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={panelRef}
              id={panelId}
              role="tabpanel"
              aria-labelledby={tabId(tab)}
              className="av-bm-panel"
              style={{ display: "grid", gap: 20, paddingTop: 12 }}
            >
              {current.fields.map((f) =>
                f.kind === "swatch" ? (
                  <Choice key={f.key} label={f.label} variant="swatch" options={f.options} value={look[f.key]} onChange={set(f.key)} />
                ) : (
                  <TileChoice
                    key={f.key}
                    label={f.label}
                    options={f.options}
                    value={look[f.key]}
                    onChange={set(f.key)}
                    renderIcon={(id) => <FeatureIcon field={f.key} id={id} look={look} />}
                  />
                )
              )}

              {tab === "about" && (
                <>
                  <div>
                    <label htmlFor={ids.personality} style={labelStyle}>Personality {optional}</label>
                    <input
                      id={ids.personality}
                      className="av-input"
                      value={personality}
                      onChange={(e) => setPersonality(e.target.value)}
                      placeholder="warm, funny, a bit stubborn"
                      maxLength={80}
                      autoComplete="off"
                      style={inputStyle}
                    />
                    <p style={{ ...helpText, marginTop: 6, fontSize: 13 }}>A few words, with commas between them.</p>
                  </div>
                  <div>
                    <label htmlFor={ids.goal} style={labelStyle}>Goal {optional}</label>
                    <input
                      id={ids.goal}
                      className="av-input"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="make friends with everyone"
                      maxLength={100}
                      autoComplete="off"
                      style={inputStyle}
                    />
                    <p style={{ ...helpText, marginTop: 6, fontSize: 13 }}>What they want in village life. It shapes how they act.</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
            {tab !== "about" && (
              <span style={{ ...helpText, fontSize: 13, marginRight: "auto" }}>
                Tip: add a personality in <button type="button" className="av-link av-focus" onClick={() => openTab("about")}>About</button>.
              </span>
            )}
            {onCancel && <Button onClick={onCancel} disabled={busy}>Cancel</Button>}
            <Button type="submit" kind="primary" size="lg" busy={busy}>{submitLabel}</Button>
          </div>
        </div>
      </div>
    </form>
  );
}
