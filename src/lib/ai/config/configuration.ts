import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { createConfigKeyring } from "@/lib/config/crypto";
import type { ManagedConfig } from "@/lib/config/registry";
import {
  createVersionedSecretKeys,
  type VersionedSecretKeys,
} from "@/lib/config/secret-keyring";

export interface AiRuntimeConfiguration {
  auditRetentionDays: number;
  byokEnabled: boolean;
  credentialsEncryptionKey: Buffer;
  credentialKeys: VersionedSecretKeys;
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
  return getAiCredentialSecretKeys().current;
}

export function getAiCredentialSecretKeys() {
  const bootstrap = readBootstrapConfig();
  return createVersionedSecretKeys({
    keyring: createConfigKeyring({
      current: bootstrap.currentMasterKey,
      previous: bootstrap.previousMasterKey,
    }),
    legacy: bootstrap.legacyAiCredentialsKey,
    purpose: "ai-credentials",
  });
}

export function resolveAiConfiguration(
  values: Readonly<ManagedConfig>,
  credentialKeys: VersionedSecretKeys | Buffer = getAiCredentialSecretKeys(),
): Readonly<AiRuntimeConfiguration> {
  const enabled = values.aiEnabled;
  const resolvedCredentialKeys = Buffer.isBuffer(credentialKeys)
    ? Object.freeze({ current: credentialKeys })
    : credentialKeys;
  const trustedEndpointHostnames = Object.freeze([
    ...values.aiTrustedEndpointHostnames,
  ]);

  return Object.freeze({
    auditRetentionDays: values.aiAuditRetentionDays,
    byokEnabled: enabled && values.aiByokEnabled,
    credentialKeys: resolvedCredentialKeys,
    credentialsEncryptionKey: resolvedCredentialKeys.current,
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
