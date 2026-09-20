import { defineConfig, devices } from "playwright/test";

import { loadTestEnvironmentFile } from "./tests/setup/environment";

loadTestEnvironmentFile();

const port = 3107;
const baseURL = `http://localhost:${port}`;
const databaseSchema =
  process.env.ANONRESUME_E2E_SCHEMA ?? `anonresume_e2e_${process.pid}`;

process.env.ANONRESUME_E2E_SCHEMA = databaseSchema;
process.env.ANONRESUME_DB_SCHEMA = databaseSchema;
process.env.ANONRESUME_DEPLOYMENT_ID = "e2e-setup";
process.env.ANONRESUME_INSTANCE_ID = "web-1";
process.env.BETTER_AUTH_URL = baseURL;
process.env.E2E_BASE_URL = baseURL;

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: "line",
  retries: 0,
  testDir: "./tests/e2e",
  timeout: 120_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "zh-CN",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run tests/e2e/server.ts ${port}`,
    env: {
      ANONRESUME_DB_SCHEMA: databaseSchema,
      ANONRESUME_E2E_SCHEMA: databaseSchema,
      ANONRESUME_DEPLOYMENT_ID: "e2e-setup",
      ANONRESUME_INSTANCE_ID: "web-1",
      BETTER_AUTH_URL: baseURL,
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${baseURL}/api/health/ready`,
  },
  workers: 1,
});
