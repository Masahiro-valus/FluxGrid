import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: true,
    environmentMatchGlobs: [
      ["test/webview/**/*.test.ts", "jsdom"]
    ],
    coverage: {
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      enabled: false
    }
  }
});

