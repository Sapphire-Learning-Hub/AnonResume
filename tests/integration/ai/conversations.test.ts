import { randomUUID } from "node:crypto";

import { eq, isNull } from "drizzle-orm";

import {
  aiConversations,
  aiModels,
  aiProviderCredentials,
  db,
  resumes,
} from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  AiConversationNotFoundError,
  createAiConversation,
  deleteAiConversation,
  getAiConversation,
  listAiConversations,
  renameAiConversation,
} from "@/lib/ai/conversations/repository";

describe("AI conversation ownership", () => {
  const userId = `ai-owner-${randomUUID()}`;
  const otherUserId = `ai-other-${randomUUID()}`;
  const resumeId = `resume-${randomUUID()}`;
  let providerId = "";
  let modelId = "";

  beforeAll(async () => {
    const [provider] = await db
      .insert(aiProviderCredentials)
      .values({
        kind: "platform",
        displayName: "Test provider",
        baseUrl: "https://models.example.com/v1",
        encryptedApiKey: Buffer.from("encrypted"),
      })
      .returning({ id: aiProviderCredentials.id });
    providerId = provider!.id;
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId,
        providerModelKey: "test-model",
        displayName: "Test model",
        contextWindow: 8_192,
        maxOutputTokens: 1_024,
        inputPointRate: 100,
        cachedInputPointRate: 10,
        outputPointRate: 500,
      })
      .returning({ id: aiModels.id });
    modelId = model!.id;
    await db.insert(resumes).values({
      id: resumeId,
      userId,
      name: "AI test resume",
      summary: "",
      document: createDefaultResumeDocument("zh-CN"),
    });
  });

  afterAll(async () => {
    await db.delete(resumes).where(eq(resumes.id, resumeId));
    await db.delete(aiProviderCredentials).where(eq(aiProviderCredentials.id, providerId));
  });

  it("creates, lists, and renames only owned resume conversations", async () => {
    const conversation = await createAiConversation({
      userId,
      resumeId,
      modelId,
      title: "优化项目经历",
      contextScope: "resume",
    });
    expect(conversation.title).toBe("优化项目经历");
    expect(await listAiConversations({ userId, resumeId })).toHaveLength(1);

    const renamed = await renameAiConversation({
      userId,
      conversationId: conversation.id,
      title: "项目经历",
    });
    expect(renamed.title).toBe("项目经历");
    await expect(
      getAiConversation({ userId: otherUserId, conversationId: conversation.id }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);

    await deleteAiConversation({ userId, conversationId: conversation.id });
    expect(await listAiConversations({ userId, resumeId })).toEqual([]);
  });

  it("rejects a conversation for a resume the user does not own", async () => {
    await expect(
      createAiConversation({
        userId: otherUserId,
        resumeId,
        modelId,
        title: "Unauthorized",
        contextScope: "resume",
      }),
    ).rejects.toBeInstanceOf(AiConversationNotFoundError);
    expect(
      await db
        .select()
        .from(aiConversations)
        .where(isNull(aiConversations.deletedAt)),
    ).toHaveLength(0);
  });
});
