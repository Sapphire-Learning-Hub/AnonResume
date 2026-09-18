import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { applySelectedAiChanges } from "@/domain/resume/ai/proposal-apply";
import { createAiProposalWorkspace } from "@/lib/ai/tools/proposal-workspace";

describe("AI proposal workspace", () => {
  it("stages a resume skeleton and submits a valid atomic proposal", () => {
    const document = createDefaultResumeDocument("zh-CN");
    let id = 0;
    const workspace = createAiProposalWorkspace({
      document,
      createId: (prefix) => `${prefix}-${++id}`,
    });

    expect(
      workspace.execute("stage_section_changes", {
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
              {
                type: "list",
                items: ["[填写核心职责与成果]"],
              },
            ],
            reason: "创建工作经历骨架",
          },
        ],
      }),
    ).toMatchObject({ ok: true, stagedChanges: 1 });

    const submitted = workspace.execute("submit_resume_proposal", {
      summary: "已起草一份可填写的简历骨架",
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || !submitted.proposal) return;
    expect(submitted.proposal.changes).toHaveLength(1);

    const applied = applySelectedAiChanges({
      document,
      currentVersion: 1,
      baseResumeVersion: 1,
      proposal: submitted.proposal,
      selectedChangeIds: submitted.proposal.changes.map((change) => change.id),
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.document.sections.at(-1)).toMatchObject({
      semantic: "experience",
      blocks: [{ type: "row" }, { type: "list" }],
    });
  });

  it("rejects visual styles and unknown structural fields", () => {
    const workspace = createAiProposalWorkspace({
      document: createDefaultResumeDocument("zh-CN"),
    });

    expect(
      workspace.execute("stage_block_changes", {
        operations: [
          {
            type: "insert",
            sectionId: "section-profile",
            block: {
              type: "text",
              text: "内容",
              style: { color: "#ff0000" },
            },
            reason: "尝试修改样式",
          },
        ],
      }),
    ).toEqual({ ok: false, error: "invalid_arguments" });
  });

  it("reports missing targets without staging a partial change", () => {
    const workspace = createAiProposalWorkspace({
      document: createDefaultResumeDocument("zh-CN"),
    });

    expect(
      workspace.execute("stage_section_changes", {
        operations: [
          {
            type: "delete",
            sectionId: "missing-section",
            reason: "删除章节",
          },
        ],
      }),
    ).toEqual({ ok: false, error: "target_missing" });
    expect(workspace.execute("submit_resume_proposal", { summary: "空" })).toEqual(
      { ok: false, error: "proposal_empty" },
    );
  });
});
