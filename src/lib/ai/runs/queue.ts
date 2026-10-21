import { and, asc, count, eq, inArray, isNotNull, isNull, min, sql } from "drizzle-orm";

import { aiRuns, db, resumes } from "@/db";
import { decryptPreparedAiRunPayload } from "@/lib/ai/runs/run-payload";
import type { ClaimedAiRun } from "@/lib/ai/runs/service";
import type { VersionedSecretKeys } from "@/lib/config/secret-keyring";
import { taskDiagnosticContext } from "@/lib/observability/diagnostics/context";

const AI_QUEUE_STATES = [
  "queued",
  "preparing",
  "streaming",
  "complete",
  "stopped",
  "failed",
  "interrupted",
  "settlement_pending",
] as const;

export async function readAiQueueMetricsSnapshot() {
  const rows = await db
    .select({
      count: count(),
      oldestCreatedAt: min(aiRuns.createdAt),
      status: aiRuns.status,
    })
    .from(aiRuns)
    .groupBy(aiRuns.status);
  const counts: Record<string, number> = Object.fromEntries(
    AI_QUEUE_STATES.map((status) => [status, 0]),
  );
  let oldestQueuedAt: Date | null = null;
  for (const row of rows) {
    counts[row.status] = row.count;
    if (row.status === "queued") oldestQueuedAt = row.oldestCreatedAt;
  }
  return { counts, oldestQueuedAt };
}

export async function claimQueuedAiRuns(input: {
  workerId: string;
  limit: number;
  leaseSeconds: number;
  credentialKeys?: VersionedSecretKeys;
  encryptionKey: Buffer;
}): Promise<ClaimedAiRun[]> {
  return db.transaction(async (transaction) => {
    const candidates = await transaction
      .select({ id: aiRuns.id })
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.status, "queued"),
          isNull(aiRuns.stopRequestedAt),
          sql`EXISTS (SELECT 1 FROM ${resumes} WHERE ${resumes.userId} = ${aiRuns.userId} AND ${resumes.id} = ${aiRuns.resumeId} AND ${resumes.deletedAt} IS NULL)`,
          isNotNull(aiRuns.encryptedExecutionPayload),
        ),
      )
      .orderBy(asc(aiRuns.createdAt), asc(aiRuns.id))
      .limit(input.limit)
      .for("update", { skipLocked: true });
    if (candidates.length === 0) return [];

    const ids = candidates.map((candidate) => candidate.id);
    const now = new Date();
    const rows = await transaction
      .update(aiRuns)
      .set({
        status: "preparing",
        leaseOwner: input.workerId,
        leaseExpiresAt: new Date(
          now.getTime() + input.leaseSeconds * 1_000,
        ),
        updatedAt: now,
      })
      .where(and(inArray(aiRuns.id, ids), eq(aiRuns.status, "queued"), isNull(aiRuns.stopRequestedAt)))
      .returning({
        createdAt: aiRuns.createdAt,
        diagnosticContext: aiRuns.diagnosticContext,
        id: aiRuns.id,
        kind: aiRuns.kind,
        encryptedExecutionPayload: aiRuns.encryptedExecutionPayload,
        executionPayloadKeyVersion: aiRuns.executionPayloadKeyVersion,
      });
    const order = new Map(ids.map((id, index) => [id, index]));
    const orderedRows = rows.sort(
      (left, right) => order.get(left.id)! - order.get(right.id)!,
    );
    return orderedRows.map((run) => {
      if (!run.encryptedExecutionPayload || !run.executionPayloadKeyVersion) {
        throw new Error("ai_run_payload_unavailable");
      }
      return {
        ...decryptPreparedAiRunPayload({
          credentialKeys: input.credentialKeys,
          encryptedPayload: run.encryptedExecutionPayload,
          encryptionKey: input.encryptionKey,
          expectedRunId: run.id,
          expectedKind: run.kind,
          keyVersion: run.executionPayloadKeyVersion,
        }),
        leaseOwner: input.workerId,
        diagnosticContext: taskDiagnosticContext(run.id, run.diagnosticContext),
        queuedAt: run.createdAt,
      };
    });
  });
}
