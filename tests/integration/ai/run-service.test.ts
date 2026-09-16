import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  aiAuditPayloads,
  aiMessages,
  aiModels,
  aiProposals,
  aiProviderCredentials,
  aiQuotaAccounts,
  aiRuns,
  aiUsageLedger,
  db,
  resumes,
} from "@/db";
import { hashAiContent } from "@/domain/resume/ai/content-hash";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createAiConversation } from "@/lib/ai/conversations/repository";
import type { AiProviderAdapter } from "@/lib/ai/providers/types";
import {
  executePreparedAiRun,
  prepareAiRun,
} from "@/lib/ai/runs/service";
import { encryptAiCredential } from "@/lib/ai/security/credentials";

describe("AI run service", () => {
  const encryptionKey = Buffer.alloc(32, 6);
  const userId = `ai-run-${randomUUID()}`;
  const resumeId = `resume-${randomUUID()}`;
  let providerId = "";
  let modelId = "";
  let conversationId = "";
  const document = createDefaultResumeDocument("zh-CN");

  beforeAll(async () => {
    const [provider] = await db
      .insert(aiProviderCredentials)
      .values({
        kind: "platform",
        displayName: "Run test provider",
        baseUrl: "https://models.example.com/v1",
        encryptedApiKey: encryptAiCredential("sk-run-test", encryptionKey),
      })
      .returning({ id: aiProviderCredentials.id });
    providerId = provider!.id;
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId,
        providerModelKey: "run-model",
        displayName: "Run model",
        supportsToolCalls: true,
        contextWindow: 32_000,
        maxOutputTokens: 1_024,
        inputPointRate: 1_000,
        cachedInputPointRate: 100,
        outputPointRate: 5_000,
      })
      .returning({ id: aiModels.id });
    modelId = model!.id;
    await db.insert(resumes).values({
      id: resumeId,
      userId,
      name: "Run test resume",
      summary: "",
      document,
    });
    const conversation = await createAiConversation({
      userId,
      resumeId,
      modelId,
      title: "Run test",
      contextScope: "resume",
    });
    conversationId = conversation.id;
  });

  afterAll(async () => {
    await db.delete(aiUsageLedger).where(eq(aiUsageLedger.userId, userId));
    await db.delete(aiQuotaAccounts).where(eq(aiQuotaAccounts.userId, userId));
    await db.delete(resumes).where(eq(resumes.id, resumeId));
    await db.delete(aiProviderCredentials).where(eq(aiProviderCredentials.id, providerId));
  });

  it("streams and persists a validated proposal before settling usage", async () => {
    const section = document.sections[0]!;
    const block = section.blocks[0]!;
    if (block.type !== "text") throw new Error("Expected text block");
    const proposal = JSON.stringify({
      summary: "表达更聚焦",
      changes: [
        {
          id: "change-1",
          type: "replace_text",
          sectionId: section.id,
          blockPath: [block.id],
          beforeHash: hashAiContent(block.content),
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "更清晰的个人简介" }],
              },
            ],
          },
          reason: "突出核心价值",
        },
      ],
    });
    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "request_id", requestId: "provider-request-1" };
        yield { type: "text_delta", delta: "我建议聚焦核心成果。" };
        yield { type: "proposal_delta", delta: proposal.slice(0, 80) };
        yield { type: "proposal_delta", delta: proposal.slice(80) };
        yield {
          type: "usage",
          inputTokens: 1_000,
          cachedInputTokens: 200,
          outputTokens: 300,
        };
        yield { type: "complete", finishReason: "tool_calls" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "帮我优化个人简介",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints: 100,
        requestsPerMinute: 10,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    const events = [];
    for await (const event of executePreparedAiRun(prepared, { adapter })) {
      events.push(event);
    }
    expect(events.some((event) => event.type === "text_delta")).toBe(true);

    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      status: "complete",
      providerRequestId: "provider-request-1",
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 300,
      finalPoints: 3,
    });
    const [assistantMessage] = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.id, prepared.assistantMessageId));
    expect(assistantMessage).toMatchObject({
      text: "我建议聚焦核心成果。",
      completionState: "complete",
    });
    const [storedProposal] = await db
      .select()
      .from(aiProposals)
      .where(eq(aiProposals.runId, prepared.runId));
    expect(storedProposal).toMatchObject({
      baseResumeVersion: 1,
      completionState: "complete",
    });
    expect(await db.select().from(aiAuditPayloads).where(eq(aiAuditPayloads.runId, prepared.runId))).toHaveLength(1);
    expect(
      await db
        .select()
        .from(aiUsageLedger)
        .where(
          and(
            eq(aiUsageLedger.userId, userId),
            eq(aiUsageLedger.runId, prepared.runId),
          ),
        ),
    ).toHaveLength(2);
  });

  it("observes stop requests written by another process", async () => {
    let notifyFirstDelta!: () => void;
    const firstDelta = new Promise<void>((resolve) => {
      notifyFirstDelta = resolve;
    });
    const adapter: AiProviderAdapter = {
      async *start(_request, signal) {
        yield { type: "request_id", requestId: "provider-request-stop" };
        yield { type: "text_delta", delta: "partial" };
        notifyFirstDelta();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 500);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            },
            { once: true },
          );
        });
        yield { type: "text_delta", delta: " should not arrive" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "停止这次请求",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints: 100,
        requestsPerMinute: 10,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });
    const events: Array<{ type: string; code?: string }> = [];
    const consuming = (async () => {
      for await (const event of executePreparedAiRun(prepared, { adapter })) {
        events.push(event);
      }
    })();

    await firstDelta;
    await db
      .update(aiRuns)
      .set({ stopRequestedAt: new Date() })
      .where(eq(aiRuns.id, prepared.runId));
    await consuming;

    expect(events.at(-1)).toMatchObject({ type: "error", code: "stopped" });
    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      status: "settlement_pending",
      failureCode: "stopped",
      checkpointText: "partial",
    });
  });
});
