import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { aiRuns, db } from "@/db";
import { decryptPreparedAiRunPayload } from "@/lib/ai/runs/run-payload";
import type { ClaimedAiRun } from "@/lib/ai/runs/service";

export async function claimQueuedAiRuns(input: {
  workerId: string;
  limit: number;
  leaseSeconds: number;
  encryptionKey: Buffer;
}): Promise<ClaimedAiRun[]> {
  const claimed = await db.transaction(async (transaction) => {
    const candidates = await transaction
      .select({ id: aiRuns.id })
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.status, "queued"),
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
      .where(and(inArray(aiRuns.id, ids), eq(aiRuns.status, "queued")))
      .returning({
        id: aiRuns.id,
        encryptedExecutionPayload: aiRuns.encryptedExecutionPayload,
        executionPayloadKeyVersion: aiRuns.executionPayloadKeyVersion,
      });
    const order = new Map(ids.map((id, index) => [id, index]));
    return rows.sort(
      (left, right) => order.get(left.id)! - order.get(right.id)!,
    );
  });

  return claimed.map((run) => {
    if (
      run.executionPayloadKeyVersion !== 1 ||
      !run.encryptedExecutionPayload
    ) {
      throw new Error("ai_run_payload_unavailable");
    }
    return {
      ...decryptPreparedAiRunPayload({
        encryptedPayload: run.encryptedExecutionPayload,
        encryptionKey: input.encryptionKey,
        expectedRunId: run.id,
      }),
      leaseOwner: input.workerId,
    };
  });
}
