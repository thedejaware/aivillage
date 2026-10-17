import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { MapControls } from "three-stdlib";
import { guardControls, isStaleDrag } from "../../lib/village/controlsGuard";

/** A tiny fake DOM: just enough for three-stdlib's MapControls. */
function fakeDom() {
  const doc = new EventTarget();
  const el = Object.assign(new EventTarget(), {
    style: {} as Record<string, string>,
    ownerDocument: doc,
    clientWidth: 800,
    clientHeight: 600,
    setPointerCapture() {},
    releasePointerCapture() {},
    getRootNode: () => doc,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  });
  const win = new EventTarget();
  return { doc, el, win };
}

const ev = (type: string, props: Record<string, unknown>) =>
  Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 400, clientY: 300, pageX: 400, pageY: 300, ctrlKey: false, metaKey: false, shiftKey: false, ...props });

function setup() {
  const { doc, el, win } = fakeDom();
  const camera = new THREE.PerspectiveCamera(32, 800 / 600, 0.1, 300);
  camera.position.set(0, 20, 20);
  const controls = new MapControls(camera);
  controls.connect(el as unknown as HTMLElement);
  controls.update();
  /** a real browser runs the window's capture listeners first, then the element's */
  const send = (target: EventTarget, e: Event) => { win.dispatchEvent(e); target.dispatchEvent(e); };
  const dist = () => camera.position.distanceTo(controls.target);
  return { doc, el, win, camera, controls, send, dist };
}

describe("isStaleDrag", () => {
  it("a mouse with no button down cannot be dragging", () => {
    expect(isStaleDrag({ held: true, pointerType: "mouse", buttons: 0, type: "pointermove" })).toBe(true);
    expect(isStaleDrag({ held: true, pointerType: "mouse", buttons: 0, type: "wheel" })).toBe(true);
  });

  it("a new mouse press while the old one never ended is stale", () => {
    expect(isStaleDrag({ held: true, pointerType: "mouse", buttons: 1, type: "pointerdown" })).toBe(true);
  });

  it("a real drag is left alone", () => {
    expect(isStaleDrag({ held: true, pointerType: "mouse", buttons: 1, type: "pointermove" })).toBe(false);
    expect(isStaleDrag({ held: false, pointerType: "mouse", buttons: 0, type: "pointermove" })).toBe(false);
  });

  it("a second finger on a touch screen is a pinch, not a stale drag", () => {
    expect(isStaleDrag({ held: true, pointerType: "touch", buttons: 1, type: "pointerdown" })).toBe(false);
  });
});

describe("guardControls", () => {
  it("without the guard, a lost mouse-up blocks zoom (the bug)", () => {
    const { el, send, dist } = setup();
    send(el, ev("pointerdown", { buttons: 1 })); // the drag starts, its pointerup never comes
    const before = dist();
    send(el, ev("wheel", { deltaY: -100, deltaMode: 0 }));
    expect(dist()).toBe(before);
  });

  it("with the guard, zoom works again after a lost mouse-up", () => {
    const { el, win, controls, send, dist } = setup();
    guardControls(controls, win);
    send(el, ev("pointerdown", { buttons: 1 }));
    const before = dist();
    send(el, ev("wheel", { deltaY: -100, deltaMode: 0 }));
    expect(dist()).toBeLessThan(before);
  });

  it("with the guard, dragging works again after the controls were re-connected mid-drag", () => {
    const { doc, el, win, camera, controls, send } = setup();
    guardControls(controls, win);
    send(el, ev("pointerdown", { buttons: 1 }));
    controls.dispose(); // what a re-render with new callbacks did
    controls.connect(el as unknown as HTMLElement);
    send(el, ev("pointerdown", { buttons: 1, clientX: 400, clientY: 300 }));
    const before = camera.position.clone();
    doc.dispatchEvent(ev("pointermove", { buttons: 1, clientX: 300, clientY: 250 }));
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0.1);
  });

  it("a window blur mid-drag ends the drag (the mouse-up went to another app)", () => {
    const { el, win, controls, send, dist } = setup();
    guardControls(controls, win);
    send(el, ev("pointerdown", { buttons: 1 }));
    win.dispatchEvent(new Event("blur"));
    const before = dist();
    el.dispatchEvent(ev("wheel", { deltaY: -100, deltaMode: 0 })); // no window event first
    expect(dist()).toBeLessThan(before);
  });

  it("cleanup removes the guard", () => {
    const { el, win, controls, send, dist } = setup();
    guardControls(controls, win)();
    send(el, ev("pointerdown", { buttons: 1 }));
    const before = dist();
    send(el, ev("wheel", { deltaY: -100, deltaMode: 0 }));
    expect(dist()).toBe(before);
  });
});
