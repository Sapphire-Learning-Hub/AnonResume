import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  aiModels,
  aiProviderCredentials,
  aiQuotaAccounts,
  aiUsageLedger,
  db,
  resumes,
} from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { getOptionalSession } from "@/lib/auth/session";
import { getAiCredentialsEncryptionKey } from "@/lib/ai/config/configuration";
import { createAiProviderAdapter } from "@/lib/ai/providers/registry";
import { executePreparedAiRun } from "@/lib/ai/runs/service";
import { claimQueuedAiRuns } from "@/lib/ai/runs/queue";
import { encryptAiCredential } from "@/lib/ai/security/credentials";
import { getAiWorkerAvailability } from "@/lib/ai/worker-availability";
import { getManagedConfigDefaults } from "@/lib/config/registry";
import { getRuntimeConfig } from "@/lib/config/runtime";

import {
  GET as listConversations,
  POST as createConversation,
} from "@/app/api/ai/conversations/route";
import { GET as getConversation } from "@/app/api/ai/conversations/[id]/route";
import { POST as sendMessage } from "@/app/api/ai/conversations/[id]/messages/route";
import { GET as streamRun } from "@/app/api/ai/runs/[id]/stream/route";
import { POST as stopRun } from "@/app/api/ai/runs/[id]/stop/route";

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: vi.fn(),
}));

vi.mock("@/lib/ai/providers/registry", () => ({
  createAiProviderAdapter: vi.fn(),
}));

vi.mock("@/lib/ai/worker-availability", () => ({
  getAiWorkerAvailability: vi.fn(),
}));

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: vi.fn(),
}));

function session(userId: string) {
  return {
    session: { id: `session-${userId}`, userId },
    user: { id: userId, name: userId, email: `${userId}@example.com` },
  } as never;
}

function mutationRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

describe("AI conversation routes", () => {
  const encryptionKey = getAiCredentialsEncryptionKey();
  const userId = `ai-route-${randomUUID()}`;
  const otherUserId = `ai-route-other-${randomUUID()}`;
  const resumeId = `resume-${randomUUID()}`;
  let providerId = "";
  let modelId = "";
  let conversationId = "";
  let latestRunId = "";

  beforeAll(async () => {
    const [provider] = await db
      .insert(aiProviderCredentials)
      .values({
        kind: "platform",
        displayName: "Route provider",
        baseUrl: "https://models.example.com/v1",
        encryptedApiKey: encryptAiCredential("sk-route-test", encryptionKey),
      })
      .returning({ id: aiProviderCredentials.id });
    providerId = provider!.id;
    const [model] = await db
      .insert(aiModels)
      .values({
        providerId,
        providerModelKey: "route-model",
        displayName: "Route model",
        contextWindow: 8_192,
        maxOutputTokens: 256,
        inputPointRate: 100,
        cachedInputPointRate: 10,
        outputPointRate: 500,
      })
      .returning({ id: aiModels.id });
    modelId = model!.id;
    await db.insert(resumes).values({
      id: resumeId,
      userId,
      name: "Route resume",
      summary: "",
      document: createDefaultResumeDocument("zh-CN"),
    });
  });

  beforeEach(() => {
    vi.mocked(getRuntimeConfig).mockResolvedValue({
      values: {
        ...getManagedConfigDefaults(),
        aiEnabled: true,
        aiPlatformEnabled: true,
      },
    } as never);
    vi.mocked(getOptionalSession).mockResolvedValue(session(userId));
    vi.mocked(getAiWorkerAvailability).mockResolvedValue({ available: true });
    vi.mocked(createAiProviderAdapter).mockReturnValue({
      async *start() {
        yield { type: "text_delta", delta: "建议突出可量化成果。" };
        yield {
          type: "usage",
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 20,
        };
        yield { type: "complete", finishReason: "stop" };
      },
    });
  });

  afterAll(async () => {
    await db.delete(aiUsageLedger).where(eq(aiUsageLedger.userId, userId));
    await db.delete(aiQuotaAccounts).where(eq(aiQuotaAccounts.userId, userId));
    await db.delete(resumes).where(eq(resumes.id, resumeId));
    await db
      .delete(aiProviderCredentials)
      .where(eq(aiProviderCredentials.id, providerId));
  });

  it("creates owned conversations and hides them from other users", async () => {
    const createResponse = await createConversation(
      mutationRequest("http://localhost/api/ai/conversations", {
        resumeId,
        modelId,
        title: "优化经历",
        contextScope: "resume",
      }),
    );
    expect(createResponse.status).toBe(201);
    conversationId = (await createResponse.json()).conversation.id;

    const listResponse = await listConversations(
      new Request(
        `http://localhost/api/ai/conversations?resumeId=${resumeId}`,
      ),
    );
    expect((await listResponse.json()).conversations).toHaveLength(1);

    vi.mocked(getOptionalSession).mockResolvedValueOnce(session(otherUserId));
    const hiddenResponse = await getConversation(
      new Request(`http://localhost/api/ai/conversations/${conversationId}`),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(hiddenResponse.status).toBe(404);
  });

  it("queues a message and exposes its reconnectable persisted stream", async () => {
    const queuedResponse = await sendMessage(
      mutationRequest(
        `http://localhost/api/ai/conversations/${conversationId}/messages`,
        { message: "帮我优化表达", resumeVersion: 1 },
      ),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(queuedResponse.status).toBe(202);
    latestRunId = (await queuedResponse.json()).runId;

    const [prepared] = await claimQueuedAiRuns({
      workerId: "route-test-worker",
      limit: 1,
      leaseSeconds: 90,
      encryptionKey,
    });
    expect(prepared?.runId).toBe(latestRunId);
    for await (const event of executePreparedAiRun(prepared!, {
      adapter: createAiProviderAdapter("openai-compatible"),
    })) {
      void event;
    }

    const streamResponse = await streamRun(
      new Request(`http://localhost/api/ai/runs/${latestRunId}/stream`),
      { params: Promise.resolve({ id: latestRunId }) },
    );
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(await streamResponse.text()).toContain("建议突出可量化成果");

    const detailResponse = await getConversation(
      new Request(`http://localhost/api/ai/conversations/${conversationId}`),
      { params: Promise.resolve({ id: conversationId }) },
    );
    const detail = await detailResponse.json();
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1]).toMatchObject({
      role: "assistant",
      text: "建议突出可量化成果。",
      completionState: "complete",
    });
  });

  it("retracts the latest completed turn for editing", async () => {
    const response = await stopRun(
      mutationRequest(`http://localhost/api/ai/runs/${latestRunId}/stop`, {
        retract: "always",
      }),
      { params: Promise.resolve({ id: latestRunId }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      hadOutput: true,
      message: "帮我优化表达",
      retracted: true,
      stopped: true,
    });

    const detailResponse = await getConversation(
      new Request(`http://localhost/api/ai/conversations/${conversationId}`),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect((await detailResponse.json()).messages).toHaveLength(0);
  });
});
