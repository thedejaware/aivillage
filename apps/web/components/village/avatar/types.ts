import type { BodyAnim } from "@aivillage/shared";

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
}
