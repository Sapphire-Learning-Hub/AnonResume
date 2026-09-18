import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  aiMessages,
  aiModels,
  aiProposals,
  aiProviderCredentials,
  aiRuns,
  db,
  resumes,
} from "@/db";
import { hashAiContent } from "@/domain/resume/ai/content-hash";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createAiConversation } from "@/lib/ai/conversations/repository";
import { markAiProposalApplied } from "@/lib/ai/proposals/repository";
import { encryptAiCredential } from "@/lib/ai/security/credentials";

describe("AI proposal repository", () => {
  it("updates the resume and proposal atomically and retries idempotently", async () => {
    const encryptionKey = Buffer.alloc(32, 4);
    const userId = `ai-proposal-${randomUUID()}`;
    const resumeId = `resume-${randomUUID()}`;
    const assistantMessageId = randomUUID();
    const runId = randomUUID();
    const proposalId = randomUUID();
    const document = createDefaultResumeDocument("zh-CN");
    const section = document.sections[0]!;
    const nextTitle = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: "核心优势" }],
        },
      ],
    };
    const [provider] = await db
      .insert(aiProviderCredentials)
      .values({
        kind: "platform",
        displayName: "Proposal test provider",
        baseUrl: "https://models.example.com/v1",
        encryptedApiKey: encryptAiCredential("sk-proposal-test", encryptionKey),
      })
      .returning({ id: aiProviderCredentials.id });
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId: provider!.id,
        providerModelKey: "proposal-model",
        displayName: "Proposal model",
        contextWindow: 8_000,
        maxOutputTokens: 1_024,
        inputPointRate: 0,
        cachedInputPointRate: 0,
        outputPointRate: 0,
      })
      .returning({ id: aiModels.id });

    try {
      await db.insert(resumes).values({
        id: resumeId,
        userId,
        name: "Proposal test resume",
        summary: "",
        document,
      });
      const conversation = await createAiConversation({
        userId,
        resumeId,
        modelId: model!.id,
        title: "Proposal test",
        contextScope: "resume",
      });
      await db.insert(aiMessages).values({
        id: assistantMessageId,
        conversationId: conversation.id,
        role: "assistant",
        text: "建议修改标题",
        sequence: 1,
        completionState: "complete",
      });
      await db.insert(aiRuns).values({
        id: runId,
        userId,
        resumeId,
        conversationId: conversation.id,
        assistantMessageId,
        modelId: model!.id,
        keySource: "platform",
        status: "complete",
        resumeVersion: 1,
        contextHash: hashAiContent(document),
        promptVersion: 1,
      });
      await db.insert(aiProposals).values({
        id: proposalId,
        runId,
        baseResumeVersion: 1,
        targetHashes: {},
        completionState: "complete",
        proposal: {
          changes: [
            {
              id: "change-title",
              type: "replace_section_title",
              sectionId: section.id,
              beforeHash: hashAiContent(section.title ?? null),
              content: nextTitle,
              reason: "标题更明确",
            },
          ],
        },
      });

      const first = await markAiProposalApplied({
        userId,
        proposalId,
        selectedChangeIds: ["change-title"],
      });
      expect(first.resume).toMatchObject({ version: 2 });
      expect(first.resume.document.sections[0]!.title).toEqual(nextTitle);
      expect(first.proposal.appliedChangeIds).toEqual(["change-title"]);

      const retry = await markAiProposalApplied({
        userId,
        proposalId,
        selectedChangeIds: ["change-title"],
      });
      expect(retry.resume.version).toBe(2);
      expect(retry.proposal.appliedChangeIds).toEqual(["change-title"]);

      const [persistedResume] = await db
        .select({ version: resumes.version, document: resumes.document })
        .from(resumes)
        .where(eq(resumes.id, resumeId));
      const [persistedProposal] = await db
        .select({ appliedChangeIds: aiProposals.appliedChangeIds })
        .from(aiProposals)
        .where(eq(aiProposals.id, proposalId));
      expect(persistedResume?.version).toBe(2);
      expect(persistedProposal?.appliedChangeIds).toEqual(["change-title"]);
    } finally {
      await db.delete(resumes).where(eq(resumes.id, resumeId));
      await db
        .delete(aiProviderCredentials)
        .where(eq(aiProviderCredentials.id, provider!.id));
    }
  });
});
