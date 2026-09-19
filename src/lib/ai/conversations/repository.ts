import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
} from "drizzle-orm";

import {
  aiConversations,
  aiMessages,
  aiModels,
  aiProposals,
  aiProviderCredentials,
  aiRuns,
  db,
  resumes,
} from "@/db";
import type {
  AiConversationScope,
  AiProviderKind,
} from "@/db/ai-schema";

export class AiConversationNotFoundError extends Error {
  constructor() {
    super("ai_conversation_not_found");
    this.name = "AiConversationNotFoundError";
  }
}

export class AiModelUnavailableError extends Error {
  constructor() {
    super("ai_model_unavailable");
    this.name = "AiModelUnavailableError";
  }
}

async function assertOwnedResume(userId: string, resumeId: string) {
  const [resume] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.id, resumeId)))
    .limit(1);
  if (!resume) throw new AiConversationNotFoundError();
}

async function assertAvailableModel(
  userId: string,
  modelId: string,
  allowedKeySources: AiProviderKind[],
) {
  const [model] = await db
    .select({ id: aiModels.id })
    .from(aiModels)
    .innerJoin(
      aiProviderCredentials,
      eq(aiProviderCredentials.id, aiModels.providerId),
    )
    .where(
      and(
        eq(aiModels.id, modelId),
        eq(aiModels.enabled, true),
        isNull(aiModels.deletedAt),
        eq(aiProviderCredentials.enabled, true),
        isNull(aiProviderCredentials.deletedAt),
        or(
          ...allowedKeySources.map((kind) =>
            eq(aiProviderCredentials.kind, kind),
          ),
        ),
        or(
          isNull(aiProviderCredentials.ownerUserId),
          eq(aiProviderCredentials.ownerUserId, userId),
        ),
      ),
    )
    .limit(1);
  if (!model) throw new AiModelUnavailableError();
}

export async function listAvailableAiModels(
  userId: string,
  allowedKeySources: AiProviderKind[] = ["platform", "user"],
) {
  if (allowedKeySources.length === 0) return [];

  return db
    .select({
      id: aiModels.id,
      displayName: aiModels.displayName,
      providerModelKey: aiModels.providerModelKey,
      supportsStreaming: aiModels.supportsStreaming,
      supportsToolCalls: aiModels.supportsToolCalls,
      maxOutputTokens: aiModels.maxOutputTokens,
      keySource: aiProviderCredentials.kind,
      providerName: aiProviderCredentials.displayName,
    })
    .from(aiModels)
    .innerJoin(
      aiProviderCredentials,
      eq(aiProviderCredentials.id, aiModels.providerId),
    )
    .where(
      and(
        eq(aiModels.enabled, true),
        isNull(aiModels.deletedAt),
        eq(aiProviderCredentials.enabled, true),
        isNull(aiProviderCredentials.deletedAt),
        or(
          ...allowedKeySources.map((kind) =>
            eq(aiProviderCredentials.kind, kind),
          ),
        ),
        or(
          isNull(aiProviderCredentials.ownerUserId),
          eq(aiProviderCredentials.ownerUserId, userId),
        ),
      ),
    )
    .orderBy(aiModels.displayName);
}

export async function createAiConversation(input: {
  userId: string;
  resumeId: string;
  modelId: string;
  title: string;
  contextScope: AiConversationScope;
  sectionId?: string;
  allowedKeySources?: AiProviderKind[];
}) {
  await Promise.all([
    assertOwnedResume(input.userId, input.resumeId),
    assertAvailableModel(
      input.userId,
      input.modelId,
      input.allowedKeySources ?? ["platform", "user"],
    ),
  ]);

  const [conversation] = await db
    .insert(aiConversations)
    .values({
      userId: input.userId,
      resumeId: input.resumeId,
      modelId: input.modelId,
      title: input.title,
      contextScope: input.contextScope,
      sectionId: input.contextScope === "section" ? input.sectionId : null,
    })
    .returning();
  return conversation!;
}

export async function listAiConversations(input: {
  userId: string;
  resumeId: string;
  includeArchived?: boolean;
}) {
  return db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.userId, input.userId),
        eq(aiConversations.resumeId, input.resumeId),
        isNull(aiConversations.deletedAt),
        input.includeArchived ? undefined : isNull(aiConversations.archivedAt),
      ),
    )
    .orderBy(desc(aiConversations.updatedAt), desc(aiConversations.createdAt))
    .limit(100);
}

export async function getAiConversation(input: {
  userId: string;
  conversationId: string;
}) {
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, input.conversationId),
        eq(aiConversations.userId, input.userId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!conversation) throw new AiConversationNotFoundError();
  return conversation;
}

export async function getAiConversationDetails(input: {
  userId: string;
  conversationId: string;
}) {
  const conversation = await getAiConversation(input);
  const [messages, proposals, activeRun] = await Promise.all([
    db
      .select({
        id: aiMessages.id,
        role: aiMessages.role,
        text: aiMessages.text,
        sequence: aiMessages.sequence,
        completionState: aiMessages.completionState,
        runId: aiRuns.id,
        createdAt: aiMessages.createdAt,
        updatedAt: aiMessages.updatedAt,
      })
      .from(aiMessages)
      .leftJoin(aiRuns, eq(aiRuns.assistantMessageId, aiMessages.id))
      .where(
        and(
          eq(aiMessages.conversationId, conversation.id),
          isNull(aiMessages.retractedAt),
        ),
      )
      .orderBy(aiMessages.sequence),
    db
      .select({
        id: aiProposals.id,
        runId: aiProposals.runId,
        baseResumeVersion: aiProposals.baseResumeVersion,
        proposal: aiProposals.proposal,
        completionState: aiProposals.completionState,
        appliedChangeIds: aiProposals.appliedChangeIds,
        appliedAt: aiProposals.appliedAt,
        createdAt: aiProposals.createdAt,
      })
      .from(aiProposals)
      .innerJoin(aiRuns, eq(aiRuns.id, aiProposals.runId))
      .innerJoin(aiMessages, eq(aiMessages.id, aiRuns.assistantMessageId))
      .where(
        and(
          eq(aiRuns.userId, input.userId),
          eq(aiRuns.conversationId, conversation.id),
          isNull(aiMessages.retractedAt),
        ),
      )
      .orderBy(aiProposals.createdAt),
    db
      .select({
        id: aiRuns.id,
        status: aiRuns.status,
        sequence: aiRuns.checkpointSequence,
        text: aiRuns.checkpointText,
        proposal: aiRuns.checkpointProposal,
        progress: aiRuns.checkpointProgress,
      })
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.userId, input.userId),
          eq(aiRuns.conversationId, conversation.id),
          inArray(aiRuns.status, ["queued", "preparing", "streaming"]),
        ),
      )
      .limit(1),
  ]);

  return {
    conversation,
    messages,
    proposals,
    activeRun: activeRun[0] ?? null,
  };
}

export async function renameAiConversation(input: {
  userId: string;
  conversationId: string;
  title: string;
}) {
  const [conversation] = await db
    .update(aiConversations)
    .set({ title: input.title, updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.id, input.conversationId),
        eq(aiConversations.userId, input.userId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .returning();
  if (!conversation) throw new AiConversationNotFoundError();
  return conversation;
}

export async function setAiConversationArchived(input: {
  userId: string;
  conversationId: string;
  archived: boolean;
}) {
  const [conversation] = await db
    .update(aiConversations)
    .set({
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiConversations.id, input.conversationId),
        eq(aiConversations.userId, input.userId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .returning();
  if (!conversation) throw new AiConversationNotFoundError();
  return conversation;
}

export async function deleteAiConversation(input: {
  userId: string;
  conversationId: string;
}) {
  const [conversation] = await db
    .update(aiConversations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.id, input.conversationId),
        eq(aiConversations.userId, input.userId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .returning({ id: aiConversations.id });
  if (!conversation) throw new AiConversationNotFoundError();
}
