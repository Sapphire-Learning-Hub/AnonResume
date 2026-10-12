import { existsSync } from "node:fs";

import { readRuntimeSupervisorEnvironment } from "@/lib/config/process-environment";

export type RuntimeSupervisorKind =
  | "docker-compose"
  | "systemd"
  | "container"
  | "manual";

export type RuntimeSupervisorReasonCode =
  | "restart_policy_unverified"
  | "supervisor_unavailable";

export interface RuntimeSupervisorCapability {
  kind: RuntimeSupervisorKind;
  reasonCode: RuntimeSupervisorReasonCode | null;
  restartSupported: boolean;
}

export function resolveRuntimeSupervisor(options: {
  environment?: ReturnType<typeof readRuntimeSupervisorEnvironment>;
  fileExists?: (path: string) => boolean;
} = {}): RuntimeSupervisorCapability {
  const environment =
    options.environment ?? readRuntimeSupervisorEnvironment();
  const fileExists = options.fileExists ?? existsSync;

  if (environment.ANONRESUME_PROCESS_SUPERVISOR === "docker-compose") {
    return {
      kind: "docker-compose",
      reasonCode: null,
      restartSupported: true,
    };
  }

  if (environment.INVOCATION_ID?.trim()) {
    return {
      kind: "systemd",
      reasonCode: null,
      restartSupported: true,
    };
  }

  if (fileExists("/.dockerenv")) {
    return {
      kind: "container",
      reasonCode: "restart_policy_unverified",
      restartSupported: false,
    };
  }

  return {
    kind: "manual",
    reasonCode: "supervisor_unavailable",
    restartSupported: false,
  };
}
