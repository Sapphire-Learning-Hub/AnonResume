import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { resumeVersions } from "@/db";
import type { ResumeRecord } from "@/lib/resume/catalog";
import type { ResumeTransaction } from "@/lib/resume/transaction";
import type { ResumeSnapshotKind } from "./types";

export async function createHistorySnapshot(
  transaction: ResumeTransaction,
  record: Pick<ResumeRecord, "id" | "userId" | "version" | "document">,
  kind: ResumeSnapshotKind,
  retainedLimit: number,
) {
  const filter = and(
    eq(resumeVersions.userId, record.userId),
    eq(resumeVersions.resumeId, record.id),
    eq(resumeVersions.kind, kind),
  );
  // The caller holds the resume row lock for both history and document writes.
  if (kind === "autosave")
    await transaction.delete(resumeVersions).where(filter);
  const [created] = await transaction
    .insert(resumeVersions)
    .values({
      id: randomUUID(),
      userId: record.userId,
      resumeId: record.id,
      version: record.version,
      document: record.document,
      kind,
      createdAt: sql`clock_timestamp()`,
    })
    .returning();
  if (kind === "retained") {
    const stale = await transaction
      .select({ id: resumeVersions.id })
      .from(resumeVersions)
      .where(filter)
      .orderBy(desc(resumeVersions.createdAt), desc(resumeVersions.id))
      .offset(retainedLimit);
    if (stale.length)
      await transaction.delete(resumeVersions).where(
        inArray(
          resumeVersions.id,
          stale.map((row) => row.id),
        ),
      );
  }
  return created!;
}
