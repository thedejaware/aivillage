"use client";

/**
 * Everyone who lives in the village (and the hidden ones): add, edit look,
 * activate / deactivate, delete, fill with random villagers.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_TWINS, type TwinSummary, type VillageInfo } from "@aivillage/shared";
import { C, FONT, barStyle, pill } from "../hud/theme";
import {
  activateTwin, createTwin, deactivateTwin, deleteTwin, fillRandomVillagers, getVillage, messageOf, patchTwin
} from "../../lib/settings/api";
import { goalOf, patchFor, personalityOf, roleLabel, sortTwins, type TwinFormValues } from "../../lib/settings/twins";
import AvatarBuilder from "./AvatarBuilder";
import { Button, ConfirmDialog, Modal, Notice, SettingsStyle, TwinThumb, helpText, panel, sectionTitle } from "./ui";

export interface TwinManagerProps {
  /** called after every load/change (e.g. the setup wizard's counter) */
  onChange?(info: VillageInfo): void;
  /** only add this kind of twin (skips the "Main or Villager?" question) */
  addRole?: "main" | "villager";
}

type Dialog =
  | { kind: "pickRole" }
  | { kind: "add"; role: "main" | "villager" }
  | { kind: "edit"; twin: TwinSummary }
  | { kind: "delete"; twin: TwinSummary };

export default function TwinManager({ onChange, addRole }: TwinManagerProps) {
  const [info, setInfo] = useState<VillageInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const reload = useCallback(async () => {
    try {
      const v = await getVillage();
      setInfo(v);
      setLoadError(null);
      onChangeRef.current?.(v);
    } catch (e) {
      setLoadError(messageOf(e));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const living = info?.livingCount ?? 0;
  const max = info?.maxTwins ?? MAX_TWINS;
  const full = living >= max;

  const close = () => { setDialog(null); setDialogError(null); };

  const act = async (twin: TwinSummary, fn: () => Promise<unknown>, done: string) => {
    setBusyId(twin.id);
    setMessage(null);
    try {
      await fn();
      setMessage({ ok: true, text: done });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: messageOf(e) });
    } finally {
      setBusyId(null);
    }
  };

  const fill = async () => {
    setFilling(true);
    setMessage(null);
    try {
      const { created } = await fillRandomVillagers();
      setMessage({
        ok: true,
        text: created.length === 1 ? `${created[0].name} moved in.` : `${created.length} new villagers moved in: ${created.map((t) => t.name).join(", ")}.`
      });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: messageOf(e) });
    } finally {
      setFilling(false);
    }
  };

  const add = async (role: "main" | "villager", v: TwinFormValues) => {
    const twin = await createTwin({
      name: v.name, appearance: v.appearance, role,
      personality: v.personality || undefined, goal: v.goal || undefined
    });
    close();
    setMessage({
      ok: true,
      text: twin.active ? `${twin.name} moved in.` : `${twin.name} was created. Press “Activate” to switch to this twin.`
    });
    await reload();
  };

  const edit = async (t: TwinSummary, v: TwinFormValues) => {
    const patch = patchFor(t, v);
    if (Object.keys(patch).length) await patchTwin(t.id, patch);
    close();
    setMessage({ ok: true, text: `${v.name} is updated.` });
    await reload();
  };

  const remove = async (t: TwinSummary) => {
    setDeleting(true);
    setDialogError(null);
    try {
      await deleteTwin(t.id);
      close();
      setMessage({ ok: true, text: `${t.name} was deleted.` });
      await reload();
    } catch (e) {
      setDialogError(messageOf(e));
    } finally {
      setDeleting(false);
    }
  };

  const openAdd = () => {
    setMessage(null);
    setDialog(addRole ? { kind: "add", role: addRole } : { kind: "pickRole" });
  };

  if (loadError && !info) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Notice tone="error">{loadError}</Notice>
        <div><Button onClick={() => void reload()}>Try again</Button></div>
      </div>
    );
  }

  const bar = barStyle(living / max, full ? "amber" : "blue");
  const twins = info ? sortTwins(info.twins) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SettingsStyle />

      {/* header */}
      <div style={{ ...panel, padding: "20px 22px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", display: "grid", gap: 8 }}>
            <h3 style={sectionTitle} aria-live="polite">
              Twins living here: {info ? living : "…"} / {max}
            </h3>
            <div style={{ ...bar.track, maxWidth: 320 }}><div style={bar.fill} /></div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button kind="primary" onClick={openAdd} disabled={!info}>
              + Add {addRole === "villager" ? "a person" : "twin"}
            </Button>
            <Button
              onClick={fill}
              busy={filling}
              disabled={!info || full}
              title={full ? "The village is full" : "Random people move in until the village is full"}
            >
              🎲 Fill with random villagers
            </Button>
          </div>
        </div>
        <p style={helpText}>
          Only the <b style={{ color: C.text }}>active main twin</b> listens to you. It can talk to the others for you.
          {full && " The village is full — hide or delete a twin to make room."}
        </p>
        {filling && <p style={{ ...helpText, fontSize: 13 }}>Writing names and personalities… this can take a few seconds.</p>}
        {message && <Notice tone={message.ok ? "success" : "error"}>{message.text}</Notice>}
      </div>

      {/* list */}
      {info && twins.length === 0 && (
        <div style={{ ...panel, padding: "28px 22px", textAlign: "center" }}>
          <p style={helpText}>Nobody lives here yet. Add your twin, or fill the village with random villagers.</p>
        </div>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {twins.map((t) => {
          const busy = busyId === t.id;
          const personality = personalityOf(t);
          const goal = goalOf(t);
          const activeMain = t.role === "main" && t.active;
          return (
            <li
              key={t.id}
              style={{
                ...panel, padding: "14px 18px",
                background: t.active ? "#fff" : "#f6f8fb",
                borderColor: activeMain ? "rgba(47,107,255,0.35)" : C.border
              }}
            >
              <div className="av-twin-row">
                <TwinThumb name={t.name} appearance={t.appearance} size={48} dim={!t.active} />
                <div style={{ flex: "1 1 220px", minWidth: 0, display: "grid", gap: 4, opacity: t.active ? 1 : 0.7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{t.name}</span>
                    <span style={pill(activeMain ? "blue" : t.role === "main" ? "blue" : "grey")}>{roleLabel(t)}</span>
                    {!t.active && <span style={pill("amber")}>hidden</span>}
                  </div>
                  {(personality || goal) && (
                    <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.45 }}>
                      {personality}
                      {personality && goal && " · "}
                      {goal && <span>Goal: {goal}</span>}
                    </div>
                  )}
                </div>
                <div className="av-twin-actions">
                  <Button size="sm" onClick={() => { setMessage(null); setDialog({ kind: "edit", twin: t }); }} disabled={busy}>
                    Edit look
                  </Button>
                  {t.active ? (
                    <Button
                      size="sm"
                      busy={busy}
                      onClick={() => act(t, () => deactivateTwin(t.id), `${t.name} is hidden. Everything about ${t.name} is kept.`)}
                      title="Hide from the village. All data is kept."
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      kind={t.role === "main" ? "primary" : "secondary"}
                      busy={busy}
                      onClick={() => act(t, () => activateTwin(t.id), t.role === "main" ? `${t.name} is now your active twin.` : `${t.name} is back in the village.`)}
                      title={t.role === "main" ? "Make this your active twin (the current one is hidden)" : "Bring back to the village"}
                    >
                      Activate
                    </Button>
                  )}
                  <Button size="sm" kind="dangerSoft" disabled={busy} onClick={() => { setDialogError(null); setDialog({ kind: "delete", twin: t }); }}>
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* dialogs */}
      {dialog?.kind === "pickRole" && (
        <Modal title="Who do you want to add?" onClose={close} width={620}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {([
              { role: "main" as const, title: "A main twin", emoji: "🧑", text: "Another “you”. Only one main twin is active at a time — it listens to you." },
              { role: "villager" as const, title: "A villager", emoji: "🏡", text: "Family, friends or anyone. They live their own life in the village." }
            ]).map((o) => (
              <button
                key={o.role}
                type="button"
                className="av-focus av-choice"
                onClick={() => setDialog({ kind: "add", role: o.role })}
                style={{
                  textAlign: "left", cursor: "pointer", fontFamily: FONT, color: C.text, background: "#fff",
                  border: "1.5px solid rgba(20,40,80,0.12)", borderRadius: 14, padding: "18px 18px", display: "grid", gap: 6
                }}
              >
                <span style={{ fontSize: 28 }} aria-hidden>{o.emoji}</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{o.title}</span>
                <span style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.45 }}>{o.text}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {dialog?.kind === "add" && (
        <Modal title={dialog.role === "main" ? "Build a main twin" : "Add a villager"} onClose={close}>
          <AvatarBuilder
            role={dialog.role}
            submitLabel={dialog.role === "main" ? "Create twin" : "Add to the village"}
            onSubmit={(v) => add(dialog.role, v)}
            onCancel={close}
          />
        </Modal>
      )}

      {dialog?.kind === "edit" && (
        <Modal title={`Edit ${dialog.twin.name}`} onClose={close}>
          <AvatarBuilder
            role={dialog.twin.role}
            initial={{
              name: dialog.twin.name,
              appearance: dialog.twin.appearance,
              personality: personalityOf(dialog.twin),
              goal: goalOf(dialog.twin)
            }}
            submitLabel="Save changes"
            onSubmit={(v) => edit(dialog.twin, v)}
            onCancel={close}
          />
        </Modal>
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.twin.name}?`}
          confirmLabel="Delete forever"
          busy={deleting}
          error={dialogError}
          onCancel={close}
          onConfirm={() => void remove(dialog.twin)}
        >
          <p style={{ margin: 0 }}>
            Everything about <b>{dialog.twin.name}</b> will be removed <b>forever</b>: memories, feelings, friendships and chat history.
            This cannot be undone.
          </p>
          {dialog.twin.active && (
            <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 14 }}>
              Want to keep them for later? Use <b>Deactivate</b> instead — it only hides them.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
