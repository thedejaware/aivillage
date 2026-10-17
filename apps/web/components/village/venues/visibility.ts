/**
 * Cheap "is this on screen?" test for animated scenery. The camera frustum is
 * rebuilt at most once per frame (keyed by the frame's clock time) and shared
 * by every caller; nothing is allocated per frame. A hidden tab counts as
 * off-screen, so animated props stop doing work there too.
 */
import * as THREE from "three";

const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
let stamp = Number.NaN;

export function onScreen(camera: THREE.Camera, frameTime: number, sphere: THREE.Sphere): boolean {
  if (typeof document !== "undefined" && document.hidden) return false;
  if (frameTime !== stamp) {
    stamp = frameTime;
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj);
  }
  return frustum.intersectsSphere(sphere);
}

/** The bits of the browser sim that the places read (all optional: read defensively). */
export interface PlacesSim {
  coaster?: { t: number; running: boolean; riders: string[] };
  bikesInUse?: () => number;
  sleepingCount?: () => number;
  spots?: { id: string; busyBy: string | null }[];
}
