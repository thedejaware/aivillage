import { describe, it, expect } from "vitest";
import { users, twins, creditLedger } from "../../src/db/schema.js";

describe("schema", () => {
  it("exposes the expected tables and key columns", () => {
    expect(Object.keys(users)).toEqual(expect.arrayContaining(["id", "email", "credits"]));
    expect(Object.keys(twins)).toEqual(
      expect.arrayContaining(["id", "ownerUserId", "energy", "energyUpdatedAt", "isNpc"])
    );
    expect(Object.keys(creditLedger)).toEqual(
      expect.arrayContaining(["id", "userId", "delta", "reason"])
    );
  });
});
