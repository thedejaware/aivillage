"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_TWINS, type TwinSummary, type VillageInfo } from "@aivillage/shared";
import { C, FONT, caps } from "../../components/hud/theme";
import { Button, Notice, PageShell, TwinThumb, buttonStyle, helpText, panel } from "../../components/settings/ui";
import AiSettingsForm from "../../components/settings/AiSettingsForm";
import AvatarBuilder from "../../components/settings/AvatarBuilder";
import TwinManager from "../../components/settings/TwinManager";
import { createTwin, getVillage, messageOf } from "../../lib/settings/api";
import { personalityOf } from "../../lib/settings/twins";

type Step = 1 | 2 | 3;
const STEPS: { n: Step; title: string }[] = [
  { n: 1, title: "Choose your AI" },
  { n: 2, title: "Build your twin" },
  { n: 3, title: "Add your people" }
];

function Progress({ step, reached, onGo }: { step: Step; reached: Step; onGo(s: Step): void }) {
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", gap: 8, flexWrap: "wrap" }} aria-label="Setup steps">
      {STEPS.map((s, i) => {
        const current = s.n === step;
        const done = s.n < reached && !current;
        const canGo = s.n <= reached && !current;
        return (
          <li key={s.n} style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 180px" }}>
            <button
              type="button"
              onClick={() => canGo && onGo(s.n)}
              disabled={!canGo}
              aria-current={current ? "step" : undefined}
              className="av-focus"
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12,
                border: `1.5px solid ${current ? C.blue : "transparent"}`,
                background: current ? "#fff" : "rgba(255,255,255,0.55)",
                cursor: canGo ? "pointer" : "default", fontFamily: FONT, textAlign: "left", color: C.text
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 28, height: 28, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700,
                  background: current ? C.blue : done ? C.green : C.greySoft,
                  color: current || done ? "#fff" : C.muted
                }}
              >
                {done ? "✓" : s.n}
              </span>
              <span style={{ display: "grid" }}>
                <span style={{ ...caps, color: C.faint, fontSize: 10 }}>Step {s.n} of 3</span>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: current ? C.text : C.muted }}>{s.title}</span>
              </span>
            </button>
            {i < STEPS.length - 1 && <span aria-hidden style={{ color: C.faint }}>›</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [village, setVillage] = useState<VillageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [reached, setReached] = useState<Step>(1);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [buildAnother, setBuildAnother] = useState(false);

  const go = useCallback((s: Step) => {
    setStep(s);
    setReached((r) => (s > r ? s : r));
    document.querySelector("[data-scroll-top]")?.scrollIntoView({ block: "start" });
  }, []);

  const load = useCallback(async () => {
    try {
      const v = await getVillage();
      setVillage(v);
      return v;
    } catch (e) {
      setError(messageOf(e));
      return null;
    }
  }, []);

  // decide the starting step once (not again when the village changes mid-wizard)
  const started = useRef(false);
  useEffect(() => {
    void load().then((v) => {
      if (!v || started.current) return;
      started.current = true;
      if (v.mainTwinId && v.aiConfigured) setAlreadyDone(true);
      const start: Step = !v.aiConfigured ? 1 : !v.mainTwinId ? 2 : 3;
      setStep(start);
      setReached(start);
    });
  }, [load]);

  const mainTwin: TwinSummary | undefined = village?.twins.find((t) => t.id === village.mainTwinId);

  if (error && !village) {
    return (
      <PageShell>
        <div style={{ maxWidth: 560, margin: "10vh auto", display: "grid", gap: 14 }}>
          <Notice tone="error">{error}</Notice>
          <div><Button onClick={() => { setError(null); void load(); }}>Try again</Button></div>
        </div>
      </PageShell>
    );
  }

  if (!village) {
    return <PageShell><p style={{ ...helpText, textAlign: "center", marginTop: "20vh" }}>Loading…</p></PageShell>;
  }

  if (alreadyDone) {
    return (
      <PageShell>
        <div style={{ ...panel, maxWidth: 560, margin: "10vh auto 0", padding: "32px 30px", display: "grid", gap: 16, textAlign: "center" }}>
          <div style={{ fontSize: 40 }} aria-hidden>🏡</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Your village is already set up</h1>
          <p style={helpText}>
            {mainTwin ? <><b style={{ color: C.text }}>{mainTwin.name}</b> and {village.livingCount - 1} others live there.</> : "Everything is ready."}
            {" "}You can change twins and the AI in Settings.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" className="av-btn" style={buttonStyle("primary", "lg")}>Go to the village</Link>
            <Link href="/settings" className="av-btn" style={buttonStyle("secondary", "lg")}>Open Settings</Link>
          </div>
          <button
            type="button"
            className="av-focus"
            onClick={() => setAlreadyDone(false)}
            style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: FONT }}
          >
            Run the setup again
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div data-scroll-top style={{ display: "grid", gap: 22 }}>
        <header style={{ display: "grid", gap: 6 }}>
          <span style={{ ...caps, color: C.blue }}>Welcome to AiVillage</span>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Let&apos;s build your village</h1>
          <p style={{ ...helpText, fontSize: 15 }}>Three short steps. You can change everything later in Settings.</p>
        </header>

        <Progress step={step} reached={reached} onGo={go} />

        {step === 1 && (
          <section style={{ display: "grid", gap: 16 }}>
            <AiSettingsForm onSaved={() => { void load(); window.setTimeout(() => go(2), 900); }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <p style={{ ...helpText, flex: "1 1 260px" }}>
                No AI yet? You can skip this. Simple orders (“go to the café”) work without AI, but twins will not talk.
              </p>
              <Button kind="ghost" onClick={() => go(2)}>Skip for now →</Button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section style={{ display: "grid", gap: 16 }}>
            {mainTwin && !buildAnother ? (
              <div style={{ ...panel, padding: "22px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <TwinThumb name={mainTwin.name} appearance={mainTwin.appearance} size={56} />
                <div style={{ flex: "1 1 220px" }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{mainTwin.name} is your twin</div>
                  <div style={{ ...helpText, fontSize: 14 }}>{personalityOf(mainTwin) || "Ready to move in."}</div>
                </div>
                <Button onClick={() => setBuildAnother(true)}>Build another twin</Button>
                <Button kind="primary" onClick={() => go(3)}>Next →</Button>
              </div>
            ) : (
              <div style={{ ...panel, padding: "24px 26px", display: "grid", gap: 18 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>This is you in the village</h2>
                  <p style={{ ...helpText, marginTop: 4 }}>Your twin listens to you and talks to the others for you.</p>
                </div>
                <AvatarBuilder
                  role="main"
                  submitLabel="Create my twin →"
                  onSubmit={async (v) => {
                    await createTwin({
                      name: v.name, appearance: v.appearance, role: "main",
                      personality: v.personality || undefined, goal: v.goal || undefined
                    });
                    await load();
                    setBuildAnother(false);
                    go(3);
                  }}
                  onCancel={mainTwin ? () => setBuildAnother(false) : undefined}
                />
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section style={{ display: "grid", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Who else lives here?</h2>
              <p style={{ ...helpText, marginTop: 4 }}>
                Add your family and friends, or let random villagers move in. Up to {MAX_TWINS} twins can live in the village.
              </p>
            </div>
            <TwinManager addRole="villager" onChange={setVillage} />
            <div style={{ ...panel, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <p style={{ ...helpText, flex: "1 1 260px" }}>
                {village.mainTwinId
                  ? `All set? ${village.livingCount} / ${village.maxTwins} twins are ready.`
                  : "Tip: you have no active main twin yet. Go back to step 2 to build one."}
              </p>
              <Button kind="primary" size="lg" onClick={() => router.push("/")}>Enter the village →</Button>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
