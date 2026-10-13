export type SystemRestartOperationErrorCode =
  | "configuration_unavailable"
  | "no_pending_restart"
  | "operation_active"
  | "restart_unsupported"
  | "runtime_stale"
  | "runtime_unhealthy";

export class SystemRestartOperationError extends Error {
  constructor(public readonly code: SystemRestartOperationErrorCode) {
    super(code);
    this.name = "SystemRestartOperationError";
  }
}
