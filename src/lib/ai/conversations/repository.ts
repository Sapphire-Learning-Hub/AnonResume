import {
  and,
  desc,
  eq,
  isNull,
  or,
} from "drizzle-orm";

import {
  aiConversations,
  aiModels,
  aiProviderCredentials,
  db,
  resumes,
} from "@/db";
import type { AiConversationScope } from "@/db/ai-schema";

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

async function assertAvailableModel(userId: string, modelId: string) {
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
        eq(aiProviderCredentials.enabled, true),
        or(
          isNull(aiProviderCredentials.ownerUserId),
          eq(aiProviderCredentials.ownerUserId, userId),
        ),
      ),
    )
    .limit(1);
  if (!model) throw new AiModelUnavailableError();
}

export async function listAvailableAiModels(userId: string) {
  return db
    .select({
      id: aiModels.id,
      displayName: aiModels.displayName,
      providerModelKey: aiModels.providerModelKey,
      supportsStreaming: aiModels.supportsStreaming,
      supportsToolCalls: aiModels.supportsToolCalls,
      maxOutputTokens: aiModels.maxOutputTokens,
      keySource: aiProviderCredentials.kind,
    })
    .from(aiModels)
    .innerJoin(
      aiProviderCredentials,
      eq(aiProviderCredentials.id, aiModels.providerId),
    )
    .where(
      and(
        eq(aiModels.enabled, true),
        eq(aiProviderCredentials.enabled, true),
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
}) {
  await Promise.all([
    assertOwnedResume(input.userId, input.resumeId),
    assertAvailableModel(input.userId, input.modelId),
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
