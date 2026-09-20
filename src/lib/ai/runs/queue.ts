import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import { aiRuns, db } from "@/db";
import { decryptPreparedAiRunPayload } from "@/lib/ai/runs/run-payload";
import type { ClaimedAiRun } from "@/lib/ai/runs/service";
import type { VersionedSecretKeys } from "@/lib/config/secret-keyring";

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
          keyVersion: run.executionPayloadKeyVersion,
        }),
        leaseOwner: input.workerId,
      };
    });
  });
}
