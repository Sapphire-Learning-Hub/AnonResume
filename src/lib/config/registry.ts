import { z } from "zod";

import type { ConfigDefinition } from "@/lib/config/types";

const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().nonnegative();
const optionalText = z.string().trim();
const hostname = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(`https://${value}`);
      return url.hostname === value && !url.port && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Must be an exact hostname without a scheme or port");

export const managedConfigSchema = z
  .object({
    smtpHost: optionalText,
    smtpPort: z.number().int().min(1).max(65_535),
    smtpSecure: z.boolean(),
    smtpUser: optionalText,
    smtpPassword: z.string(),
    emailFrom: optionalText,
    emailVerificationExpiresSeconds: positiveInteger.min(300),
    githubClientId: optionalText,
    githubClientSecret: z.string(),
    adminSessionIdleSeconds: positiveInteger,
    adminSessionMaxSeconds: positiveInteger,
    adminReauthSeconds: positiveInteger,
    pdfMaxConcurrency: positiveInteger,
    pdfQueueLimit: positiveInteger,
    pdfMaxActivePerUser: positiveInteger,
    pdfMaxAttempts: positiveInteger,
    pdfLeaseMs: positiveInteger,
    pdfResultTtlMs: positiveInteger,
    pdfForceExpiryMs: positiveInteger,
    pdfAllowAnonymous: z.boolean(),
    resumeVersionHistoryLimit: positiveInteger,
    aiEnabled: z.boolean(),
    aiPlatformEnabled: z.boolean(),
    aiByokEnabled: z.boolean(),
    aiTrustedEndpointHostnames: z.array(hostname),
    aiAuditRetentionDays: positiveInteger,
    aiStreamCheckpointMs: positiveInteger,
    aiRunLeaseSeconds: positiveInteger,
    aiRequestsPerMinute: positiveInteger,
    aiMaxConcurrentRuns: positiveInteger,
    aiDefaultMonthlyPoints: nonNegativeInteger,
    aiWorkerBatchSize: positiveInteger,
    aiWorkerPollIntervalMs: positiveInteger,
    aiWorkerRecoveryIntervalMs: positiveInteger,
    aiWorkerRetentionIntervalMs: positiveInteger,
    sourceCodeUrl: optionalText.refine((value) => {
      if (!value) return true;
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "Must be an absolute HTTPS URL"),
  })
  .strict()
  .superRefine((value, context) => {
    const hasSmtp = Boolean(
      value.smtpHost ||
        value.smtpUser ||
        value.smtpPassword ||
        value.emailFrom,
    );
    if (hasSmtp) {
      for (const key of ["smtpHost", "smtpUser", "smtpPassword", "emailFrom"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            message: `${key} is required when SMTP is configured`,
            path: [key],
          });
        }
      }
    }

    const hasGithub = Boolean(value.githubClientId || value.githubClientSecret);
    if (hasGithub) {
      for (const key of ["githubClientId", "githubClientSecret"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: "custom",
            message: `${key} is required when GitHub OAuth is configured`,
            path: [key],
          });
        }
      }
    }

    if (value.pdfMaxConcurrency > value.pdfQueueLimit) {
      context.addIssue({
        code: "custom",
        message: "pdfMaxConcurrency cannot exceed pdfQueueLimit",
        path: ["pdfMaxConcurrency"],
      });
    }
    if (value.pdfMaxActivePerUser > value.pdfQueueLimit) {
      context.addIssue({
        code: "custom",
        message: "pdfMaxActivePerUser cannot exceed pdfQueueLimit",
        path: ["pdfMaxActivePerUser"],
      });
    }
    if (value.pdfForceExpiryMs < value.pdfResultTtlMs) {
      context.addIssue({
        code: "custom",
        message: "pdfForceExpiryMs cannot be shorter than pdfResultTtlMs",
        path: ["pdfForceExpiryMs"],
      });
    }
    if (value.adminSessionIdleSeconds > value.adminSessionMaxSeconds) {
      context.addIssue({
        code: "custom",
        message: "adminSessionIdleSeconds cannot exceed adminSessionMaxSeconds",
        path: ["adminSessionIdleSeconds"],
      });
    }
    if (value.adminReauthSeconds > value.adminSessionMaxSeconds) {
      context.addIssue({
        code: "custom",
        message: "adminReauthSeconds cannot exceed adminSessionMaxSeconds",
        path: ["adminReauthSeconds"],
      });
    }
    if (value.aiWorkerRecoveryIntervalMs < value.aiWorkerPollIntervalMs) {
      context.addIssue({
        code: "custom",
        message: "aiWorkerRecoveryIntervalMs cannot be shorter than aiWorkerPollIntervalMs",
        path: ["aiWorkerRecoveryIntervalMs"],
      });
    }
    if (value.aiWorkerRetentionIntervalMs < value.aiWorkerPollIntervalMs) {
      context.addIssue({
        code: "custom",
        message: "aiWorkerRetentionIntervalMs cannot be shorter than aiWorkerPollIntervalMs",
        path: ["aiWorkerRetentionIntervalMs"],
      });
    }
    if (value.aiStreamCheckpointMs >= value.aiRunLeaseSeconds * 1_000) {
      context.addIssue({
        code: "custom",
        message: "aiStreamCheckpointMs must be shorter than aiRunLeaseSeconds",
        path: ["aiStreamCheckpointMs"],
      });
    }
  });

export type ManagedConfig = z.infer<typeof managedConfigSchema>;
export type ConfigKey = keyof ManagedConfig;

type ConfigRegistry = {
  [Key in ConfigKey]: ConfigDefinition<ManagedConfig[Key]>;
};

export const CONFIG_REGISTRY = {
  smtpHost: definition("email", "restart", ["web"], "", "SMTP_HOST"),
  smtpPort: definition("email", "restart", ["web"], 587, "SMTP_PORT"),
  smtpSecure: definition("email", "restart", ["web"], false, "SMTP_SECURE"),
  smtpUser: definition("email", "restart", ["web"], "", "SMTP_USER"),
  smtpPassword: definition("email", "restart", ["web"], "", "SMTP_PASSWORD", true),
  emailFrom: definition("email", "restart", ["web"], "", "EMAIL_FROM"),
  emailVerificationExpiresSeconds: definition("email", "restart", ["web"], 3_600, "EMAIL_VERIFICATION_EXPIRES_SECONDS"),
  githubClientId: definition("security", "restart", ["web"], "", "GITHUB_CLIENT_ID"),
  githubClientSecret: definition("security", "restart", ["web"], "", "GITHUB_CLIENT_SECRET", true),
  adminSessionIdleSeconds: definition("security", "hot", ["web"], 1_800, "ADMIN_SESSION_IDLE_SECONDS"),
  adminSessionMaxSeconds: definition("security", "hot", ["web"], 28_800, "ADMIN_SESSION_MAX_SECONDS"),
  adminReauthSeconds: definition("security", "hot", ["web"], 300, "ADMIN_REAUTH_SECONDS"),
  pdfMaxConcurrency: definition("pdf", "hot", ["web", "pdf-worker"], 2, "PDF_EXPORT_MAX_CONCURRENCY"),
  pdfQueueLimit: definition("pdf", "hot", ["web", "pdf-worker"], 100, "PDF_EXPORT_QUEUE_LIMIT"),
  pdfMaxActivePerUser: definition("pdf", "hot", ["web", "pdf-worker"], 3, "PDF_EXPORT_MAX_ACTIVE_PER_USER"),
  pdfMaxAttempts: definition("pdf", "hot", ["web", "pdf-worker"], 3, "PDF_EXPORT_MAX_ATTEMPTS"),
  pdfLeaseMs: definition("pdf", "hot", ["web", "pdf-worker"], 60_000, "PDF_EXPORT_LEASE_MS"),
  pdfResultTtlMs: definition("pdf", "hot", ["web", "pdf-worker"], 900_000, "PDF_EXPORT_RESULT_TTL_MS"),
  pdfForceExpiryMs: definition("pdf", "hot", ["web", "pdf-worker"], 86_400_000, "PDF_EXPORT_FORCE_EXPIRY_MS"),
  pdfAllowAnonymous: definition("pdf", "hot", ["web"], false, "PDF_EXPORT_ALLOW_ANONYMOUS"),
  resumeVersionHistoryLimit: definition("resume", "hot", ["web"], 5, "RESUME_VERSION_HISTORY_LIMIT"),
  aiEnabled: definition("ai", "hot", ["web", "ai-worker"], false, "AI_ENABLED"),
  aiPlatformEnabled: definition("ai", "hot", ["web", "ai-worker"], false, "AI_PLATFORM_ENABLED"),
  aiByokEnabled: definition("ai", "hot", ["web", "ai-worker"], false, "AI_BYOK_ENABLED"),
  aiTrustedEndpointHostnames: definition("ai", "hot", ["web", "ai-worker"], [], "AI_TRUSTED_ENDPOINT_HOSTNAMES"),
  aiAuditRetentionDays: definition("ai", "hot", ["web", "ai-worker"], 30, "AI_AUDIT_RETENTION_DAYS"),
  aiStreamCheckpointMs: definition("ai", "hot", ["web", "ai-worker"], 1_000, "AI_STREAM_CHECKPOINT_MS"),
  aiRunLeaseSeconds: definition("ai", "hot", ["web", "ai-worker"], 90, "AI_RUN_LEASE_SECONDS"),
  aiRequestsPerMinute: definition("ai", "hot", ["web", "ai-worker"], 10, "AI_REQUESTS_PER_MINUTE"),
  aiMaxConcurrentRuns: definition("ai", "hot", ["web", "ai-worker"], 1, "AI_MAX_CONCURRENT_RUNS"),
  aiDefaultMonthlyPoints: definition("ai", "hot", ["web"], 100_000, "AI_DEFAULT_MONTHLY_POINTS"),
  aiWorkerBatchSize: definition("ai", "hot", ["ai-worker"], 100, "AI_WORKER_BATCH_SIZE"),
  aiWorkerPollIntervalMs: definition("ai", "hot", ["ai-worker"], 5_000, "AI_WORKER_POLL_INTERVAL_MS"),
  aiWorkerRecoveryIntervalMs: definition("ai", "hot", ["ai-worker"], 15_000, "AI_WORKER_RECOVERY_INTERVAL_MS"),
  aiWorkerRetentionIntervalMs: definition("ai", "hot", ["ai-worker"], 3_600_000, "AI_WORKER_RETENTION_INTERVAL_MS"),
  sourceCodeUrl: {
    ...definition("general", "hot", ["web"], "", "NEXT_PUBLIC_SOURCE_CODE_URL"),
    public: true,
  },
} satisfies ConfigRegistry;

function definition<T>(
  group: ConfigDefinition<T>["group"],
  applyMode: ConfigDefinition<T>["applyMode"],
  consumers: ConfigDefinition<T>["consumers"],
  defaultValue: T,
  environmentKey?: string,
  sensitive = false,
): ConfigDefinition<T> {
  return {
    applyMode,
    consumers,
    defaultValue,
    environmentKey,
    group,
    public: false,
    sensitive,
  };
}

export function getManagedConfigDefaults(): ManagedConfig {
  return managedConfigSchema.parse(
    Object.fromEntries(
      Object.entries(CONFIG_REGISTRY).map(([key, value]) => [
        key,
        Array.isArray(value.defaultValue)
          ? [...value.defaultValue]
          : value.defaultValue,
      ]),
    ),
  );
}

export function parseManagedConfig(input: unknown): ManagedConfig {
  const values = input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
  return managedConfigSchema.parse({
    ...getManagedConfigDefaults(),
    ...values,
  });
}
