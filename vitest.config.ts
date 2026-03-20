import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "scripts/__tests__/**/*.test.js"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
