import { runAiWorker } from "@/lib/ai/worker";
import { getAiCredentialsEncryptionKey } from "@/lib/ai/config/configuration";
import { getRuntimeConfigManager } from "@/lib/config/runtime";
import { getDatabasePool } from "@/lib/runtime/database";
import { validateBootstrapConfiguration } from "@/lib/runtime/configuration";

const configuration = validateBootstrapConfiguration();
if (!configuration.valid) {
  throw new Error(
    `Invalid production configuration: ${configuration.issues.join(", ")}`,
  );
}
const controller = new AbortController();
const stop = () => controller.abort();
const runtimeManager = getRuntimeConfigManager("ai-worker");

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await runtimeManager.start();
  await runAiWorker({
    signal: controller.signal,
    encryptionKey: getAiCredentialsEncryptionKey(),
    runtimeManager,
  });
} finally {
  await runtimeManager.stop();
  await getDatabasePool().end();
}
