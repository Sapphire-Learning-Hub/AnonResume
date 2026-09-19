import { runAiWorker } from "@/lib/ai/worker";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getDatabasePool } from "@/lib/runtime/database";
import { validateRuntimeConfiguration } from "@/lib/runtime/configuration";

const configuration = validateRuntimeConfiguration(process.env);
if (!configuration.valid) {
  throw new Error(
    `Invalid production configuration: ${configuration.issues.join(", ")}`,
  );
}
const aiConfiguration = resolveAiConfiguration(process.env);
if (!aiConfiguration.enabled || !aiConfiguration.credentialsEncryptionKey) {
  throw new Error("AI worker requires an enabled AI configuration");
}

const controller = new AbortController();
const stop = () => controller.abort();

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

try {
  await runAiWorker({
    signal: controller.signal,
    encryptionKey: aiConfiguration.credentialsEncryptionKey,
    leaseSeconds: aiConfiguration.runLeaseSeconds,
  });
} finally {
  await getDatabasePool().end();
}
