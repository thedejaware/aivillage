/**
 * Auto-pause: the server keeps the village (and its AI calls) running while any
 * browser is connected — including a tab the owner forgot. The page pauses
 * itself (disconnects) when nobody is really watching.
 */

/** A tab hidden this long pauses the village. */
export const HIDDEN_PAUSE_MS = 60_000;
/** No pointer / keyboard / wheel / touch input for this long pauses it too. */
export const IDLE_PAUSE_MS = 10 * 60_000;

export interface PresenceInput {
  /** document.hidden */
  hidden: boolean;
  /** when the tab became hidden (ms), null if unknown / visible */
  hiddenSince: number | null;
  /** last user input (ms) */
  lastInputAt: number;
  now: number;
}

export function shouldPause({ hidden, hiddenSince, lastInputAt, now }: PresenceInput): boolean {
  if (hidden && hiddenSince !== null && now - hiddenSince >= HIDDEN_PAUSE_MS) return true;
  return now - lastInputAt >= IDLE_PAUSE_MS;
}
