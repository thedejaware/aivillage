import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestDb, type TestDb } from "./helpers.js";
import { DrizzleSettingsRepository, maskKey } from "../../src/db/settingsRepository.js";

let tdb: TestDb;
let repo: DrizzleSettingsRepository;

beforeAll(async () => {
  tdb = await startTestDb();
  repo = new DrizzleSettingsRepository(tdb.db);
});
afterAll(async () => { await tdb.stop(); });

describe("DrizzleSettingsRepository", () => {
  it("is empty before the first setup", async () => {
    expect(await repo.get()).toBeNull();
  });
  it("saves and reads the village settings", async () => {
    const s = { provider: "gemini", model: "gemini-flash-lite", apiKey: "AIza-secret-1234", baseUrl: null, chattiness: "normal" as const };
    await repo.save(s);
    expect(await repo.get()).toEqual(s);
  });
  it("keeps a single row: saving again replaces it", async () => {
    await repo.save({ provider: "ollama", model: "llama3.2", apiKey: null, baseUrl: "http://localhost:11434/v1", chattiness: "busy" });
    expect(await repo.get()).toMatchObject({ provider: "ollama", apiKey: null, chattiness: "busy" });
  });
});

describe("maskKey", () => {
  it("shows only the last 4 characters", () => {
    expect(maskKey("sk-ant-abcdefgh1234")).toBe("••••1234");
    expect(maskKey(null)).toBeNull();
    expect(maskKey("abc")).toBe("••••");
  });
});
