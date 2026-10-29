import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  accountLifecycle,
  accountMergeLocks,
  accountMergeOperations,
  jobSearchOperations,
} from "@/db";
import { JobSearchError } from "./errors";
export type JobTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export type JobReader = Pick<JobTransaction, "select">;
export function descriptionHash(text: string) {
  return createHash("sha256")
    .update(text.replace(/\r\n?/g, "\n").trim())
    .digest("hex");
}
export async function mutateJob<T>(
  userId: string,
  work: (tx: JobTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`anonresume:account-merge:${userId}`}))`,
    );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`anonresume:account-deletion:${userId}`}))`,
    );
    const identity = await tx.execute(
      sql`SELECT id FROM "user" WHERE id=${userId} FOR UPDATE`,
    );
    const [life] = await tx
      .select()
      .from(accountLifecycle)
      .where(eq(accountLifecycle.userId, userId));
    const [merge] = await tx
      .select({ id: accountMergeLocks.userId })
      .from(accountMergeLocks)
      .innerJoin(
        accountMergeOperations,
        eq(accountMergeLocks.operationId, accountMergeOperations.id),
      )
      .where(
        and(
          eq(accountMergeLocks.userId, userId),
          sql`${accountMergeLocks.expiresAt}>now()`,
          sql`${accountMergeOperations.state} NOT IN ('completed','cancelled','failed')`,
        ),
      )
      .limit(1);
    if (!identity.rows.length || (life && life.status !== "active") || merge)
      throw new JobSearchError("account_unavailable");
    return work(tx);
  });
}
export async function jobOperation(
  tx: JobTransaction,
  userId: string,
  operationId: string,
  kind: string,
  input: unknown,
  work: () => Promise<{ id: string; applicationId?: string | null }>,
) {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const [previous] = await tx
    .select()
    .from(jobSearchOperations)
    .where(
      and(
        eq(jobSearchOperations.userId, userId),
        eq(jobSearchOperations.operationId, operationId),
      ),
    );
  if (previous) {
    if (previous.kind !== kind || previous.requestHash !== hash)
      throw new JobSearchError("operation_conflict");
    return previous.result;
  }
  const result = await work();
  await tx
    .insert(jobSearchOperations)
    .values({ userId, operationId, kind, requestHash: hash, result });
  return result;
}
