import { getAiProposalStreamProgress } from "@/lib/ai/proposals/stream-progress";

describe("AI proposal stream progress", () => {
  it("decodes a partial summary before the JSON value is complete", () => {
    expect(
      getAiProposalStreamProgress(
        '{"summary":"突出项目成果\\n并保留已有事实',
      ),
    ).toEqual({
      summary: "突出项目成果\n并保留已有事实",
      completedChanges: 0,
    });
  });

  it("counts only fully streamed change objects", () => {
    expect(
      getAiProposalStreamProgress(
        '{"summary":"优化经历","changes":[{"id":"one","content":{"type":"doc"}},{"id":"two"',
      ),
    ).toEqual({
      summary: "优化经历",
      completedChanges: 1,
    });
  });
});
