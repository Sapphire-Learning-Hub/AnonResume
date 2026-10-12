import { z } from "zod";

const consumerSchema = z.enum(["web", "pdf-worker", "ai-worker"]);
const supervisorSchema = z.enum([
  "docker-compose",
  "systemd",
  "container",
  "manual",
]);

const restartTargetSchema = z.object({
  completedAt: z.string().nullable(),
  consumer: consumerSchema,
  desiredRestartRevisionId: z.string().uuid(),
  drainStartedAt: z.string().nullable(),
  errorCode: z.string().nullable(),
  exitStartedAt: z.string().nullable(),
  expectedSessionId: z.string(),
  instanceId: z.string(),
  sequence: z.number().int().nonnegative(),
  status: z.enum([
    "queued",
    "draining",
    "exiting",
    "awaiting_startup",
    "healthy",
    "failed",
    "timed_out",
  ]),
  supervisorKind: supervisorSchema,
});

export const systemRestartOperationSchema = z.object({
  actorUserId: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  deploymentId: z.string(),
  desiredRevisionId: z.string().uuid(),
  errorCode: z.string().nullable(),
  id: z.string().uuid(),
  startedAt: z.string().nullable(),
  status: z.enum(["queued", "running", "succeeded", "failed", "timed_out"]),
  targets: z.array(restartTargetSchema),
  updatedAt: z.string(),
});

export type SystemRestartOperation = z.infer<typeof systemRestartOperationSchema>;
export type SystemRestartTarget = z.infer<typeof restartTargetSchema>;

export function parseSystemRestartOperation(value: unknown) {
  return systemRestartOperationSchema.parse(value);
}

export function parseOptionalSystemRestartOperation(value: unknown) {
  return systemRestartOperationSchema.nullable().parse(value);
}
