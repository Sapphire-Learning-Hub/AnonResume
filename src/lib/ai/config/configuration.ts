import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { createConfigKeyring } from "@/lib/config/crypto";
import type { ManagedConfig } from "@/lib/config/registry";

export interface AiRuntimeConfiguration {
  auditRetentionDays: number;
  byokEnabled: boolean;
  credentialsEncryptionKey: Buffer;
  defaultMonthlyPoints: number;
  enabled: boolean;
  maxConcurrentRuns: number;
  platformEnabled: boolean;
  requestsPerMinute: number;
  runLeaseSeconds: number;
  streamCheckpointMs: number;
  trustedEndpointHostnames: readonly string[];
}

export function getAiCredentialsEncryptionKey() {
  const bootstrap = readBootstrapConfig();
  return createConfigKeyring({
    current: bootstrap.currentMasterKey,
    previous: bootstrap.previousMasterKey,
  }).keyFor("ai-credentials");
}

export function resolveAiConfiguration(
  values: Readonly<ManagedConfig>,
  credentialsEncryptionKey = getAiCredentialsEncryptionKey(),
): Readonly<AiRuntimeConfiguration> {
  const enabled = values.aiEnabled;
  const trustedEndpointHostnames = Object.freeze([
    ...values.aiTrustedEndpointHostnames,
  ]);

  return Object.freeze({
    auditRetentionDays: values.aiAuditRetentionDays,
    byokEnabled: enabled && values.aiByokEnabled,
    credentialsEncryptionKey,
    defaultMonthlyPoints: values.aiDefaultMonthlyPoints,
    enabled,
    maxConcurrentRuns: values.aiMaxConcurrentRuns,
    platformEnabled: enabled && values.aiPlatformEnabled,
    requestsPerMinute: values.aiRequestsPerMinute,
    runLeaseSeconds: values.aiRunLeaseSeconds,
    streamCheckpointMs: values.aiStreamCheckpointMs,
    trustedEndpointHostnames,
  });
}
