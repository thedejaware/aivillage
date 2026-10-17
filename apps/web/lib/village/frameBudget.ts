/**
 * How often the 3D village redraws. The scene is calm (slow walks, gentle
 * bobbing), so it idles at 30 fps and only goes to 60 fps while the user is
 * moving the camera. A hidden tab draws nothing. Keeps laptops cool.
 */

export const IDLE_FPS = 30;
export const ACTIVE_FPS = 60;
/** Stay smooth this long after the last drag/zoom (covers camera damping). */
export const ACTIVE_WINDOW_MS = 1500;

export function targetFps(s: { hidden: boolean; now: number; lastInteraction: number }): number {
  if (s.hidden) return 0;
  return s.now - s.lastInteraction <= ACTIVE_WINDOW_MS ? ACTIVE_FPS : IDLE_FPS;
}
