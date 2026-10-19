import { fireEvent, render, screen } from "@testing-library/react";
import { AiReviewReport } from "@/components/ai/review/AiReviewReport";
import type { ReviewDetails } from "@/lib/ai/review/validation";
import { reviewDimensions } from "@/domain/resume/ai/review/schema";

it("requires real facts for missing-content edits and passes selected issues to generation", () => {
  const onGenerate = vi.fn();
  const details: ReviewDetails = {
    id: "00000000-0000-4000-8000-000000000001", runId: "00000000-0000-4000-8000-000000000002", input: { modelId: "00000000-0000-4000-8000-000000000003", resumeVersion: 1, locale: "zh-CN" }, modelName: "Fixture", createdAt: new Date().toISOString(), status: "complete", progress: [], failureCode: null, finalPoints: 0, stale: false, targets: [], ignoredIssueIds: [],
    report: { schemaVersion: 1, rubricVersion: 1, score: 75, summary: "内容清晰", dimensions: reviewDimensions.map((dimension) => ({ dimension, grade: 3, reason: "可以完善" })), strengths: [], match: null, issues: [{ id: "issue-1", dimension: "impact", severity: "suggestion", kind: "missing", title: "补充成果", explanation: "未描述结果", suggestion: "提供实际成果", evidence: [] }] },
  };
  render(<AiReviewReport details={details} busy={false} onGenerate={onGenerate} onIgnore={vi.fn()} onLocate={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "补充成果" }));
  expect(screen.getByRole("button", { name: "生成修改建议" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("补充事实（选填）"), { target: { value: "将每周手动整理时间减少两小时" } });
  fireEvent.click(screen.getByRole("button", { name: "生成修改建议" }));
  expect(onGenerate).toHaveBeenCalledWith(["issue-1"], "将每周手动整理时间减少两小时");
});
