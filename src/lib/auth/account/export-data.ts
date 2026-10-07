import { asc, eq, or, sql } from "drizzle-orm";

import {
  aiConversations,
  aiMessages,
  aiUsageLedger,
  db,
  resumeVersions,
  resumes,
  userInvitations,
} from "@/db";
import { getDatabasePool } from "@/lib/runtime/database";

import { getAccountLifecycle } from "./repository";

export type AccountExportData = Awaited<ReturnType<typeof loadAccountExportData>>;

export async function loadAccountExportData(userId: string) {
  const identityResult = await getDatabasePool().query<{
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>(
    `SELECT id, name, email, "emailVerified" AS "emailVerified",
            "createdAt" AS "createdAt", "updatedAt" AS "updatedAt"
       FROM "user" WHERE id = $1`,
    [userId],
  );
  const identity = identityResult.rows[0];
  if (!identity) throw new Error("account_not_found");

  const [
    lifecycle,
    providerResult,
    resumeRows,
    versionRows,
    conversationRows,
    usageRows,
    invitationRows,
  ] = await Promise.all([
    getAccountLifecycle(userId),
    getDatabasePool().query<{ providerId: string }>(
      `SELECT DISTINCT "providerId" AS "providerId"
         FROM "account" WHERE "userId" = $1
         ORDER BY "providerId" ASC`,
      [userId],
    ),
    db
      .select({
        id: resumes.id,
        kind: resumes.kind,
        name: resumes.name,
        summary: resumes.summary,
        slug: resumes.slug,
        published: resumes.published,
        schemaVersion: resumes.schemaVersion,
        version: resumes.version,
        document: resumes.document,
        createdAt: resumes.createdAt,
        updatedAt: resumes.updatedAt,
      })
      .from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(asc(resumes.createdAt), asc(resumes.id)),
    db
      .select({
        id: resumeVersions.id,
        resumeId: resumeVersions.resumeId,
        version: resumeVersions.version,
        document: resumeVersions.document,
        createdAt: resumeVersions.createdAt,
      })
      .from(resumeVersions)
      .where(eq(resumeVersions.userId, userId))
      .orderBy(
        asc(resumeVersions.resumeId),
        asc(resumeVersions.version),
      ),
    db
      .select({
        conversationId: aiConversations.id,
        resumeId: aiConversations.resumeId,
        title: aiConversations.title,
        contextScope: aiConversations.contextScope,
        sectionId: aiConversations.sectionId,
        archivedAt: aiConversations.archivedAt,
        deletedAt: aiConversations.deletedAt,
        conversationCreatedAt: aiConversations.createdAt,
        messageId: aiMessages.id,
        role: aiMessages.role,
        text: aiMessages.text,
        sequence: aiMessages.sequence,
        completionState: aiMessages.completionState,
        messageCreatedAt: aiMessages.createdAt,
      })
      .from(aiConversations)
      .leftJoin(
        aiMessages,
        eq(aiMessages.conversationId, aiConversations.id),
      )
      .where(eq(aiConversations.userId, userId))
      .orderBy(asc(aiConversations.createdAt), asc(aiMessages.sequence)),
    db
      .select({
        id: aiUsageLedger.id,
        runId: aiUsageLedger.runId,
        entryType: aiUsageLedger.entryType,
        pointsDelta: aiUsageLedger.pointsDelta,
        inputTokens: aiUsageLedger.inputTokens,
        cachedInputTokens: aiUsageLedger.cachedInputTokens,
        outputTokens: aiUsageLedger.outputTokens,
        modelId: aiUsageLedger.modelId,
        rateCardVersion: aiUsageLedger.rateCardVersion,
        createdAt: aiUsageLedger.createdAt,
      })
      .from(aiUsageLedger)
      .where(eq(aiUsageLedger.userId, userId))
      .orderBy(asc(aiUsageLedger.createdAt), asc(aiUsageLedger.id)),
    db
      .select({
        id: userInvitations.id,
        inviterUserId: userInvitations.inviterUserId,
        invitedEmail: userInvitations.invitedEmail,
        lastSentAt: userInvitations.lastSentAt,
        expiresAt: userInvitations.expiresAt,
        acceptedByUserId: userInvitations.acceptedByUserId,
        acceptedAt: userInvitations.acceptedAt,
        revokedAt: userInvitations.revokedAt,
        invalidatedAt: userInvitations.invalidatedAt,
        invalidationReason: userInvitations.invalidationReason,
        createdAt: userInvitations.createdAt,
      })
      .from(userInvitations)
      .where(
        or(
          eq(userInvitations.inviterUserId, userId),
          eq(userInvitations.acceptedByUserId, userId),
          sql`lower(${userInvitations.invitedEmail}) = lower(${identity.email})`,
        ),
      )
      .orderBy(asc(userInvitations.createdAt), asc(userInvitations.id)),
  ]);

  return {
    identity,
    lifecycle,
    providers: providerResult.rows.map((row) => row.providerId),
    resumes: resumeRows,
    versions: versionRows,
    conversations: conversationRows,
    usage: usageRows,
    invitations: invitationRows,
  };
}
