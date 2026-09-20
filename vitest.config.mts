import path from "node:path";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globalSetup: ["./tests/setup/global-setup.ts"],
    globals: true,
    maxWorkers: Math.max(availableParallelism() - 1, 1),
    setupFiles: ["./src/test/setup.ts"],
  },
});
