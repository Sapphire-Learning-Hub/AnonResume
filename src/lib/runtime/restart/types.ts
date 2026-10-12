import type {
  SystemRestartOperationStatus,
  SystemRestartTargetStatus,
} from "@/db/config-schema";
import type { ConfigConsumer } from "@/lib/config/types";
import type { RuntimeSupervisorKind } from "@/lib/runtime/restart/supervisor";

export interface SystemRestartTargetView {
  completedAt: string | null;
  consumer: ConfigConsumer;
  desiredRestartRevisionId: string;
  drainStartedAt: string | null;
  errorCode: string | null;
  exitStartedAt: string | null;
  expectedSessionId: string;
  instanceId: string;
  sequence: number;
  status: SystemRestartTargetStatus;
  supervisorKind: RuntimeSupervisorKind;
}

export interface SystemRestartOperationView {
  actorUserId: string;
  completedAt: string | null;
  createdAt: string;
  deploymentId: string;
  desiredRevisionId: string;
  errorCode: string | null;
  id: string;
  startedAt: string | null;
  status: SystemRestartOperationStatus;
  targets: SystemRestartTargetView[];
  updatedAt: string;
}
