import { describe, it, expect } from "vitest";
import { startProject, advance, isComplete } from "../../src/projects/lifecycle.js";

describe("startProject", () => {
  it("creates an active project at 0 progress", () => {
    const p = startProject("p1", "fountain", "plaza", ["t1"], 3);
    expect(p).toMatchObject({ id: "p1", type: "fountain", zone: "plaza", stepsDone: 0, status: "active" });
  });
  it("throws if stepsTotal < 1", () => {
    expect(() => startProject("p1", "fountain", "plaza", ["t1"], 0)).toThrow();
  });
});

describe("advance", () => {
  it("increments progress and stays active before the end", () => {
    const p = advance(startProject("p1", "fountain", "plaza", ["t1"], 3));
    expect(p.stepsDone).toBe(1);
    expect(p.status).toBe("active");
  });
  it("completes on the final step and does not overshoot", () => {
    let p = startProject("p1", "fountain", "plaza", ["t1"], 2);
    p = advance(advance(advance(p)));
    expect(p.stepsDone).toBe(2);
    expect(p.status).toBe("complete");
    expect(isComplete(p)).toBe(true);
  });
});
