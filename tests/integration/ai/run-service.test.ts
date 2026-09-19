import { randomUUID } from "node:crypto";

import { and, eq, max } from "drizzle-orm";

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
  getDatabaseSchemaName,
} from "@/db";
import { hashAiContent } from "@/domain/resume/ai/content-hash";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { decryptAiAuditEvidence } from "@/lib/ai/audit/store";
import {
  createAiConversation,
  getAiConversationDetails,
} from "@/lib/ai/conversations/repository";
import {
  AiProviderError,
  type AiProviderAdapter,
} from "@/lib/ai/providers/types";
import {
  AiRunAlreadyActiveError,
  executePreparedAiRun,
  prepareAiRun,
  stopAiRun,
} from "@/lib/ai/runs/service";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import { recoverExpiredAiRuns } from "@/lib/ai/runs/recovery";
import { encryptAiCredential } from "@/lib/ai/security/credentials";
import { releaseAiQuota } from "@/lib/ai/usage/ledger";
import { getDatabasePool } from "@/lib/runtime/database";

describe("AI run service", () => {
  const encryptionKey = Buffer.alloc(32, 6);
  const defaultMonthlyPoints = 10_000;
  const requestsPerMinute = 100;
  const userId = `ai-run-${randomUUID()}`;
  const resumeId = `resume-${randomUUID()}`;
  let providerId = "";
  let modelId = "";
  let conversationId = "";
  const document = createDefaultResumeDocument("zh-CN");

  async function claimPreparedRun(runId: string) {
    const claimed = await claimQueuedAiRuns({
      workerId: "integration-worker",
      limit: 1,
      leaseSeconds: 90,
      encryptionKey,
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.runId).toBe(runId);
    return claimed[0]!;
  }

  beforeAll(async () => {
    const [provider] = await db
      .insert(aiProviderCredentials)
      .values({
        kind: "platform",
        displayName: "Run test provider",
        baseUrl: "https://models.example.com/v1",
        encryptedApiKey: encryptAiCredential("sk-run-test", encryptionKey),
        allowCrossOriginRedirects: true,
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
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });
    expect(prepared.request.latencyPreference).toBe("fast");
    expect(prepared.request.allowCrossOriginRedirects).toBe(true);
    expect(prepared.request.messages[0]?.content).not.toContain("beforeHash");
    expect(prepared.request.messages[0]?.content).not.toContain("contentHash");
    const [queuedRun] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(queuedRun).toMatchObject({
      status: "queued",
      executionPayloadKeyVersion: 1,
      leaseExpiresAt: null,
    });
    expect(queuedRun?.encryptedExecutionPayload).toBeInstanceOf(Buffer);

    const events = [];
    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
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

  it("does not queue a run that recovery interrupted during preflight", async () => {
    const now = new Date();
    await db
      .insert(aiQuotaAccounts)
      .values({
        userId,
        monthlyLimit: defaultMonthlyPoints,
        periodStartedAt: now,
        periodEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
      })
      .onConflictDoNothing();
    const client = await getDatabasePool().connect();
    const schema = `"${getDatabaseSchemaName().replaceAll('"', '""')}"`;
    let preparation: ReturnType<typeof prepareAiRun> | undefined;
    let preparationError: unknown;
    let runId = "";
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT user_id FROM ${schema}.ai_quota_accounts WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      preparation = prepareAiRun({
        userId,
        conversationId,
        message: "在预处理期间模拟租约恢复",
        resumeVersion: 1,
        configuration: {
          credentialsEncryptionKey: encryptionKey,
          auditRetentionDays: 30,
          defaultMonthlyPoints,
          requestsPerMinute,
          streamCheckpointMs: 10,
          runLeaseSeconds: 90,
        },
      });

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [preparing] = await db
          .select({
            id: aiRuns.id,
            assistantMessageId: aiRuns.assistantMessageId,
          })
          .from(aiRuns)
          .where(
            and(
              eq(aiRuns.conversationId, conversationId),
              eq(aiRuns.status, "preparing"),
            ),
          )
          .limit(1);
        if (preparing) {
          runId = preparing.id;
          await db
            .update(aiRuns)
            .set({
              status: "interrupted",
              failureCode: "lease_expired",
              completedAt: new Date(),
              leaseExpiresAt: null,
            })
            .where(eq(aiRuns.id, preparing.id));
          await db
            .update(aiMessages)
            .set({ completionState: "failed" })
            .where(eq(aiMessages.id, preparing.assistantMessageId));
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(runId).not.toBe("");
      await client.query("COMMIT");
      try {
        await preparation;
      } catch (error) {
        preparationError = error;
      }
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }

    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.id, runId));
    if (run?.status === "queued") {
      await releaseAiQuota({ userId, runId, operationId: runId });
      await db
        .update(aiRuns)
        .set({
          status: "interrupted",
          finalPoints: 0,
          encryptedExecutionPayload: null,
          executionPayloadKeyVersion: null,
        })
        .where(eq(aiRuns.id, runId));
    }

    expect(preparationError).toBeInstanceOf(Error);
    expect(run).toMatchObject({
      status: "interrupted",
      encryptedExecutionPayload: null,
      leaseOwner: null,
    });
  });

  it("serializes per-user admission across different resumes", async () => {
    const secondResumeId = `resume-${randomUUID()}`;
    await db.insert(resumes).values({
      id: secondResumeId,
      userId,
      name: "Second run test resume",
      summary: "",
      document,
    });
    const secondConversation = await createAiConversation({
      userId,
      resumeId: secondResumeId,
      modelId,
      title: "Second run test",
      contextScope: "resume",
    });
    const configuration = {
      credentialsEncryptionKey: encryptionKey,
      auditRetentionDays: 30,
      defaultMonthlyPoints,
      requestsPerMinute,
      streamCheckpointMs: 10,
      runLeaseSeconds: 90,
      maxConcurrentRuns: 1,
    };

    try {
      const results = await Promise.allSettled([
        prepareAiRun({
          userId,
          conversationId,
          message: "分析第一份简历",
          resumeVersion: 1,
          configuration,
        }),
        prepareAiRun({
          userId,
          conversationId: secondConversation.id,
          message: "分析第二份简历",
          resumeVersion: 1,
          configuration,
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: expect.any(AiRunAlreadyActiveError),
      });

      const prepared = results.find(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof prepareAiRun>>> =>
          result.status === "fulfilled",
      )!.value;
      const adapter: AiProviderAdapter = {
        async *start() {
          yield { type: "text_delta", delta: "分析完成" };
          yield { type: "complete", finishReason: "stop" };
        },
      };
      const claimed = await claimPreparedRun(prepared.runId);
      for await (const event of executePreparedAiRun(claimed, { adapter })) {
        void event;
      }
    } finally {
      await db.delete(resumes).where(eq(resumes.id, secondResumeId));
    }
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
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });
    const events: Array<{ type: string; code?: string }> = [];
    const consuming = (async () => {
      const claimed = await claimPreparedRun(prepared.runId);
      for await (const event of executePreparedAiRun(claimed, { adapter })) {
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

  it("renews the execution lease while a provider is silent", async () => {
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const adapter: AiProviderAdapter = {
      async *start() {
        notifyStarted();
        await new Promise((resolve) => setTimeout(resolve, 1_300));
        yield { type: "text_delta", delta: "延迟后完成" };
        yield {
          type: "usage",
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 5,
        };
        yield { type: "complete", finishReason: "stop" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "等待供应商响应",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 1,
      },
    });
    const claimed = await claimPreparedRun(prepared.runId);
    const consuming = (async () => {
      for await (const event of executePreparedAiRun(claimed, { adapter })) {
        void event;
      }
    })();

    await started;
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(
      await recoverExpiredAiRuns({ now: new Date(), batchSize: 10 }),
    ).toEqual({
      interrupted: 0,
      settlementPending: 0,
      releasedPoints: 0,
    });
    await consuming;

    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({ status: "complete" });
  });

  it("does not renew an already expired lease while a provider is silent", async () => {
    let notifyStarted!: () => void;
    let releaseProvider!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const adapter: AiProviderAdapter = {
      async *start() {
        notifyStarted();
        await providerGate;
        yield { type: "text_delta", delta: "过期后不应继续" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "验证过期租约不会被续期",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 2,
      },
    });
    const claimed = await claimPreparedRun(prepared.runId);
    const consuming = (async () => {
      for await (const event of executePreparedAiRun(claimed, { adapter })) {
        void event;
      }
    })();
    await started;
    const expiredAt = new Date(Date.now() - 1_000);
    await db
      .update(aiRuns)
      .set({ leaseExpiresAt: expiredAt })
      .where(eq(aiRuns.id, prepared.runId));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const [expiredRun] = await db
      .select({ leaseExpiresAt: aiRuns.leaseExpiresAt })
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    releaseProvider();

    let executionError: unknown;
    try {
      await consuming;
    } catch (error) {
      executionError = error;
    }
    await releaseAiQuota({
      userId,
      runId: prepared.runId,
      operationId: prepared.runId,
    });
    await db
      .update(aiRuns)
      .set({
        status: "interrupted",
        finalPoints: 0,
        completedAt: new Date(),
        encryptedExecutionPayload: null,
        executionPayloadKeyVersion: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(aiRuns.id, prepared.runId));

    expect(executionError).toBeInstanceOf(Error);
    expect(expiredRun?.leaseExpiresAt?.getTime()).toBe(expiredAt.getTime());
  });

  it("does not start an executor after its claimed lease expires", async () => {
    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "text_delta", delta: "不应执行" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "验证过期租约不会启动",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });
    const claimed = await claimPreparedRun(prepared.runId);
    await db
      .update(aiRuns)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(aiRuns.id, prepared.runId));

    const events = [];
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
      events.push(event);
    }
    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));

    await releaseAiQuota({
      userId,
      runId: prepared.runId,
      operationId: prepared.runId,
    });
    await db
      .update(aiRuns)
      .set({
        status: "interrupted",
        finalPoints: 0,
        completedAt: new Date(),
        encryptedExecutionPayload: null,
        executionPayloadKeyVersion: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(aiRuns.id, prepared.runId));

    expect(events).toEqual([]);
    expect(run).toMatchObject({
      status: "preparing",
      checkpointText: "",
    });
  });

  it("fences an executor after its lease ownership changes", async () => {
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const adapter: AiProviderAdapter = {
      async *start() {
        notifyStarted();
        await new Promise((resolve) => setTimeout(resolve, 500));
        yield { type: "text_delta", delta: "旧执行器不应写入" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "验证执行租约隔离",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 5,
      },
    });
    const claimed = await claimPreparedRun(prepared.runId);
    const consuming = (async () => {
      for await (const event of executePreparedAiRun(claimed, { adapter })) {
        void event;
      }
    })();

    await started;
    await db
      .update(aiRuns)
      .set({ leaseOwner: "replacement-worker" })
      .where(eq(aiRuns.id, prepared.runId));

    await expect(consuming).rejects.toThrow();
    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      status: "streaming",
      leaseOwner: "replacement-worker",
      checkpointText: "",
    });

    await releaseAiQuota({
      userId,
      runId: prepared.runId,
      operationId: prepared.runId,
    });
    await db
      .update(aiRuns)
      .set({
        status: "interrupted",
        finalPoints: 0,
        completedAt: new Date(),
        encryptedExecutionPayload: null,
        executionPayloadKeyVersion: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(aiRuns.id, prepared.runId));
  });

  it("does not persist proposals or settle quota after final lease loss", async () => {
    const section = document.sections[0]!;
    const block = section.blocks[0]!;
    if (block.type !== "text") throw new Error("Expected text block");
    const proposal = JSON.stringify({
      summary: "租约竞争测试",
      changes: [
        {
          id: "lease-race-change",
          type: "replace_text",
          sectionId: section.id,
          blockPath: [block.id],
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "不会被旧执行器写入" }],
              },
            ],
          },
          reason: "验证租约栅栏",
        },
      ],
    });
    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "proposal_delta", delta: proposal };
        yield {
          type: "usage",
          inputTokens: 50,
          cachedInputTokens: 0,
          outputTokens: 20,
        };
        yield { type: "complete", finishReason: "stop" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "验证最终结算租约",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });
    const claimed = await claimPreparedRun(prepared.runId);
    const iterator = executePreparedAiRun(claimed, { adapter });
    let savingReached = false;
    while (!savingReached) {
      const next = await iterator.next();
      if (next.done) throw new Error("Run completed before final fencing test");
      savingReached =
        next.value.type === "progress" &&
        next.value.stage === "saving_result";
    }
    await db
      .update(aiRuns)
      .set({ leaseOwner: "replacement-finalizer" })
      .where(eq(aiRuns.id, prepared.runId));

    let executionError: unknown;
    try {
      await iterator.next();
    } catch (error) {
      executionError = error;
    }
    const settlements = await db
      .select()
      .from(aiUsageLedger)
      .where(
        and(
          eq(aiUsageLedger.runId, prepared.runId),
          eq(aiUsageLedger.entryType, "settlement"),
        ),
      );
    const proposals = await db
      .select()
      .from(aiProposals)
      .where(eq(aiProposals.runId, prepared.runId));

    if (settlements.length === 0) {
      await releaseAiQuota({
        userId,
        runId: prepared.runId,
        operationId: prepared.runId,
      });
    }
    await db.delete(aiProposals).where(eq(aiProposals.runId, prepared.runId));
    await db
      .update(aiRuns)
      .set({
        status: "interrupted",
        finalPoints: settlements.length === 0 ? 0 : undefined,
        completedAt: new Date(),
        encryptedExecutionPayload: null,
        executionPayloadKeyVersion: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(aiRuns.id, prepared.runId));

    expect(executionError).toBeInstanceOf(Error);
    expect(settlements).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });

  it("does not finalize proposals or quota after the lease expires", async () => {
    const section = document.sections[0]!;
    const block = section.blocks[0]!;
    if (block.type !== "text") throw new Error("Expected text block");
    const proposal = JSON.stringify({
      summary: "租约过期测试",
      changes: [
        {
          id: "expired-lease-change",
          type: "replace_text",
          sectionId: section.id,
          blockPath: [block.id],
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "不会由过期执行器写入" }],
              },
            ],
          },
          reason: "验证租约有效期",
        },
      ],
    });
    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "proposal_delta", delta: proposal };
        yield {
          type: "usage",
          inputTokens: 50,
          cachedInputTokens: 0,
          outputTokens: 20,
        };
        yield { type: "complete", finishReason: "stop" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "验证过期租约最终结算",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });
    const claimed = await claimPreparedRun(prepared.runId);
    const iterator = executePreparedAiRun(claimed, { adapter });
    while (true) {
      const next = await iterator.next();
      if (next.done) throw new Error("Run completed before expiry fencing test");
      if (next.value.type === "progress" && next.value.stage === "saving_result") {
        break;
      }
    }
    await db
      .update(aiRuns)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(aiRuns.id, prepared.runId));

    await expect(iterator.next()).rejects.toThrow("ai_run_lease_lost");
    const settlements = await db
      .select()
      .from(aiUsageLedger)
      .where(
        and(
          eq(aiUsageLedger.runId, prepared.runId),
          eq(aiUsageLedger.entryType, "settlement"),
        ),
      );
    const proposals = await db
      .select()
      .from(aiProposals)
      .where(eq(aiProposals.runId, prepared.runId));

    await releaseAiQuota({
      userId,
      runId: prepared.runId,
      operationId: prepared.runId,
    });
    await db
      .update(aiRuns)
      .set({
        status: "interrupted",
        finalPoints: 0,
        completedAt: new Date(),
        encryptedExecutionPayload: null,
        executionPayloadKeyVersion: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(eq(aiRuns.id, prepared.runId));

    expect(settlements).toHaveLength(0);
    expect(proposals).toHaveLength(0);
  });

  it("stores encrypted diagnostics when execution fails after usage arrives", async () => {
    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "request_id", requestId: "provider-request-failed" };
        yield { type: "text_delta", delta: "已生成的部分内容" };
        yield {
          type: "usage",
          inputTokens: 400,
          cachedInputTokens: 100,
          outputTokens: 80,
        };
        throw Object.assign(new Error("simulated provider stream failure"), {
          code: "ECONNRESET",
        });
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "帮我修改工作经历",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    const events = [];
    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "provider_execution_failed",
    });
    const [audit] = await db
      .select()
      .from(aiAuditPayloads)
      .where(eq(aiAuditPayloads.runId, prepared.runId));
    expect(audit?.encryptedResponse).toBeTruthy();
    expect(
      decryptAiAuditEvidence(
        {
          encryptedRequest: audit!.encryptedRequest,
          encryptedResponse: audit!.encryptedResponse!,
        },
        encryptionKey,
      ).response,
    ).toMatchObject({
      failure: {
        phase: "provider_execution",
        error: {
          name: "Error",
          code: "ECONNRESET",
          message: "simulated provider stream failure",
        },
      },
      providerRequestId: "provider-request-failed",
      text: "已生成的部分内容",
      usage: {
        inputTokens: 400,
        cachedInputTokens: 100,
        outputTokens: 80,
      },
    });
  });

  it("retracts a failed turn that produced no user-visible output", async () => {
    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "request_id", requestId: "empty-failure" };
        throw new Error("empty provider failure");
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "这条失败消息不应保留",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
      void event;
    }

    const details = await getAiConversationDetails({ userId, conversationId });
    expect(details.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "这条失败消息不应保留" }),
        expect.objectContaining({ id: prepared.assistantMessageId }),
      ]),
    );
  });

  it("excludes incomplete legacy turns from the provider context", async () => {
    const [{ lastSequence }] = await db
      .select({ lastSequence: max(aiMessages.sequence) })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId));
    const sequence = lastSequence ?? 0;
    await db.insert(aiMessages).values([
      {
        conversationId,
        role: "user",
        text: "legacy failed request",
        sequence: sequence + 1,
        completionState: "complete",
      },
      {
        conversationId,
        role: "assistant",
        text: "",
        sequence: sequence + 2,
        completionState: "failed",
      },
    ]);
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "这份简历有哪些问题？",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    expect(prepared.request.messages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "legacy failed request" }),
      ]),
    );

    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "text_delta", delta: "建议先补充真实经历。" };
        yield {
          type: "usage",
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 20,
        };
        yield { type: "complete", finishReason: "stop" };
      },
    };
    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
      void event;
    }
  });

  it("retries one missing tool payload and settles both provider attempts", async () => {
    let attempts = 0;
    const adapter: AiProviderAdapter = {
      async *start(request) {
        attempts += 1;
        if (attempts === 1) {
          yield {
            type: "usage",
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 10,
          };
          throw new AiProviderError("invalid_response", {
            protocolViolation: "missing_tool_payload",
          });
        }
        expect(request.messages.at(-1)?.content).toContain(
          "list_resume_capabilities",
        );
        yield { type: "text_delta", delta: "建议先明确目标岗位。" };
        yield {
          type: "usage",
          inputTokens: 120,
          cachedInputTokens: 30,
          outputTokens: 20,
        };
        yield { type: "complete", finishReason: "stop" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "这份简历有哪些问题？",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
      void event;
    }

    expect(attempts).toBe(2);
    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      status: "complete",
      inputTokens: 220,
      cachedInputTokens: 50,
      outputTokens: 30,
    });
  });

  it("fails an editing run that ends without a reviewable proposal", async () => {
    const adapter: AiProviderAdapter = {
      async *start() {
        yield { type: "text_delta", delta: "我会优化这份简历。" };
        yield {
          type: "usage",
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 20,
        };
        yield { type: "complete", finishReason: "stop" };
      },
    };
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "帮我优化一下简历排版",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    const events = [];
    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
      events.push(event);
    }

    expect(events.at(-1)).toMatchObject({
      type: "error",
      code: "proposal_validation_failed",
    });
    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(run).toMatchObject({
      status: "settlement_pending",
      failureCode: "proposal_validation_failed",
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
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    const events = [];
    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
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
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });

    expect(prepared.request.toolChoice).toBe("required");
    expect(prepared.request.tools?.map((tool) => tool.name)).not.toContain(
      "propose_resume_changes",
    );

    const events = [];
    const claimed = await claimPreparedRun(prepared.runId);
    for await (const event of executePreparedAiRun(claimed, { adapter })) {
      events.push(event);
    }

    expect(round).toBe(2);
    expect(events.map((event) => String(event.type))).not.toContain("tool_call");
    expect(events).toContainEqual({
      sequence: expect.any(Number),
      type: "proposal_progress",
      changes: [
        {
          id: expect.any(String),
          type: "create_section",
          reason: "创建工作经历骨架",
          preview: "工作经历",
        },
      ],
    });
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

  it("releases a queued run without requiring manual settlement", async () => {
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "停止已经失联的请求",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
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
      status: "stopped",
      finalPoints: 0,
      failureCode: "stopped",
      encryptedExecutionPayload: null,
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

  it("keeps a stopped queued run recoverable when quota release fails", async () => {
    const prepared = await prepareAiRun({
      userId,
      conversationId,
      message: "停止额度账本异常的请求",
      resumeVersion: 1,
      configuration: {
        credentialsEncryptionKey: encryptionKey,
        auditRetentionDays: 30,
        defaultMonthlyPoints,
        requestsPerMinute,
        streamCheckpointMs: 10,
        runLeaseSeconds: 90,
      },
    });
    const [reservation] = await db
      .select()
      .from(aiUsageLedger)
      .where(
        and(
          eq(aiUsageLedger.userId, userId),
          eq(aiUsageLedger.runId, prepared.runId),
          eq(aiUsageLedger.entryType, "reserve"),
        ),
      );
    expect(reservation).toBeDefined();
    await db
      .delete(aiUsageLedger)
      .where(eq(aiUsageLedger.id, reservation!.id));

    await expect(stopAiRun({ userId, runId: prepared.runId })).resolves.toBe(true);

    const [pendingRun] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, prepared.runId));
    expect(pendingRun).toMatchObject({
      status: "settlement_pending",
      failureCode: "stopped",
      encryptedExecutionPayload: null,
    });

    await db.insert(aiUsageLedger).values(reservation!);
    await releaseAiQuota({
      userId,
      runId: prepared.runId,
      operationId: prepared.runId,
    });
    await db
      .update(aiRuns)
      .set({ status: "stopped", finalPoints: 0 })
      .where(eq(aiRuns.id, prepared.runId));
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
        defaultMonthlyPoints,
        requestsPerMinute,
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
