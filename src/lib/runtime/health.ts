import { getRuntimeConfig } from "@/lib/config/runtime";
import { getDatabasePool } from "@/lib/runtime/database";
import { validateBootstrapConfiguration } from "@/lib/runtime/configuration";
import { inspectPublicSetupStatus } from "@/lib/admin/setup/session";

interface ReadinessDependencies {
  validateBootstrap: typeof validateBootstrapConfiguration;
  checkDatabase: () => Promise<void>;
  loadRuntime: () => Promise<{ health: string }>;
  loadSetupStatus: typeof inspectPublicSetupStatus;
  timeoutMs?: number;
}

const DEFAULT_READINESS_TIMEOUT_MS = 5_000;

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("readiness_timeout")), timeoutMs);
    timeout.unref?.();
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const defaultDependencies: ReadinessDependencies = {
  validateBootstrap: validateBootstrapConfiguration,
  async checkDatabase() {
    await getDatabasePool().query("SELECT 1");
  },
  async loadRuntime() {
    return getRuntimeConfig("web");
  },
  loadSetupStatus: inspectPublicSetupStatus,
};

export async function checkApplicationReadiness(
  dependencies: ReadinessDependencies = defaultDependencies,
): Promise<
  | { ready: true; setupRequired: boolean }
  | { ready: false; reason: string }
> {
  const bootstrap = dependencies.validateBootstrap();
  if (!bootstrap.valid) {
    return { ready: false, reason: "bootstrap_invalid" };
  }

  try {
    return await withTimeout(
      (async () => {
        await dependencies.checkDatabase();
        const runtime = await dependencies.loadRuntime();
        if (runtime.health === "recovery_required") {
          return { ready: false as const, reason: "configuration_unavailable" };
        }
        const setup = await dependencies.loadSetupStatus();
        return { ready: true as const, setupRequired: setup.required };
      })(),
      dependencies.timeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS,
    );
  } catch {
    return { ready: false, reason: "core_unavailable" };
  }
}
