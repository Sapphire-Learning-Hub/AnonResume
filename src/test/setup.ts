import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { inject, vi } from "vitest";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

function loadEnvFile(fileName: string) {
  const filePath = join(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");
process.env.ANONRESUME_DB_SCHEMA =
  `${inject("databaseSchemaPrefix")}_${process.env.VITEST_POOL_ID ?? "1"}`;

const { CONFIG_REGISTRY } = await import("@/lib/config/registry");

for (const key of Object.values(CONFIG_REGISTRY).flatMap((definition) =>
  definition.environmentKey ? [definition.environmentKey] : []
)) {
  delete process.env[key];
}

process.env.BETTER_AUTH_SECRET ??= "anonresume-test-secret-2026-08-28";
process.env.CONFIG_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
