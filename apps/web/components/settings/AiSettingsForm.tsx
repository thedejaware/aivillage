"use client";

/**
 * "Your AI" form: pick a provider, paste a key, pick a model, test it, pick
 * how chatty the village is, save. Everything is stored in the local database.
 */

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { Chattiness } from "@aivillage/shared";
import { C, FONT, pill } from "../hud/theme";
import {
  getSettings, listModels, messageOf, saveSettings, testSettings,
  type ProviderInfo, type SettingsBody, type SettingsView
} from "../../lib/settings/api";
import { costLine, modelChoices } from "../../lib/settings/models";
import { Button, Notice, SettingsStyle, helpText, inputStyle, labelStyle, panel, sectionTitle } from "./ui";

export interface AiSettingsFormProps {
  onSaved?(): void;
  compact?: boolean;
}

const CHATTINESS: { id: Chattiness; label: string; text: string }[] = [
  { id: "calm", label: "Calm", text: "Twins talk now and then. Fewest AI calls." },
  { id: "normal", label: "Normal", text: "About one talk a minute. A good balance." },
  { id: "busy", label: "Busy", text: "Lots of talk and drama. More AI calls on your account." }
];

const OTHER = "__other__";
/** $0.1 → "0.10", $2 → "2", $0.091 → "0.09" */
const money = (n: number) => (n < 1 ? n.toFixed(2) : String(n));

type TestState = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; sample: string } | { kind: "fail"; error: string };

export default function AiSettingsForm({ onSaved, compact }: AiSettingsFormProps) {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [saved, setSaved] = useState<SettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsBusy, setModelsBusy] = useState(false);
  const [typeModel, setTypeModel] = useState(false);
  const [chattiness, setChattiness] = useState<Chattiness>("normal");

  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ids = { key: useId(), url: useId(), model: useId() };

  const info = providers?.find((p) => p.id === provider) ?? null;
  const keyHint = saved && saved.provider === provider && !clearKey ? saved.keyHint : null;
  const hasKey = !!apiKey.trim() || !!keyHint;
  const showBaseUrl = provider === "ollama" || advanced;

  /** The request body: no apiKey = keep the saved one, "" = clear it. */
  const body = useCallback((): SettingsBody => {
    const b: SettingsBody = { provider, model: model.trim() || info?.defaultModel || "", chattiness };
    if (apiKey.trim()) b.apiKey = apiKey.trim();
    else if (clearKey) b.apiKey = "";
    if (baseUrl.trim()) b.baseUrl = baseUrl.trim();
    return b;
  }, [provider, model, info, chattiness, apiKey, clearKey, baseUrl]);

  // load providers + saved settings
  const [loadTry, setLoadTry] = useState(0);
  useEffect(() => {
    setLoadError(null);
    getSettings()
      .then(({ settings, providers: list }) => {
        setProviders(list);
        setSaved(settings);
        const p = settings?.provider ?? list[0]?.id ?? "anthropic";
        const pi = list.find((x) => x.id === p);
        setProvider(p);
        setModel(settings?.model ?? pi?.defaultModel ?? "");
        setBaseUrl(settings?.baseUrl ?? "");
        setAdvanced(!!settings?.baseUrl && p !== "ollama");
        setChattiness(settings?.chattiness ?? "normal");
      })
      .catch((e) => setLoadError(messageOf(e)));
  }, [loadTry]);

  // ask the provider which models exist (only when it can answer)
  const reqSeq = useRef(0);
  const refreshModels = useCallback(async () => {
    const seq = ++reqSeq.current; // a newer request (or provider) wins over older answers
    if (!info || (info.needsKey && !hasKey)) {
      setModels([]);
      setModelsBusy(false);
      return;
    }
    setModelsBusy(true);
    try {
      const { models: list } = await listModels(body());
      if (seq !== reqSeq.current) return;
      setModels(list);
    } catch {
      if (seq === reqSeq.current) setModels([]);
    } finally {
      if (seq === reqSeq.current) setModelsBusy(false);
    }
  }, [info, hasKey, body]);

  useEffect(() => {
    if (providers) void refreshModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, provider, keyHint]);

  // a pasted key loads the account's model list by itself (no extra click)
  useEffect(() => {
    if (apiKey.trim().length < 20) return;
    const t = setTimeout(() => void refreshModels(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const pickProvider = (p: ProviderInfo) => {
    if (p.id === provider) return;
    setProvider(p.id);
    setApiKey("");
    setClearKey(false);
    setModels([]);
    setTypeModel(false);
    setModel(saved?.provider === p.id ? saved.model : p.defaultModel);
    setBaseUrl(saved?.provider === p.id ? saved.baseUrl ?? "" : "");
    setAdvanced(false);
    setTest({ kind: "idle" });
    setSaveMsg(null);
  };

  const runTest = async () => {
    setTest({ kind: "busy" });
    try {
      const r = await testSettings(body());
      setTest(r.ok ? { kind: "ok", sample: r.sample } : { kind: "fail", error: r.error });
    } catch (e) {
      setTest({ kind: "fail", error: messageOf(e) });
    }
  };

  const save = async () => {
    if (info?.needsKey && !hasKey) {
      setSaveMsg({ ok: false, text: `${info.label} needs an API key. Paste it above.` });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const b = body();
      const r = await saveSettings(b);
      setSaved({ provider: b.provider, model: b.model, baseUrl: b.baseUrl ?? null, chattiness: b.chattiness, keyHint: r.keyHint });
      setApiKey("");
      setClearKey(false);
      setSaveMsg({ ok: true, text: "Saved. Your twins now think with this model." });
      onSaved?.();
    } catch (e) {
      setSaveMsg({ ok: false, text: messageOf(e) });
    } finally {
      setSaving(false);
    }
  };

  const gap = compact ? 22 : 28;
  const wrap: CSSProperties = compact ? { display: "grid", gap } : { ...panel, padding: "26px 28px", display: "grid", gap };

  if (loadError) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Notice tone="error">{loadError}</Notice>
        <div><Button onClick={() => setLoadTry((n) => n + 1)}>Try again</Button></div>
      </div>
    );
  }
  if (!providers) return <p style={helpText}>Loading…</p>;

  const choices = info ? modelChoices(info, models, model) : { suggested: [], more: [], isCustom: false };
  const typing = typeModel || choices.isCustom;
  const picked = info?.models.find((m) => m.id === model);
  const linkButton: CSSProperties = {
    background: "none", border: "none", padding: 0, color: C.blue, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT
  };

  return (
    <div style={wrap}>
      <SettingsStyle />

      {/* 1. provider */}
      <section style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 style={sectionTitle}>Which AI should your twins use?</h3>
          <p style={{ ...helpText, marginTop: 4 }}>
            Your twins think with your own AI account. You pay your provider directly; we never see your key.
          </p>
        </div>
        <div className="av-providers" role="radiogroup" aria-label="AI provider">
          {providers.map((p) => {
            const on = p.id === provider;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickProvider(p)}
                className="av-focus av-choice"
                style={{
                  textAlign: "left", cursor: "pointer", fontFamily: FONT, color: C.text,
                  padding: "14px 16px", borderRadius: 14, display: "grid", gap: 6, alignContent: "start",
                  background: on ? C.blueSoft : "#fff",
                  border: `1.5px solid ${on ? C.blue : "rgba(20,40,80,0.12)"}`,
                  boxShadow: on ? "0 2px 10px rgba(47,107,255,0.14)" : "none"
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{p.label}</span>
                  {on && <span aria-hidden style={{ color: C.blue, fontWeight: 700 }}>✓</span>}
                </span>
                <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>{p.hint}</span>
                <span style={{ ...pill(p.needsKey ? "amber" : "green"), justifySelf: "start", marginTop: 2 }}>
                  {p.needsKey ? "Needs a key" : "Free & local"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. key + url */}
      {info?.needsKey && (
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <label htmlFor={ids.key} style={{ ...labelStyle, marginBottom: 0 }}>{info.label} API key</label>
            {info.keyUrl && (
              <a href={info.keyUrl} target="_blank" rel="noreferrer" className="av-focus" style={{ fontSize: 13.5, fontWeight: 600, color: C.blue }}>
                Get a key ↗
              </a>
            )}
          </div>
          <input
            id={ids.key}
            type="password"
            className="av-input"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setTest({ kind: "idle" }); setSaveMsg(null); }}
            onBlur={() => { if (apiKey.trim()) void refreshModels(); }}
            placeholder={keyHint ? `Saved ${keyHint} — leave empty to keep it` : "Paste your key here"}
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
          <p style={{ ...helpText, fontSize: 13 }}>
            🔒 The key is stored only in this computer&apos;s local database.
            {keyHint && !apiKey && (
              <>
                {" "}
                <button
                  type="button"
                  className="av-focus"
                  onClick={() => { setClearKey(true); setModels([]); }}
                  style={{ background: "none", border: "none", padding: 0, color: C.red, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT }}
                >
                  Remove saved key
                </button>
              </>
            )}
            {clearKey && !apiKey && <span style={{ color: C.red }}> The saved key will be removed when you save.</span>}
          </p>
        </section>
      )}

      {info && !info.needsKey && (
        <p style={{ ...helpText, fontSize: 13 }}>No key needed. 🔒 Your settings are stored only in this computer&apos;s local database.</p>
      )}

      {showBaseUrl && info && (
        <section style={{ display: "grid", gap: 8 }}>
          <label htmlFor={ids.url} style={{ ...labelStyle, marginBottom: 0 }}>Server address (base URL)</label>
          <input
            id={ids.url}
            className="av-input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={() => void refreshModels()}
            placeholder={info.defaultBaseUrl}
            autoComplete="off"
            spellCheck={false}
            style={inputStyle}
          />
          <p style={{ ...helpText, fontSize: 13 }}>Leave empty to use {info.defaultBaseUrl}</p>
        </section>
      )}

      {/* 3. model */}
      <section style={{ display: "grid", gap: 8 }}>
        <label htmlFor={ids.model} style={{ ...labelStyle, marginBottom: 0 }}>Model</label>
        <div style={{ display: "flex", gap: 8 }}>
          {!typing ? (
            <select
              id={ids.model}
              className="av-input"
              value={model}
              onChange={(e) => {
                if (e.target.value === OTHER) { setTypeModel(true); setModel(""); return; }
                setModel(e.target.value);
                setTest({ kind: "idle" });
              }}
              style={{ ...inputStyle, flex: 1, minWidth: 0, cursor: "pointer" }}
            >
              <optgroup label="Suggested">
                {choices.suggested.map((m) => <option key={m.id} value={m.id}>{m.text}</option>)}
              </optgroup>
              {choices.more.length > 0 && (
                <optgroup label="More models on your account">
                  {choices.more.map((m) => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              )}
              <option value={OTHER}>Other — type a model name…</option>
            </select>
          ) : (
            <input
              id={ids.model}
              className="av-input"
              value={model}
              onChange={(e) => { setModel(e.target.value); setTest({ kind: "idle" }); }}
              placeholder={`Model name, e.g. ${info?.defaultModel}`}
              autoComplete="off"
              spellCheck={false}
              autoFocus={typeModel}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
          )}
          <Button
            onClick={() => void refreshModels()}
            busy={modelsBusy}
            disabled={!!info?.needsKey && !hasKey}
            aria-label="Refresh the model list"
            title="Ask the provider for its model list"
          >
            {!modelsBusy && "↻"} Refresh
          </Button>
        </div>
        <p style={{ ...helpText, fontSize: 13 }}>
          {picked?.price && (
            <>Price: ${money(picked.price.input)} in / ${money(picked.price.output)} out per million tokens. </>
          )}
          {info?.needsKey && !hasKey
            ? "Add your key to also see every model on your account."
            : modelsBusy
              ? "Loading the models on your account…"
              : choices.more.length > 0
                ? `Plus ${choices.more.length} more models on your account.`
                : ""}
          {typing && (
            <>
              {" "}
              <button
                type="button"
                className="av-focus"
                onClick={() => { setTypeModel(false); setModel(info?.defaultModel ?? ""); }}
                style={linkButton}
              >
                Pick from the list
              </button>
            </>
          )}
        </p>
      </section>

      {/* 4. test */}
      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button onClick={runTest} busy={test.kind === "busy"} disabled={!!info?.needsKey && !hasKey}>
            Test connection
          </Button>
          {test.kind === "busy" && <span style={{ ...helpText, fontSize: 13 }}>Asking the model to say hello…</span>}
          {!advanced && provider !== "ollama" && (
            <button
              type="button"
              className="av-focus"
              onClick={() => setAdvanced(true)}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: FONT, marginLeft: "auto" }}
            >
              Advanced ▸
            </button>
          )}
        </div>
        {test.kind === "ok" && (
          <Notice tone="success">✓ It works! The model said: “{test.sample}”</Notice>
        )}
        {test.kind === "fail" && (
          <Notice tone="error">
            <b>✗ Could not connect.</b> {test.error}
          </Notice>
        )}
      </section>

      {/* 5. chattiness */}
      <section style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ ...sectionTitle, fontSize: 16 }}>How chatty is the village?</h3>
          <p style={{ ...helpText, marginTop: 4 }}>
            How often twins talk to each other. Busier = more AI calls on YOUR account. Costs below are rough estimates for
            the model you picked, while the village is open (it pauses when you close it).
            {info?.pricingUrl && (
              <>
                {" "}
                <a href={info.pricingUrl} target="_blank" rel="noreferrer" className="av-focus" style={{ color: C.blue, fontWeight: 600 }}>
                  Current prices ↗
                </a>
              </>
            )}
          </p>
        </div>
        <div role="radiogroup" aria-label="Chattiness" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          {CHATTINESS.map((c) => {
            const on = c.id === chattiness;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChattiness(c.id)}
                className="av-focus av-choice"
                style={{
                  textAlign: "left", cursor: "pointer", fontFamily: FONT, color: C.text, padding: "12px 14px",
                  borderRadius: 12, display: "grid", gap: 4,
                  background: on ? C.blueSoft : "#fff",
                  border: `1.5px solid ${on ? C.blue : "rgba(20,40,80,0.12)"}`
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14.5, color: on ? C.blue : C.text }}>{c.label}</span>
                <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>{c.text}</span>
                {info && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: on ? C.blue : C.text, marginTop: 2 }}>
                    {costLine(info, model, c.id)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 6. save */}
      <div style={{ display: "grid", gap: 10 }}>
        {saveMsg && <Notice tone={saveMsg.ok ? "success" : "error"}>{saveMsg.text}</Notice>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button kind="primary" size="lg" onClick={save} busy={saving}>Save</Button>
        </div>
      </div>
    </div>
  );
}
