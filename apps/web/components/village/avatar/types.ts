import type { ActionItem, BodyAnim } from "@aivillage/shared";

/** What the body is doing this frame. `pose()` returns one of these every frame. */
export interface AvatarPose {
  /** what the body is doing now */
  anim: BodyAnim;
  /** seconds since this anim started (for one-shots like jump/wave) */
  animTime: number;
  /** legs/arms walk cycle when true (overrides anim's legs) */
  walking: boolean;
  /** advancing phase for the walk cycle (radians) */
  walkPhase: number;
  /** 1 = walk, ~1.8 = run (bigger stride/arm swing) */
  speed: number;
  /** something held (juice glass, plate, popcorn, basket, dumbbells); overrides the anim's own prop */
  item?: ActionItem | null;
  /**
   * On a seat (café chair, cinema seat, coaster cart): hips and legs sit, the upper body plays
   * `anim` (drink, eat, talk, cheer…). Ignored by the seated anims themselves and by swim/sleep.
   */
  seated?: boolean;
}
