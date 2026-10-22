import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  accountLifecycle,
  accountMergeLocks,
  accountMergeOperations,
  resumeTemplateOperations,
} from "@/db";
import type { ResumeTransaction } from "@/lib/resume/transaction";
import { TemplateError } from "./errors";

export async function lockTemplateAccount(
  tx: ResumeTransaction,
  userId: string,
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`anonresume:account-merge:${userId}`}))`,
  );
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`anonresume:account-deletion:${userId}`}))`,
  );
  const identity = await tx.execute(
    sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`,
  );
  const [lifecycle] = await tx
    .select()
    .from(accountLifecycle)
    .where(eq(accountLifecycle.userId, userId));
  const merge = await tx
    .select({ userId: accountMergeLocks.userId })
    .from(accountMergeLocks)
    .innerJoin(
      accountMergeOperations,
      eq(accountMergeOperations.id, accountMergeLocks.operationId),
    )
    .where(
      and(
        eq(accountMergeLocks.userId, userId),
        sql`${accountMergeLocks.expiresAt} > now()`,
        sql`${accountMergeOperations.state} NOT IN ('completed', 'failed', 'cancelled')`,
      ),
    )
    .limit(1);
  if (
    !identity.rows.length ||
    (lifecycle && lifecycle.status !== "active") ||
    merge.length
  )
    throw new TemplateError("template_account_unavailable");
}

export async function templateOperation(
  tx: ResumeTransaction,
  userId: string,
  operationId: string,
  kind: "save" | "replace" | "instantiate",
  input: unknown,
  execute: () => Promise<{ id: string; version: number }>,
  exists: (id: string) => Promise<void>,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const [previous] = await tx
    .select()
    .from(resumeTemplateOperations)
    .where(
      and(
        eq(resumeTemplateOperations.userId, userId),
        eq(resumeTemplateOperations.operationId, operationId),
      ),
    );
  if (previous) {
    if (previous.kind !== kind || previous.requestHash !== requestHash)
      throw new TemplateError("template_operation_conflict");
    await exists(previous.resultId);
    return { id: previous.resultId, version: previous.resultVersion };
  }
  const result = await execute();
  await tx
    .insert(resumeTemplateOperations)
    .values({
      userId,
      operationId,
      kind,
      requestHash,
      resultId: result.id,
      resultVersion: result.version,
    });
  return result;
}
