import {
  BootstrapConfigurationError,
  readBootstrapConfig,
  resolveBootstrapApplicationOrigin,
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
  environment?: Record<string, string | undefined>,
) {
  try {
    return readBootstrapConfig(environment ? { environment } : {}).applicationOrigin;
  } catch (error) {
    if (!(error instanceof BootstrapConfigurationError)) throw error;
    return resolveBootstrapApplicationOrigin(
      environment ? { environment } : {},
    );
  }
}

export function readRuntimeBootstrapConfig(input: BootstrapConfigInput = {}) {
  return readBootstrapConfig(input);
}
