import { describe, it, expect } from "vitest";
import { EDGE_GAP, groundLabelPlacement } from "../../lib/village/venueLabels";

describe("groundLabelPlacement", () => {
  const center = { x: 2, z: -1 };

  it("puts the name at the venue's edge nearest the camera", () => {
    const p = groundLabelPlacement(center, 1.2, { x: 2, z: 20 }); // camera straight "south" (+z)
    expect(p.x).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(-1 + 1.2 + EDGE_GAP);
  });

  it("turns the text so it reads upright from the camera", () => {
    // camera on +z: the text's top must point away from the camera (−z) → no rotation
    expect(groundLabelPlacement(center, 1.2, { x: 2, z: 20 }).yaw).toBeCloseTo(0);
    // camera on +x: rotate a quarter turn
    expect(groundLabelPlacement(center, 1.2, { x: 30, z: -1 }).yaw).toBeCloseTo(Math.PI / 2);
  });

  it("works from the default diagonal view", () => {
    const p = groundLabelPlacement({ x: 0, z: 0 }, 1, { x: 11, z: 11 });
    expect(p.x).toBeCloseTo(p.z);
    expect(p.x).toBeGreaterThan(0);
    expect(p.yaw).toBeCloseTo(Math.PI / 4);
  });
});
