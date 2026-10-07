import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    // every DB test file boots its own Postgres container; under load that takes > 10 s
    hookTimeout: 120_000
  }
});
