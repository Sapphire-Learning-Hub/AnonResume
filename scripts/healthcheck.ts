import { readHealthcheckEnvironment } from "@/lib/config/process-environment";
import { getDatabasePool } from "@/lib/runtime/database";
import { resolveRuntimeIdentity } from "@/lib/runtime/instance-identity";
import { checkWorkerHealth } from "@/lib/runtime/worker-health";

const target = process.argv[2];
const environment = readHealthcheckEnvironment();

async function checkWeb() {
  const port = environment.PORT?.trim() || "3000";
  const url = environment.ANONRESUME_HEALTHCHECK_URL?.trim() ||
    `http://127.0.0.1:${port}/api/health/ready`;
  const response = await fetch(url, { redirect: "manual" });
  return response.ok;
}

async function checkWorker(role: "ai-worker" | "pdf-worker") {
  const identity = resolveRuntimeIdentity(role);
  const result = await checkWorkerHealth({
    workerId: identity.stableId,
    workerType: role === "ai-worker" ? "ai-runtime" : "pdf-export",
  });
  return result.healthy;
}

let healthy = false;
try {
  if (target === "web") healthy = await checkWeb();
  else if (target === "ai-worker" || target === "pdf-worker") {
    healthy = await checkWorker(target);
  } else {
    throw new Error("Usage: healthcheck <web|ai-worker|pdf-worker>");
  }
} finally {
  if (target !== "web") {
    await getDatabasePool().end().catch(() => undefined);
  }
}

if (!healthy) process.exitCode = 1;
