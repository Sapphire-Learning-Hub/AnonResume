import { act, renderHook, waitFor } from "@testing-library/react";

import { useAiConversation } from "@/components/ai/useAiConversation";

const clientMock = vi.hoisted(() => ({
  fetchAiConversation: vi.fn(),
  fetchAiConversationIndex: vi.fn(),
  sendAiMessage: vi.fn(),
  stopAiRun: vi.fn(),
}));

vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  createAiConversation: vi.fn(),
  deleteAiConversation: vi.fn(),
  fetchAiConversation: clientMock.fetchAiConversation,
  fetchAiConversationIndex: clientMock.fetchAiConversationIndex,
  sendAiMessage: clientMock.sendAiMessage,
  stopAiRun: clientMock.stopAiRun,
  updateAiConversation: vi.fn(),
}));

describe("useAiConversation", () => {
  const conversation = {
    id: "70fe89d9-17c0-4212-bb90-03c3fa846a8b",
    resumeId: "resume-demo",
    title: "优化简历",
    contextScope: "resume" as const,
    sectionId: null,
    modelId: "ed081f44-ec13-42c6-8f18-c3644e83f07d",
    archivedAt: null,
    createdAt: "2026-09-16T15:00:00.000Z",
    updatedAt: "2026-09-16T15:00:01.000Z",
  };

  beforeEach(() => {
    clientMock.fetchAiConversationIndex.mockResolvedValue({
      enabled: true,
      conversations: [conversation],
      models: [
        {
          id: conversation.modelId,
          displayName: "测试模型",
          providerModelKey: "test-model",
          supportsStreaming: true,
          supportsToolCalls: true,
          maxOutputTokens: 1_000,
          keySource: "platform",
          providerName: "Platform Provider",
        },
      ],
    });
    clientMock.fetchAiConversation.mockResolvedValue({
      conversation,
      messages: [],
      proposals: [],
      activeRun: null,
    });
    clientMock.stopAiRun.mockImplementation(
      async (_runId: string, retract?: "if-empty" | "always") =>
        retract
          ? {
              stopped: true,
              retracted: true,
              hadOutput: false,
              message: "立即停止这条消息",
            }
          : { stopped: true },
    );
  });

  it("waits for a run id when stop is requested immediately after send", async () => {
    let startRun!: () => void;
    clientMock.sendAiMessage.mockImplementation(
      ({ onRun }: { onRun?: (runId: string) => void }) =>
        new Promise<void>((resolve) => {
          startRun = () => {
            onRun?.("62622b5d-ec93-43fb-925d-6b631703799b");
            resolve();
          };
        }),
    );

    const { result } = renderHook(() =>
      useAiConversation({
        open: true,
        resumeId: "resume-demo",
        resumeVersion: 1,
        onError: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(result.current.selectedConversationId).toBe(conversation.id),
    );

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send("立即停止这条消息");
    });
    await waitFor(() => expect(result.current.sending).toBe(true));

    let stopPromise!: Promise<string | undefined>;
    act(() => {
      stopPromise = result.current.stop();
    });
    act(() => startRun());

    await expect(stopPromise).resolves.toBe("立即停止这条消息");
    await expect(sendPromise).resolves.toBeUndefined();
    expect(clientMock.stopAiRun).toHaveBeenNthCalledWith(
      1,
      "62622b5d-ec93-43fb-925d-6b631703799b",
    );
  });

  it("reports server-controlled execution stages as visible progress", async () => {
    let finishStream!: () => void;
    let emitEvent!: (event:
      | {
          type: "progress";
          stage: "analyzing_resume" | "thinking";
        }
      | { type: "proposal_delta"; delta: string }
      | {
          type: "proposal_progress";
          changes: Array<{
            id: string;
            type: string;
            reason: string;
            preview: string | null;
          }>;
        }
      | { type: "proposal_reset" }) => void;
    clientMock.sendAiMessage.mockImplementation(
      ({
        onEvent,
      }: {
        onEvent: typeof emitEvent;
      }) =>
        new Promise<void>((resolve) => {
          emitEvent = onEvent;
          finishStream = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useAiConversation({
        open: true,
        resumeId: "resume-demo",
        resumeVersion: 1,
        onError: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(result.current.selectedConversationId).toBe(conversation.id),
    );

    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send("分析这份简历");
    });
    await waitFor(() => expect(result.current.sending).toBe(true));
    act(() => {
      emitEvent({ type: "progress", stage: "analyzing_resume" });
      emitEvent({ type: "progress", stage: "thinking" });
      emitEvent({ type: "proposal_delta", delta: "invalid draft" });
      emitEvent({
        type: "proposal_progress",
        changes: [
          {
            id: "change-work",
            type: "replace_text",
            reason: "突出可量化成果",
            preview: "将项目交付周期缩短 30%",
          },
        ],
      });
    });

    await waitFor(() =>
      expect(result.current.streamingProgressStages).toEqual([
        "analyzing_resume",
        "thinking",
      ]),
    );
    expect(result.current.streamingProposalText).toBe("invalid draft");
    expect(result.current.streamingProposalChanges).toEqual([
      {
        id: "change-work",
        type: "replace_text",
        reason: "突出可量化成果",
        preview: "将项目交付周期缩短 30%",
      },
    ]);
    act(() => emitEvent({ type: "proposal_reset" }));
    expect(result.current.streamingProposalText).toBe("");
    expect(result.current.streamingProposalChanges).toEqual([]);
    act(() => finishStream());
    await sendPromise;
  });
});
