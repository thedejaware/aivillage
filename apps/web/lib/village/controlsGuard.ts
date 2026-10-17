/**
 * Safety net for the map camera (three-stdlib OrbitControls / MapControls).
 *
 * The controls only end a drag on "pointerup". If that event is lost — the
 * mouse is released in another app after Cmd-Tab, or the controls were
 * re-connected mid-drag — they stay "dragging" for ever: the wheel is ignored
 * (no zoom) and new drags don't move the map. The guard spots that state from
 * the next mouse event and ends the old drag first ("pointercancel" is always
 * listened to on the controls' element).
 */

export interface StaleCheck {
  /** the controls think a drag is going on */
  held: boolean;
  pointerType: string;
  /** mouse buttons pressed right now (MouseEvent.buttons) */
  buttons: number;
  type: "pointerdown" | "pointermove" | "wheel";
}

export function isStaleDrag({ held, pointerType, buttons, type }: StaleCheck): boolean {
  if (!held || pointerType === "touch") return false; // a second finger is a pinch
  return type === "pointerdown" || buttons === 0;
}

interface Controls {
  domElement?: EventTarget | null;
  addEventListener(type: "start" | "end", fn: () => void): void;
  removeEventListener(type: "start" | "end", fn: () => void): void;
}

/** Watches the controls and un-sticks them; returns the cleanup. */
export function guardControls(controls: Controls, win: EventTarget = window): () => void {
  let held = false;
  let pointerId = 1;
  const onStart = () => { held = true; };
  const onEnd = () => { held = false; };

  const release = () => {
    const el = controls.domElement;
    held = false;
    if (!el) return;
    el.dispatchEvent(Object.assign(new Event("pointercancel"), { pointerId, pointerType: "mouse" }));
  };

  const check = (e: Event) => {
    const m = e as Event & { pointerType?: string; buttons?: number; pointerId?: number };
    const type = e.type as StaleCheck["type"];
    if (isStaleDrag({ held, pointerType: m.pointerType ?? "mouse", buttons: m.buttons ?? 0, type })) release();
    if (type === "pointerdown" && m.pointerId !== undefined) pointerId = m.pointerId;
  };
  const onBlur = () => { if (held) release(); };

  controls.addEventListener("start", onStart);
  controls.addEventListener("end", onEnd);
  // capture phase: runs before the controls see the event
  for (const t of ["pointerdown", "pointermove", "wheel"]) win.addEventListener(t, check, { capture: true });
  win.addEventListener("blur", onBlur);

  return () => {
    controls.removeEventListener("start", onStart);
    controls.removeEventListener("end", onEnd);
    for (const t of ["pointerdown", "pointermove", "wheel"]) win.removeEventListener(t, check, { capture: true });
    win.removeEventListener("blur", onBlur);
  };
}
