import { z } from "zod";
import { locationSchema } from "@/lib/observability/diagnostics/sourcemaps/schema";

export const diagnosticSourceSchema = z.enum(["http", "framework", "browser", "ai", "pdf", "runtime"]);
export const diagnosticCategorySchema = z.enum(["timeout", "network", "database", "authentication", "protocol", "application"]);
export const identitySchema = z.object({
  role: z.enum(["web", "ai-worker", "pdf-worker", "maintenance", "cli", "migrate"]),
  instance: z.string().max(256),
  build: z.string().max(128),
  release: z.string().max(128),
  environment: z.string().max(64),
});
export type DiagnosticIdentity = z.infer<typeof identitySchema>;

export const storedErrorSchema = z.object({
  type: z.string().max(48),
  code: z.string().max(48).nullable(),
  fingerprint: z.string().regex(/^[a-f0-9]{16,64}$/),
  category: diagnosticCategorySchema,
  frames: z.array(z.string().max(300)).max(16),
  causes: z.array(z.object({ type: z.string().max(48), code: z.string().max(48).nullable() })).max(4),
});
export const diagnosticEventSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  requestId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  kind: z.enum(["stage", "fault", "task"]),
  name: z.string().max(64),
  source: diagnosticSourceSchema,
  outcome: z.enum(["running", "success", "failure", "cancelled"]),
  at: z.string().datetime(),
  durationMs: z.number().finite().nonnegative().nullable(),
  attempt: z.number().int().min(0).max(10_000).nullable().default(null),
  timeoutPhase: z.enum(["connection", "first_chunk", "stream_idle", "total"]).nullable().default(null),
  identity: identitySchema,
  error: storedErrorSchema.nullable(),
  locations: z.array(locationSchema).max(16).optional(),
  reference: z.object({
    clientBuild: z.string().max(128).nullable(),
    digest: z.string().max(128).nullable(),
    clientFrames: z.array(z.object({ asset: z.string().max(256), line: z.number().int(), column: z.number().int() })).max(8),
  }).nullable(),
});
export type DiagnosticEvent = z.infer<typeof diagnosticEventSchema>;
export interface DiagnosticBatch {
  diagnosticId: string;
  events: DiagnosticEvent[];
  truncated: boolean;
  task?: { id: string; kind: "ai" | "pdf"; state: "active" | "success" | "failure" | "cancelled" };
}
export interface DiagnosticPolicy {
  enabled: boolean;
  retentionDays: number;
  maxRecords: number;
  pendingTtlMs: number;
}

export const diagnosticFilterSchema = z.object({
  q: z.union([z.string().uuid(), z.literal("")]).default(""),
  source: diagnosticSourceSchema.optional(),
  category: diagnosticCategorySchema.optional(),
  role: identitySchema.shape.role.optional(),
  instance: z.string().max(256).optional(),
  build: z.string().max(128).optional(),
  days: z.coerce.number().int().min(1).max(30).default(7),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().uuid().optional(),
});
export type DiagnosticFilter = z.infer<typeof diagnosticFilterSchema>;
export interface DiagnosticListItem extends DiagnosticEvent {
  diagnosticId: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}
export interface DiagnosticList {
  items: DiagnosticListItem[];
  nextCursor: string | null;
  enabled: boolean;
  retentionDays: number;
  localHealth: { degraded: boolean; dropped: number; pending: number };
}
export interface DiagnosticDetails {
  diagnosticId: string;
  fault: DiagnosticEvent;
  events: DiagnosticEvent[];
  truncated: boolean;
  completeness: "partial" | "unknown";
}

export const diagnosticListSchema = z.object({
  items: z.array(diagnosticEventSchema.extend({ diagnosticId: z.string().uuid(), occurrences: z.number(), firstSeen: z.string().datetime(), lastSeen: z.string().datetime() })),
  nextCursor: z.string().uuid().nullable(), enabled: z.boolean(), retentionDays: z.number(),
  localHealth: z.object({ degraded: z.boolean(), dropped: z.number(), pending: z.number() }),
});
export const diagnosticDetailsSchema = z.object({
  diagnosticId: z.string().uuid(), fault: diagnosticEventSchema, events: z.array(diagnosticEventSchema).max(256),
  truncated: z.boolean(), completeness: z.enum(["partial", "unknown"]),
});
