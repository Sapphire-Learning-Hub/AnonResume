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
import {
  createAiConversation,
  getAiConversationDetails,
} from "@/lib/ai/conversations/repository";
import type { AiProviderAdapter } from "@/lib/ai/providers/types";
import {
  executePreparedAiRun,
  prepareAiRun,
  stopAiRun,
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
    expect(prepared.request.latencyPreference).toBe("fast");
    expect(prepared.request.messages[0]?.content).not.toContain("beforeHash");
    expect(prepared.request.messages[0]?.content).not.toContain("contentHash");

    const events = [];
    for await (const event of executePreparedAiRun(prepared, { adapter })) {
      events.push(event);
    }
    expect(events.some((event) => event.type === "text_delta")).toBe(true);
    expect(
      events
        .filter((event) => event.type === "progress")
        .map((event) => ("stage" in event ? event.stage : undefined)),
    ).toEqual([
      "analyzing_resume",
      "drafting_response",
      "generating_changes",
      "validating_result",
      "saving_result",
    ]);

    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      status: "complete",
      checkpointProgress: [
        "analyzing_resume",
        "drafting_response",
        "generating_changes",
        "validating_result",
        "saving_result",
      ],
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
      proposal: {
        changes: [
          expect.objectContaining({
            beforeHash: hashAiContent(block.content),
          }),
        ],
      },
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

  it("repairs one invalid proposal and settles combined usage", async () => {
    const section = document.sections[0]!;
    const block = section.blocks[0]!;
    if (block.type !== "text") throw new Error("Expected text block");
    let round = 0;
    const adapter: AiProviderAdapter = {
      async *start(request) {
        round += 1;
        if (round === 1) {
          yield {
            type: "proposal_delta",
            delta: '{"changes":[{"type":"replace_text"}]}',
          };
          yield {
            type: "usage",
            inputTokens: 100,
            cachedInputTokens: 10,
            outputTokens: 20,
          };
          yield { type: "complete", finishReason: "tool_calls" };
          return;
        }

        expect(request.toolChoice).toBe("required");
        expect(request.messages.at(-1)?.content).toContain(
          "invalid structured proposal",
        );
        yield {
          type: "proposal_delta",
          delta: JSON.stringify({
            summary: "修正后的建议",
            changes: [
              {
                id: "repair-1",
                type: "replace_text",
                sectionId: section.id,
                blockPath: [block.id],
                content: {
                  type: "doc",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "修正后的个人简介" }],
                    },
                  ],
                },
                reason: "修复结构化建议",
              },
            ],
          }),
        };
        yield {
          type: "usage",
          inputTokens: 120,
          cachedInputTokens: 20,
          outputTokens: 30,
        };
        yield { type: "complete", finishReason: "tool_calls" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "请生成一条可应用的修改",
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

    expect(round).toBe(2);
    expect(events.some((event) => event.type === "proposal_reset")).toBe(true);
    expect(
      events
        .filter((event) => event.type === "progress")
        .map((event) => ("stage" in event ? event.stage : undefined)),
    ).toEqual([
      "analyzing_resume",
      "generating_changes",
      "validating_result",
      "repairing_changes",
      "revalidating_result",
      "saving_result",
    ]);
    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      inputTokens: 220,
      cachedInputTokens: 30,
      outputTokens: 50,
      status: "complete",
    });
    const [storedProposal] = await db
      .select()
      .from(aiProposals)
      .where(eq(aiProposals.runId, prepared.runId));
    expect(storedProposal).toMatchObject({ completionState: "complete" });
  });

  it("executes staged structural tools before publishing a proposal", async () => {
    let round = 0;
    const adapter: AiProviderAdapter = {
      async *start(request) {
        round += 1;
        if (round === 1) {
          yield {
            type: "tool_call",
            callId: "call-stage",
            name: "stage_section_changes",
            arguments: JSON.stringify({
              operations: [
                {
                  type: "create",
                  title: "工作经历",
                  semantic: "experience",
                  afterSectionId: document.sections.at(-1)!.id,
                  blocks: [
                    {
                      type: "row",
                      children: [
                        { type: "text", text: "[公司名称] · [职位]" },
                        { type: "text", text: "[起止时间]" },
                      ],
                    },
                    { type: "list", items: ["[填写核心职责与成果]"] },
                  ],
                  reason: "创建工作经历骨架",
                },
              ],
            }),
          };
          yield {
            type: "usage",
            inputTokens: 80,
            cachedInputTokens: 10,
            outputTokens: 20,
          };
          yield { type: "complete", finishReason: "tool_calls" };
          return;
        }

        expect(request.messages.at(-1)?.content).toContain(
          "stage_section_changes",
        );
        yield {
          type: "tool_call",
          callId: "call-submit",
          name: "submit_resume_proposal",
          arguments: JSON.stringify({ summary: "已起草简历骨架" }),
        };
        yield {
          type: "usage",
          inputTokens: 90,
          cachedInputTokens: 10,
          outputTokens: 20,
        };
        yield { type: "complete", finishReason: "tool_calls" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "帮我起草一份简历骨架",
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

    expect(round).toBe(2);
    expect(events.map((event) => String(event.type))).not.toContain("tool_call");
    const [storedProposal] = await db
      .select()
      .from(aiProposals)
      .where(eq(aiProposals.runId, prepared.runId));
    expect(storedProposal).toMatchObject({ completionState: "complete" });
    expect(storedProposal?.proposal).toMatchObject({
      changes: [{ type: "create_section" }],
    });
    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      inputTokens: 170,
      cachedInputTokens: 20,
      outputTokens: 40,
      status: "complete",
    });
  });

  it("immediately releases the active run when its executor is unavailable", async () => {
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "停止已经失联的请求",
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

    await expect(stopAiRun({ userId, runId: prepared.runId })).resolves.toBe(true);

    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      status: "settlement_pending",
      failureCode: "stopped",
      leaseExpiresAt: null,
    });
    expect(run?.stopRequestedAt).toBeInstanceOf(Date);
    expect(run?.completedAt).toBeInstanceOf(Date);

    const [assistantMessage] = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.id, prepared.assistantMessageId));
    expect(assistantMessage).toMatchObject({ completionState: "stopped" });
  });

  it("retracts an unprocessed stopped turn back out of the conversation", async () => {
    const message = "这条消息还没有被处理";
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message,
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

    await stopAiRun({ userId, runId: prepared.runId });
    const result = await stopAiRun({
      userId,
      runId: prepared.runId,
      retract: "if-empty",
    } as Parameters<typeof stopAiRun>[0]);

    expect(result).toMatchObject({
      hadOutput: false,
      message,
      retracted: true,
      stopped: true,
    });
    const details = await getAiConversationDetails({ userId, conversationId });
    expect(
      details.messages.some(
        (conversationMessage) =>
          conversationMessage.id === prepared.assistantMessageId,
      ),
    ).toBe(false);
    expect(
      await db
        .select()
        .from(aiAuditPayloads)
        .where(eq(aiAuditPayloads.runId, prepared.runId)),
    ).toHaveLength(1);
  });
});
