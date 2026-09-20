import { getRuntimeConfig } from "@/lib/config/runtime";
import { getDatabasePool } from "@/lib/runtime/database";
import { validateBootstrapConfiguration } from "@/lib/runtime/configuration";

interface ReadinessDependencies {
  validateBootstrap: typeof validateBootstrapConfiguration;
  checkDatabase: () => Promise<void>;
  loadRuntime: () => Promise<{ health: string }>;
}

const defaultDependencies: ReadinessDependencies = {
  validateBootstrap: validateBootstrapConfiguration,
  async checkDatabase() {
    await getDatabasePool().query("SELECT 1");
  },
  async loadRuntime() {
    return getRuntimeConfig("web");
  },
};

export async function checkApplicationReadiness(
  dependencies: ReadinessDependencies = defaultDependencies,
): Promise<{ ready: true } | { ready: false; reason: string }> {
  const bootstrap = dependencies.validateBootstrap();
  if (!bootstrap.valid) {
    return { ready: false, reason: "bootstrap_invalid" };
  }

  try {
    await dependencies.checkDatabase();
    const runtime = await dependencies.loadRuntime();
    if (runtime.health === "recovery_required") {
      return { ready: false, reason: "configuration_unavailable" };
    }
    return { ready: true };
  } catch {
    return { ready: false, reason: "core_unavailable" };
  }
}
