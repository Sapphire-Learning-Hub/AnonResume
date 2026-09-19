import { z } from "zod";

import { resumeDocumentSchema } from "@/domain/resume/schema";
import {
  decryptAiCredential,
  encryptAiCredential,
} from "@/lib/ai/security/credentials";
import type { PreparedAiRun } from "@/lib/ai/runs/service";

const providerMessageSchema = z.union([
  z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  }).strict(),
  z.object({
    role: z.literal("assistant"),
    content: z.string(),
    toolCalls: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.string(),
      }).strict(),
    ),
  }).strict(),
  z.object({
    role: z.literal("tool"),
    content: z.string(),
    toolCallId: z.string(),
  }).strict(),
]);

const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
}).strict();

const editableTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("replace_section_title"),
    sectionId: z.string(),
    beforeHash: z.string(),
  }).strict(),
  z.object({
    type: z.literal("replace_text"),
    sectionId: z.string(),
    blockPath: z.array(z.string()),
    beforeHash: z.string(),
  }).strict(),
  z.object({
    type: z.enum(["replace_list_item", "delete_list_item"]),
    sectionId: z.string(),
    listPath: z.array(z.string()),
    itemId: z.string(),
    beforeHash: z.string(),
  }).strict(),
  z.object({
    type: z.literal("insert_list_item"),
    sectionId: z.string(),
    listPath: z.array(z.string()),
    afterItemId: z.string(),
    beforeHash: z.string(),
  }).strict(),
]);

const payloadSchema = z.object({
  version: z.literal(1),
  runId: z.string().uuid(),
  userId: z.string(),
  resumeId: z.string(),
  conversationId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
  resumeVersion: z.number().int().positive(),
  request: z.object({
    diagnosticRunId: z.string().optional(),
    endpoint: z.string().url(),
    apiKey: z.string(),
    model: z.string(),
    messages: z.array(providerMessageSchema),
    maxOutputTokens: z.number().int().positive(),
    latencyPreference: z.enum(["fast", "provider_default"]).optional(),
    allowCrossOriginRedirects: z.boolean().optional(),
    trustedEndpointHostnames: z.array(z.string()).optional(),
    proposalTool: toolDefinitionSchema.extend({
      name: z.literal("propose_resume_changes"),
    }).optional(),
    tools: z.array(toolDefinitionSchema).optional(),
    toolChoice: z.enum(["auto", "required"]).optional(),
  }).strict(),
  auditRequest: z.record(z.string(), z.unknown()),
  configuration: z.object({
    auditRetentionDays: z.number().int().positive(),
    defaultMonthlyPoints: z.number().int().nonnegative(),
    requestsPerMinute: z.number().int().positive(),
    streamCheckpointMs: z.number().int().positive(),
    runLeaseSeconds: z.number().int().positive(),
    trustedEndpointHostnames: z.array(z.string()).optional(),
    maxConcurrentRuns: z.number().int().positive().optional(),
    platformEnabled: z.boolean().optional(),
    byokEnabled: z.boolean().optional(),
  }).strict(),
  keySource: z.enum(["platform", "user"]),
  rates: z.object({
    inputPointsPerMillion: z.number().int().nonnegative(),
    cachedInputPointsPerMillion: z.number().int().nonnegative(),
    outputPointsPerMillion: z.number().int().nonnegative(),
  }).strict(),
  rateCardVersion: z.number().int().positive(),
  reservationOperationId: z.string(),
  reservedPoints: z.number().int().nonnegative(),
  proposalTargets: z.array(editableTargetSchema),
  resumeDocument: resumeDocumentSchema,
  providerContext: z.unknown(),
}).strict();

export function encryptPreparedAiRunPayload(
  prepared: PreparedAiRun,
  encryptionKey: Buffer,
) {
  return encryptAiCredential(
    JSON.stringify({
      version: 1,
      ...prepared,
      request: {
        ...prepared.request,
        endpoint: prepared.request.endpoint.toString(),
      },
      configuration: {
        ...prepared.configuration,
        credentialsEncryptionKey: undefined,
      },
    }),
    encryptionKey,
  );
}

export function decryptPreparedAiRunPayload(input: {
  encryptedPayload: Buffer;
  encryptionKey: Buffer;
  expectedRunId: string;
}): PreparedAiRun {
  const parsed = payloadSchema.parse(
    JSON.parse(
      decryptAiCredential(input.encryptedPayload, input.encryptionKey),
    ) as unknown,
  );
  if (parsed.runId !== input.expectedRunId) {
    throw new Error("ai_run_payload_mismatch");
  }

  return {
    ...parsed,
    request: {
      ...parsed.request,
      endpoint: new URL(parsed.request.endpoint),
    },
    configuration: {
      ...parsed.configuration,
      credentialsEncryptionKey: input.encryptionKey,
    },
  };
}
