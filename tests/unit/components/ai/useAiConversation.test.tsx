import { act, renderHook, waitFor } from "@testing-library/react";

import { useAiConversation } from "@/components/ai/useAiConversation";
import { AiClientError } from "@/lib/ai/client";

const clientMock = vi.hoisted(() => ({
  fetchAiConversation: vi.fn(),
  fetchAiConversationIndex: vi.fn(),
  sendAiMessage: vi.fn(),
  streamAiRun: vi.fn(),
  stopAiRun: vi.fn(),
}));

vi.mock("@/lib/ai/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/client")>()),
  createAiConversation: vi.fn(),
  deleteAiConversation: vi.fn(),
  fetchAiConversation: clientMock.fetchAiConversation,
  fetchAiConversationIndex: clientMock.fetchAiConversationIndex,
  sendAiMessage: clientMock.sendAiMessage,
  streamAiRun: clientMock.streamAiRun,
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
  const secondConversation = {
    ...conversation,
    id: "571f3841-497d-4d6a-b3a5-52be6823ff6e",
    title: "第二份对话",
  };

  const activeRun = (id: string) => ({
    id,
    status: "streaming",
    sequence: 0,
    text: "",
    proposal: null,
    progress: ["analyzing_resume"],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.streamAiRun.mockResolvedValue(undefined);
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

  it("subscribes to the new active run when conversations switch", async () => {
    let rejectFirstStream!: (error: unknown) => void;
    const firstStream = new Promise<void>((_resolve, reject) => {
      rejectFirstStream = reject;
    });
    const firstRunId = "62622b5d-ec93-43fb-925d-6b631703799b";
    const secondRunId = "e1272dcf-48c9-4cc7-b23a-8ee12e4971a6";
    clientMock.fetchAiConversationIndex.mockResolvedValue({
      enabled: true,
      conversations: [conversation, secondConversation],
      models: [],
    });
    clientMock.fetchAiConversation.mockImplementation(async (id: string) => ({
      conversation: id === conversation.id ? conversation : secondConversation,
      messages: [],
      proposals: [],
      activeRun: activeRun(id === conversation.id ? firstRunId : secondRunId),
    }));
    clientMock.streamAiRun.mockImplementation(
      ({ runId }: { runId: string }) =>
        runId === firstRunId ? firstStream : new Promise<void>(() => undefined),
    );

    const { result, unmount } = renderHook(() =>
      useAiConversation({
        open: true,
        resumeId: "resume-demo",
        resumeVersion: 1,
        onError: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(clientMock.streamAiRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: firstRunId }),
      ),
    );

    act(() => result.current.setSelectedConversationId(secondConversation.id));
    await waitFor(() =>
      expect(clientMock.fetchAiConversation).toHaveBeenCalledWith(
        secondConversation.id,
      ),
    );
    act(() => rejectFirstStream(new DOMException("Aborted", "AbortError")));

    await waitFor(() =>
      expect(clientMock.streamAiRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: secondRunId }),
      ),
    );
    unmount();
  });

  it("does not report an intentional stop from a reconnected run", async () => {
    const onError = vi.fn();
    const runId = "62622b5d-ec93-43fb-925d-6b631703799b";
    let rejectStream!: (error: unknown) => void;
    clientMock.fetchAiConversation.mockResolvedValue({
      conversation,
      messages: [],
      proposals: [],
      activeRun: activeRun(runId),
    });
    clientMock.streamAiRun.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectStream = reject;
        }),
    );
    clientMock.stopAiRun.mockImplementation(
      async (_runId: string, retract?: "if-empty" | "always") => {
        if (!retract) {
          rejectStream(new AiClientError("stopped", 400));
          return { stopped: true };
        }
        return {
          stopped: true,
          retracted: true,
          hadOutput: false,
          message: "停止重连任务",
        };
      },
    );

    const { result } = renderHook(() =>
      useAiConversation({
        open: true,
        resumeId: "resume-demo",
        resumeVersion: 1,
        onError,
      }),
    );
    await waitFor(() => expect(clientMock.streamAiRun).toHaveBeenCalled());

    await act(async () => {
      await result.current.stop();
    });
    expect(clientMock.stopAiRun).toHaveBeenCalledWith(runId);
    expect(onError).not.toHaveBeenCalled();
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
