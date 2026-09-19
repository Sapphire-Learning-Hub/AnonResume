import { z } from "zod";

import type { AdminMessageKey } from "@/i18n/admin-messages";
import {
  CONFIG_KEYS,
  type ConfigKey,
} from "@/lib/config/registry";
import type {
  ManagedConfigurationHistoryChange,
  ManagedConfigurationRevisionView,
  ManagedConfigurationView,
} from "@/lib/config/admin/types";

export type {
  ManagedConfigurationHistoryChange,
  ManagedConfigurationRevisionView,
  ManagedConfigurationView,
};

export type ConfigurationFieldChange =
  | { operation: "clear" }
  | { operation: "set"; value: boolean | number | string | string[] };

export const configurationFieldMessageKeys: Record<ConfigKey, AdminMessageKey> = {
  smtpHost: "configuration.field.smtpHost",
  smtpPort: "configuration.field.smtpPort",
  smtpSecure: "configuration.field.smtpSecure",
  smtpUser: "configuration.field.smtpUser",
  smtpPassword: "configuration.field.smtpPassword",
  emailFrom: "configuration.field.emailFrom",
  emailVerificationExpiresSeconds: "configuration.field.emailVerificationExpiresSeconds",
  githubClientId: "configuration.field.githubClientId",
  githubClientSecret: "configuration.field.githubClientSecret",
  adminSessionIdleSeconds: "configuration.field.adminSessionIdleSeconds",
  adminSessionMaxSeconds: "configuration.field.adminSessionMaxSeconds",
  adminReauthSeconds: "configuration.field.adminReauthSeconds",
  pdfMaxConcurrency: "configuration.field.pdfMaxConcurrency",
  pdfQueueLimit: "configuration.field.pdfQueueLimit",
  pdfMaxActivePerUser: "configuration.field.pdfMaxActivePerUser",
  pdfMaxAttempts: "configuration.field.pdfMaxAttempts",
  pdfLeaseMs: "configuration.field.pdfLeaseMs",
  pdfResultTtlMs: "configuration.field.pdfResultTtlMs",
  pdfForceExpiryMs: "configuration.field.pdfForceExpiryMs",
  pdfAllowAnonymous: "configuration.field.pdfAllowAnonymous",
  resumeVersionHistoryLimit: "configuration.field.resumeVersionHistoryLimit",
  aiEnabled: "configuration.field.aiEnabled",
  aiPlatformEnabled: "configuration.field.aiPlatformEnabled",
  aiByokEnabled: "configuration.field.aiByokEnabled",
  aiTrustedEndpointHostnames: "configuration.field.aiTrustedEndpointHostnames",
  aiAuditRetentionDays: "configuration.field.aiAuditRetentionDays",
  aiStreamCheckpointMs: "configuration.field.aiStreamCheckpointMs",
  aiRunLeaseSeconds: "configuration.field.aiRunLeaseSeconds",
  aiRequestsPerMinute: "configuration.field.aiRequestsPerMinute",
  aiMaxConcurrentRuns: "configuration.field.aiMaxConcurrentRuns",
  aiDefaultMonthlyPoints: "configuration.field.aiDefaultMonthlyPoints",
  aiWorkerBatchSize: "configuration.field.aiWorkerBatchSize",
  aiWorkerPollIntervalMs: "configuration.field.aiWorkerPollIntervalMs",
  aiWorkerRecoveryIntervalMs: "configuration.field.aiWorkerRecoveryIntervalMs",
  aiWorkerRetentionIntervalMs: "configuration.field.aiWorkerRetentionIntervalMs",
  sourceCodeUrl: "configuration.field.sourceCodeUrl",
};

export const configurationGroupMessageKeys = {
  general: "configuration.group.general",
  email: "configuration.group.email",
  security: "configuration.group.security",
  pdf: "configuration.group.pdf",
  resume: "configuration.group.resume",
  ai: "configuration.group.ai",
} as const satisfies Record<string, AdminMessageKey>;

export const configurationNumberBounds: Partial<
  Record<ConfigKey, { min: number; max?: number }>
> = {
  smtpPort: { min: 1, max: 65_535 },
  emailVerificationExpiresSeconds: { min: 300 },
  adminSessionIdleSeconds: { min: 1 },
  adminSessionMaxSeconds: { min: 1 },
  adminReauthSeconds: { min: 1 },
  pdfMaxConcurrency: { min: 1 },
  pdfQueueLimit: { min: 1 },
  pdfMaxActivePerUser: { min: 1 },
  pdfMaxAttempts: { min: 1 },
  pdfLeaseMs: { min: 1 },
  pdfResultTtlMs: { min: 1 },
  pdfForceExpiryMs: { min: 1 },
  resumeVersionHistoryLimit: { min: 1 },
  aiAuditRetentionDays: { min: 1 },
  aiStreamCheckpointMs: { min: 1 },
  aiRunLeaseSeconds: { min: 1 },
  aiRequestsPerMinute: { min: 1 },
  aiMaxConcurrentRuns: { min: 1 },
  aiDefaultMonthlyPoints: { min: 0 },
  aiWorkerBatchSize: { min: 1 },
  aiWorkerPollIntervalMs: { min: 1 },
  aiWorkerRecoveryIntervalMs: { min: 1 },
  aiWorkerRetentionIntervalMs: { min: 1 },
};

const configKeySchema = z.enum(CONFIG_KEYS as [ConfigKey, ...ConfigKey[]]);
const configValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.string()),
]);
const configFieldSchema = z.object({
  applyMode: z.enum(["hot", "restart"]),
  configured: z.boolean(),
  consumers: z.array(z.enum(["web", "pdf-worker", "ai-worker"])),
  group: z.enum(["general", "email", "security", "pdf", "resume", "ai"]),
  key: configKeySchema,
  public: z.boolean(),
  sensitive: z.boolean(),
  value: configValueSchema.optional(),
});

const configurationViewSchema = z.object({
  activeRevision: z.object({ id: z.string(), version: z.number().int() }),
  draftRevision: z.object({
    baseVersion: z.number().int(),
    id: z.string(),
    updatedAt: z.string(),
  }),
  fields: z.array(configFieldSchema),
  pendingRestartConsumers: z.array(z.enum(["web", "pdf-worker", "ai-worker"])),
});

const historyChangeSchema = z.union([
  z.object({
    after: z.unknown(),
    before: z.unknown(),
    field: z.string(),
    sensitive: z.literal(false).optional(),
  }),
  z.object({
    field: z.string(),
    operation: z.enum(["clear", "set"]),
    sensitive: z.literal(true),
  }),
]);
const historySchema = z.array(z.object({
  changes: z.array(historyChangeSchema),
  createdAt: z.string(),
  createdByUserId: z.string(),
  id: z.string(),
  publishedAt: z.string().nullable(),
  publishedByUserId: z.string().nullable(),
  status: z.enum(["active", "draft", "superseded"]),
  summary: z.string().nullable(),
  updatedAt: z.string(),
  version: z.number().int(),
}));

export function parseManagedConfigurationView(input: unknown) {
  return configurationViewSchema.parse(input) as ManagedConfigurationView;
}

export function parseManagedConfigurationHistory(input: unknown) {
  return historySchema.parse(input) as ManagedConfigurationRevisionView[];
}
