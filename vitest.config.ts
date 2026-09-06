import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // DST tests are only meaningful under a zone that observes it.
    env: { TZ: "Europe/Berlin" },
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
