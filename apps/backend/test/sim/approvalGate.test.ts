import { describe, it, expect } from "vitest";
import type { Approval } from "@aivillage/shared";
import { gateProjectStart } from "../../src/sim/approvalGate.js";

const makeApproval = (id: string): Approval => ({
  id,
  userId: "user-1",
  twinId: "twin-1",
  kind: "start_project",
  payload: { projectType: "fountain", zone: "plaza" },
  status: "approved",
  createdAt: new Date().toISOString(),
  resolvedAt: new Date().toISOString(),
  consumedAt: null,
});

describe("gateProjectStart", () => {
  it("NPC twin (ownerUserId null) always proceeds with no consumeApprovalId", () => {
    const result = gateProjectStart({ ownerUserId: null, actionable: null, hasPending: false });
    expect(result).toEqual({ action: "proceed", consumeApprovalId: null });
  });

  it("NPC twin proceeds even if actionable approval exists (belt-and-suspenders)", () => {
    const result = gateProjectStart({
      ownerUserId: null,
      actionable: makeApproval("appr-1"),
      hasPending: true,
    });
    expect(result).toEqual({ action: "proceed", consumeApprovalId: null });
  });

  it("owned twin with an actionable approval proceeds and returns the approval id to consume", () => {
    const approval = makeApproval("appr-abc");
    const result = gateProjectStart({ ownerUserId: "user-1", actionable: approval, hasPending: false });
    expect(result).toEqual({ action: "proceed", consumeApprovalId: "appr-abc" });
  });

  it("owned twin with no actionable but a pending approval waits", () => {
    const result = gateProjectStart({ ownerUserId: "user-1", actionable: null, hasPending: true });
    expect(result).toEqual({ action: "wait" });
  });

  it("owned twin with no actionable and no pending requests approval", () => {
    const result = gateProjectStart({ ownerUserId: "user-1", actionable: null, hasPending: false });
    expect(result).toEqual({ action: "request" });
  });
});
