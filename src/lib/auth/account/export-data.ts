import { loadJobSearchExport } from "@/lib/job-search/account";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  aiConversations,
  aiMessages,
  aiResumeReviews,
  aiRuns,
  aiUsageLedger,
  db,
  resumeVersions,
  resumes,
  userInvitations,
  userFontPreferences,
  resumeTemplates,
  resumeAssets,
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
  const exportable = db.select({ id: resumes.id }).from(resumes).where(and(
    eq(resumes.userId, userId), or(isNull(resumes.deletedAt), sql`${resumes.purgeAfter} > now()`),
  ));

  const [
    lifecycle,
    providerResult,
    resumeRows,
    versionRows,
    conversationRows,
    usageRows,
    invitationRows,
    fontPreferenceRows,
    reviewRows,
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
        deletedAt: resumes.deletedAt,
        purgeAfter: resumes.purgeAfter,
      })
      .from(resumes)
      .where(inArray(resumes.id, exportable))
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
      .where(and(eq(resumeVersions.userId, userId), inArray(resumeVersions.resumeId, exportable)))
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
      .where(and(eq(aiConversations.userId, userId), inArray(aiConversations.resumeId, exportable)))
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
    db
      .select({
        fontPresetId: userFontPreferences.fontPresetId,
        favorite: userFontPreferences.isFavorite,
        lastAppliedAt: userFontPreferences.lastAppliedAt,
        createdAt: userFontPreferences.createdAt,
        updatedAt: userFontPreferences.updatedAt,
      })
      .from(userFontPreferences)
      .where(eq(userFontPreferences.userId, userId))
      .orderBy(asc(userFontPreferences.fontPresetId)),
    db.select({ id: aiResumeReviews.id, resumeId: aiRuns.resumeId, modelName: aiResumeReviews.modelName, input: aiResumeReviews.input, report: aiResumeReviews.report, ignoredIssueIds: aiResumeReviews.ignoredIssueIds, createdAt: aiResumeReviews.createdAt })
      .from(aiResumeReviews).innerJoin(aiRuns, eq(aiRuns.id, aiResumeReviews.runId))
      .where(and(eq(aiRuns.userId, userId), inArray(aiRuns.resumeId, exportable))).orderBy(asc(aiResumeReviews.createdAt), asc(aiResumeReviews.id)),
  ]);

  const templates = await db.select({ id: resumeTemplates.id, name: resumeTemplates.name, version: resumeTemplates.version, document: resumeTemplates.document, createdAt: resumeTemplates.createdAt, updatedAt: resumeTemplates.updatedAt }).from(resumeTemplates).where(eq(resumeTemplates.userId, userId)).orderBy(asc(resumeTemplates.createdAt), asc(resumeTemplates.id));
  return {
    identity,
    jobSearch: await loadJobSearchExport(userId),
    lifecycle,
    providers: providerResult.rows.map((row) => row.providerId),
    resumes: resumeRows,
    versions: versionRows,
    conversations: conversationRows,
    usage: usageRows,
    invitations: invitationRows,
    fontPreferences: fontPreferenceRows,
    reviews: reviewRows,
    templates,
    images: await db.select({ id: resumeAssets.id, name: resumeAssets.name, width: resumeAssets.width, height: resumeAssets.height, bytes: resumeAssets.bytes, removedAt: resumeAssets.removedAt, createdAt: resumeAssets.createdAt }).from(resumeAssets).where(and(eq(resumeAssets.userId, userId), eq(resumeAssets.state, "ready"))).orderBy(asc(resumeAssets.createdAt), asc(resumeAssets.id)),
  };
}
