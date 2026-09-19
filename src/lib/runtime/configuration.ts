import {
  BootstrapConfigurationError,
  readBootstrapConfig,
  validateBootstrapConfiguration,
  type BootstrapConfigInput,
} from "@/lib/config/bootstrap";

export type RuntimeConfigurationIssue = string;
export type RuntimeConfigurationStatus = ReturnType<
  typeof validateBootstrapConfiguration
>;

export { validateBootstrapConfiguration };

// Compatibility export while callers migrate from environment-backed settings.
export function validateRuntimeConfiguration(
  environment: Record<string, string | undefined>,
): RuntimeConfigurationStatus {
  return validateBootstrapConfiguration({ environment });
}

export function resolveApplicationOriginForBootstrap(
  environment: Record<string, string | undefined>,
) {
  try {
    return readBootstrapConfig({ environment }).applicationOrigin;
  } catch (error) {
    if (!(error instanceof BootstrapConfigurationError)) throw error;
    const rawUrl = environment.BETTER_AUTH_URL?.trim();
    if (!rawUrl) return "http://localhost:3000";
    try {
      const url = new URL(rawUrl);
      return ["http:", "https:"].includes(url.protocol)
        ? url.origin
        : "http://localhost:3000";
    } catch {
      return "http://localhost:3000";
    }
  }
}

export function readRuntimeBootstrapConfig(input: BootstrapConfigInput = {}) {
  return readBootstrapConfig(input);
}
