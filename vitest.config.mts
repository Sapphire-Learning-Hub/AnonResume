import path from "node:path";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const maxWorkers = Math.min(Math.max(availableParallelism() - 1, 1), 4);

export default defineConfig({
  plugins: [mdx(), react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    environment: "jsdom",
    globalSetup: ["./tests/setup/global-setup.ts"],
    globals: true,
    maxWorkers,
    setupFiles: ["./src/test/setup.ts"],
  },
});
