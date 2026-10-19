import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiReviewPanel } from "@/components/ai/review/AiReviewPanel";
import { AiClientError, fetchAiConversationIndex, streamAiRun } from "@/lib/ai/client";
import { listResumeReviews, startResumeReview, getResumeReview } from "@/lib/ai/review/client";

const feedback = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/components/ui/useAppFeedback", () => ({ useAppFeedback: () => ({ notification: feedback }) }));
vi.mock("@/lib/ai/client", async (original) => ({ ...await original<typeof import("@/lib/ai/client")>(), fetchAiConversationIndex: vi.fn(), streamAiRun: vi.fn() }));
vi.mock("@/lib/ai/review/client", async (original) => ({ ...await original<typeof import("@/lib/ai/review/client")>(), listResumeReviews: vi.fn(), startResumeReview: vi.fn(), getResumeReview: vi.fn() }));

beforeEach(() => {
  vi.mocked(listResumeReviews).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(fetchAiConversationIndex).mockResolvedValue({ enabled: true, conversations: [], models: [{
    id: "00000000-0000-4000-8000-000000000001", displayName: "Model", providerModelKey: "model",
    supportsToolCalls: true, supportsStreaming: true, maxOutputTokens: 4096, keySource: "platform", providerName: "Provider",
  }] });
  vi.mocked(startResumeReview).mockReset();
  vi.mocked(streamAiRun).mockReset();
  feedback.error.mockReset();
});

it("shows retry progress and a persisted timeout reason, then safely falls back for unknown diagnostic codes", async () => {
  const id = "00000000-0000-4000-8000-000000000002";
  const input = { modelId: "00000000-0000-4000-8000-000000000001", resumeVersion: 1, locale: "zh-CN" as const };
  const details = { id, runId: id, input, modelName: "Test model", createdAt: "2026-10-19T00:00:00Z", status: "failed" as const, report: null, progress: [], failureCode: "timeout", finalPoints: null, stale: false, targets: [], ignoredIssueIds: [] };
  vi.mocked(listResumeReviews).mockResolvedValue({ items: [{ ...details, status: "streaming", score: null }], nextCursor: null });
  vi.mocked(getResumeReview).mockResolvedValue(details).mockResolvedValueOnce({ ...details, status: "streaming", failureCode: null });
  let finishStream!: () => void;
  vi.mocked(streamAiRun).mockImplementationOnce(async ({ onEvent }) => {
    onEvent({ type: "progress", sequence: 1, stage: "retrying_upstream" });
    await new Promise<void>((resolve) => { finishStream = resolve; });
    throw new AiClientError("timeout", 400);
  });
  render(<AiReviewPanel resumeId="resume" resumeVersion={1} onClose={vi.fn()} onEnsureSaved={vi.fn()} onLocate={vi.fn()} onOpenSuggestions={vi.fn()} />);
  fireEvent.click(screen.getByText("历史报告"));
  expect(await screen.findByText("上游响应超时，正在重试")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "停止审查" })).toBeEnabled();
  await act(async () => finishStream());
  expect(await screen.findByText("上游 AI 服务响应超时，审查未能完成，请稍后重新发起。")).toBeInTheDocument();
  vi.mocked(getResumeReview).mockResolvedValue({ ...details, failureCode: "private upstream sk-secret" });
  fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
  expect(await screen.findByText("审查未完成")).toBeInTheDocument();
  expect(screen.queryByText(/private upstream/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("新审查"));
  expect(await screen.findByRole("button", { name: "发起审查" })).toBeEnabled();
});

it("preserves review input after a failed save and submits the successfully saved version only once", async () => {
  const ensureSaved = vi.fn<() => Promise<{ resumeVersion: number } | null>>().mockResolvedValueOnce(null);
  render(<AiReviewPanel resumeId="resume" resumeVersion={1} onClose={vi.fn()} onEnsureSaved={ensureSaved} onLocate={vi.fn()} onOpenSuggestions={vi.fn()} />);
  const start = await screen.findByRole("button", { name: "发起审查" });
  await waitFor(() => expect(start).toBeEnabled());
  fireEvent.change(screen.getByLabelText("目标岗位（选填）"), { target: { value: "工程师" } });
  fireEvent.click(start);
  await waitFor(() => expect(feedback.error).toHaveBeenCalled());
  expect(startResumeReview).not.toHaveBeenCalled();
  expect(screen.getByLabelText("目标岗位（选填）")).toHaveValue("工程师");
  await waitFor(() => expect(screen.getByLabelText("目标岗位（选填）")).toBeEnabled());
  let resolveSave!: (value: { resumeVersion: number }) => void;
  ensureSaved.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
  vi.mocked(startResumeReview).mockRejectedValueOnce(new Error("external boundary failure"));
  fireEvent.click(start);
  fireEvent.click(start);
  await waitFor(() => expect(ensureSaved).toHaveBeenCalledTimes(2));
  await act(async () => resolveSave({ resumeVersion: 7 }));
  await waitFor(() => expect(startResumeReview).toHaveBeenCalledTimes(1));
  expect(startResumeReview).toHaveBeenCalledWith("resume", expect.objectContaining({ resumeVersion: 7, targetRole: "工程师" }));
});

it("keeps historical reports readable when the model index is unavailable", async () => {
  const id = "00000000-0000-4000-8000-000000000002";
  const input = { modelId: "00000000-0000-4000-8000-000000000001", resumeVersion: 1, locale: "zh-CN" as const };
  vi.mocked(fetchAiConversationIndex).mockRejectedValueOnce(new Error("unavailable"));
  vi.mocked(listResumeReviews).mockResolvedValueOnce({ items: [{ id, runId: id, input, modelName: "Historical model", createdAt: "2026-10-19T00:00:00Z", status: "stopped", score: null }], nextCursor: null });
  vi.mocked(getResumeReview).mockResolvedValueOnce({ id, runId: id, input, modelName: "Historical model", createdAt: "2026-10-19T00:00:00Z", status: "stopped", report: null, progress: [], failureCode: null, finalPoints: 0, stale: false, targets: [], ignoredIssueIds: [] });
  render(<AiReviewPanel resumeId="resume" resumeVersion={1} onClose={vi.fn()} onEnsureSaved={vi.fn()} onLocate={vi.fn()} onOpenSuggestions={vi.fn()} />);
  fireEvent.click(screen.getByText("历史报告"));
  const selector = screen.getByRole("combobox", { name: "选择审查记录" });
  await waitFor(() => expect(selector).toBeEnabled());
  fireEvent.mouseDown(selector);
  fireEvent.click(await screen.findByText(/2026.*审查已停止/));
  expect(await screen.findByText("Historical model")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /删\s*除/ })).toBeEnabled();
});
