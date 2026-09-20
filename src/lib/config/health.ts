export type ManagedConfigurationHealthState =
  | "healthy"
  | "restart_required"
  | "degraded"
  | "recovery_required";

export type ConfigurationHealthState =
  | ManagedConfigurationHealthState
  | "bootstrap_invalid";

export function classifyConfigurationHealth(input: {
  bootstrapInvalid?: boolean;
  degraded?: boolean;
  recoveryRequired?: boolean;
  restartRequired?: boolean;
}): ConfigurationHealthState {
  if (input.bootstrapInvalid) return "bootstrap_invalid";
  if (input.recoveryRequired) return "recovery_required";
  if (input.degraded) return "degraded";
  if (input.restartRequired) return "restart_required";
  return "healthy";
}
