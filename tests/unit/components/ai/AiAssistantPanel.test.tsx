import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AiAssistantPanel } from "@/components/ai/AiAssistantPanel";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";

const assistantMock = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/components/ai/useAiConversation", () => ({
  useAiConversation: () => assistantMock.current,
}));

function createAssistantState() {
  return {
    archive: vi.fn(),
    conversations: [],
    contextScope: "resume",
    details: undefined,
    edit: vi.fn(),
    enabled: true,
    loading: false,
    models: [],
    pendingAfterSequence: 0,
    pendingUserMessage: "",
    refresh: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    selectedConversationId: undefined,
    selectedModelId: undefined,
    sending: false,
    send: vi.fn(),
    setContextScope: vi.fn(),
    setSelectedConversationId: vi.fn(),
    setSelectedModelId: vi.fn(),
    startNewConversation: vi.fn(),
    stop: vi.fn(),
    stopping: false,
    streamingProposalText: "",
    streamingReasoningSteps: 0,
    streamingText: "",
  };
}

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: { error: vi.fn() },
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));

describe("AiAssistantPanel", () => {
  beforeEach(() => {
    assistantMock.current = createAssistantState();
  });

  it("renders as a resizable complementary panel instead of an overlay", () => {
    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "AI 编辑助手" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "调整 AI 编辑助手宽度" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "AI 编辑助手" }),
    ).not.toBeInTheDocument();
  });

  it("adjusts its width from the accessible resize boundary", () => {
    const innerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1_600,
    });

    try {
      render(
        <AiAssistantPanel
          open
          resumeId="resume-demo"
          resumeVersion={1}
          onApplyProposal={() => ({
            ok: true,
            appliedChangeIds: [],
            document: createDefaultResumeDocument(),
          })}
          onClose={vi.fn()}
        />,
      );

      const panel = screen.getByRole("complementary", {
        name: "AI 编辑助手",
      });
      const resizeBoundary = screen.getByRole("separator", {
        name: "调整 AI 编辑助手宽度",
      });

      expect(panel).toHaveStyle({ width: "480px" });
      fireEvent.keyDown(resizeBoundary, { key: "ArrowRight" });
      expect(panel).toHaveStyle({ width: "456px" });
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: innerWidth,
      });
    }
  });

  it("does not duplicate optimistic messages after the active run is loaded", () => {
    assistantMock.current = {
      ...createAssistantState(),
      details: {
        conversation: {
          id: "70fe89d9-17c0-4212-bb90-03c3fa846a8b",
          resumeId: "resume-demo",
          title: "优化简历",
          contextScope: "resume",
          sectionId: null,
          modelId: "ed081f44-ec13-42c6-8f18-c3644e83f07d",
          archivedAt: null,
          createdAt: "2026-09-16T15:00:00.000Z",
          updatedAt: "2026-09-16T15:00:01.000Z",
        },
        messages: [
          {
            id: "7bf981f1-646f-4e0e-ac5a-a38e112e101b",
            role: "user",
            text: "帮我起草一份简历",
            sequence: 1,
            completionState: "complete",
            createdAt: "2026-09-16T15:00:00.000Z",
          },
          {
            id: "9b958d42-21a0-4187-9ee4-101004080968",
            role: "assistant",
            text: "",
            sequence: 2,
            completionState: "streaming",
            createdAt: "2026-09-16T15:00:00.000Z",
          },
        ],
        proposals: [],
        activeRun: {
          id: "62622b5d-ec93-43fb-925d-6b631703799b",
          status: "streaming",
          sequence: 3,
          text: "",
          proposal: null,
        },
      },
      pendingUserMessage: "",
      sending: false,
    };

    const { container } = render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('[data-role="user"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-role="assistant"]')).toHaveLength(
      1,
    );
  });

  it("restores the submitted message when sending fails", async () => {
    const send = vi.fn().mockRejectedValue(new Error("provider_failed"));
    assistantMock.current = {
      ...createAssistantState(),
      selectedModelId: "ed081f44-ec13-42c6-8f18-c3644e83f07d",
      send,
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    const composer = screen.getByPlaceholderText(
      "例如：帮我把项目经历写得更具体，并突出可量化成果",
    );
    fireEvent.change(composer, { target: { value: "帮我优化工作经历" } });
    fireEvent.click(screen.getByRole("button", { name: /发\s*送/ }));

    expect(send).toHaveBeenCalledWith("帮我优化工作经历");
    await waitFor(() => expect(composer).toHaveValue("帮我优化工作经历"));
  });

  it("prefers the live text stream over an older persisted checkpoint", () => {
    assistantMock.current = {
      ...createAssistantState(),
      details: {
        conversation: {
          id: "70fe89d9-17c0-4212-bb90-03c3fa846a8b",
          resumeId: "resume-demo",
          title: "优化简历",
          contextScope: "resume",
          sectionId: null,
          modelId: "ed081f44-ec13-42c6-8f18-c3644e83f07d",
          archivedAt: null,
          createdAt: "2026-09-16T15:00:00.000Z",
          updatedAt: "2026-09-16T15:00:01.000Z",
        },
        messages: [
          {
            id: "7bf981f1-646f-4e0e-ac5a-a38e112e101b",
            role: "user",
            text: "帮我优化简历",
            sequence: 1,
            completionState: "complete",
            createdAt: "2026-09-16T15:00:00.000Z",
          },
          {
            id: "9b958d42-21a0-4187-9ee4-101004080968",
            role: "assistant",
            text: "正在分析简历",
            sequence: 2,
            completionState: "streaming",
            createdAt: "2026-09-16T15:00:00.000Z",
          },
        ],
        proposals: [],
        activeRun: {
          id: "62622b5d-ec93-43fb-925d-6b631703799b",
          status: "streaming",
          sequence: 12,
          text: "正在分析简历",
          proposal: null,
        },
      },
      pendingUserMessage: "帮我优化简历",
      sending: true,
      streamingText: "正在分析简历，并整理工作经历",
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("正在分析简历，并整理工作经历"),
    ).toBeInTheDocument();
    expect(screen.queryByText("正在分析简历")).not.toBeInTheDocument();
  });

  it("shows proposal content while tool arguments are still streaming", () => {
    assistantMock.current = {
      ...createAssistantState(),
      sending: true,
      streamingProposalText:
        '{"summary":"正在重新组织项目经历","changes":[{"type":"replace_text"}',
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("正在重新组织项目经历")).toBeInTheDocument();
    expect(screen.getByText("正在生成修改建议…")).toBeInTheDocument();
  });

  it("shows a deep-thinking loading state without exposing private reasoning text", () => {
    assistantMock.current = {
      ...createAssistantState(),
      sending: true,
      streamingReasoningSteps: 3,
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("正在深度思考…")).toBeInTheDocument();
  });

  it("does not leave a thinking placeholder after a tool-only response completes", () => {
    assistantMock.current = {
      ...createAssistantState(),
      details: {
        conversation: {
          id: "70fe89d9-17c0-4212-bb90-03c3fa846a8b",
          resumeId: "resume-demo",
          title: "优化简历",
          contextScope: "resume",
          sectionId: null,
          modelId: "ed081f44-ec13-42c6-8f18-c3644e83f07d",
          archivedAt: null,
          createdAt: "2026-09-16T15:00:00.000Z",
          updatedAt: "2026-09-16T15:00:01.000Z",
        },
        messages: [
          {
            id: "9b958d42-21a0-4187-9ee4-101004080968",
            role: "assistant",
            text: "",
            sequence: 2,
            completionState: "complete",
            runId: "62622b5d-ec93-43fb-925d-6b631703799b",
            createdAt: "2026-09-16T15:00:00.000Z",
          },
        ],
        proposals: [],
        activeRun: null,
      },
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("正在思考…")).not.toBeInTheDocument();
  });

  it("restores proposal progress from the active run checkpoint", () => {
    assistantMock.current = {
      ...createAssistantState(),
      details: {
        conversation: {
          id: "70fe89d9-17c0-4212-bb90-03c3fa846a8b",
          resumeId: "resume-demo",
          title: "优化简历",
          contextScope: "resume",
          sectionId: null,
          modelId: "ed081f44-ec13-42c6-8f18-c3644e83f07d",
          archivedAt: null,
          createdAt: "2026-09-16T15:00:00.000Z",
          updatedAt: "2026-09-16T15:00:01.000Z",
        },
        messages: [],
        proposals: [],
        activeRun: {
          id: "62622b5d-ec93-43fb-925d-6b631703799b",
          status: "streaming",
          sequence: 8,
          text: "",
          proposal: '{"summary":"正在检查工作经历',
        },
      },
      sending: false,
      streamingProposalText: "",
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("正在检查工作经历")).toBeInTheDocument();
    expect(screen.getByText("正在生成修改建议…")).toBeInTheDocument();
  });

  it("returns an unprocessed stopped message to the composer", async () => {
    const stop = vi.fn().mockResolvedValue("补充我的项目经历");
    assistantMock.current = {
      ...createAssistantState(),
      pendingUserMessage: "补充我的项目经历",
      sending: true,
      stop,
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));

    expect(stop).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(
          "例如：帮我把项目经历写得更具体，并突出可量化成果",
        ),
      ).toHaveValue("补充我的项目经历"),
    );
  });

  it("allows editing the latest stopped turn after output was produced", async () => {
    const edit = vi.fn().mockResolvedValue("优化我的工作经历");
    assistantMock.current = {
      ...createAssistantState(),
      details: {
        conversation: {
          id: "70fe89d9-17c0-4212-bb90-03c3fa846a8b",
          resumeId: "resume-demo",
          title: "优化简历",
          contextScope: "resume",
          sectionId: null,
          modelId: "ed081f44-ec13-42c6-8f18-c3644e83f07d",
          archivedAt: null,
          createdAt: "2026-09-16T15:00:00.000Z",
          updatedAt: "2026-09-16T15:00:01.000Z",
        },
        messages: [
          {
            id: "7bf981f1-646f-4e0e-ac5a-a38e112e101b",
            role: "user",
            text: "优化我的工作经历",
            sequence: 1,
            completionState: "complete",
            runId: null,
            createdAt: "2026-09-16T15:00:00.000Z",
          },
          {
            id: "9b958d42-21a0-4187-9ee4-101004080968",
            role: "assistant",
            text: "可以突出项目成果",
            sequence: 2,
            completionState: "stopped",
            runId: "62622b5d-ec93-43fb-925d-6b631703799b",
            createdAt: "2026-09-16T15:00:00.000Z",
          },
        ],
        proposals: [],
        activeRun: null,
      },
      edit,
    };

    render(
      <AiAssistantPanel
        open
        resumeId="resume-demo"
        resumeVersion={1}
        onApplyProposal={() => ({
          ok: true,
          appliedChangeIds: [],
          document: createDefaultResumeDocument(),
        })}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑消息" }));

    expect(edit).toHaveBeenCalledWith("62622b5d-ec93-43fb-925d-6b631703799b");
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(
          "例如：帮我把项目经历写得更具体，并突出可量化成果",
        ),
      ).toHaveValue("优化我的工作经历"),
    );
  });
});
