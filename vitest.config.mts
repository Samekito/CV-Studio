// Unit tests for the pure logic in src/lib (validation, invite codes, parsing). Route handlers
// and the database are verified in the browser and by prod-readiness checks, not here.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
