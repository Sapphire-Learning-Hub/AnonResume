import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ResumeOnboardingController } from "@/components/editor/onboarding/ResumeOnboardingController";
import { ONBOARDING_EDIT_BLOCK_ID, createEditorOnboardingDocument } from "@/domain/onboarding/editor-basics-document";
import type { EditorOnboardingRun } from "@/lib/onboarding/types";

const clientMocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("@/lib/onboarding/client", () => ({
  updateEditorOnboardingRunClient: clientMocks.update,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn() },
  }),
}));

function createRun(
  currentStep: EditorOnboardingRun["currentStep"],
  status: EditorOnboardingRun["status"] = "active",
): EditorOnboardingRun {
  return {
    id: "run-one",
    userId: "user-one",
    flowKey: "editor-basics",
    flowVersion: 1,
    source: "automatic",
    resumeId: "practice-one",
    status,
    currentStep,
    createdAt: 1,
    updatedAt: 1,
  };
}

function nextRun(
  run: EditorOnboardingRun,
  currentStep: EditorOnboardingRun["currentStep"],
  status: EditorOnboardingRun["status"] = "active",
) {
  return { ...run, currentStep, status, updatedAt: run.updatedAt + 1 };
}

function changedTextDocument() {
  const document = createEditorOnboardingDocument("zh-CN");
  const block = document.sections
    .flatMap(({ blocks }) => blocks)
    .find(({ id }) => id === ONBOARDING_EDIT_BLOCK_ID);
  if (!block || block.type !== "text") throw new Error("Missing edit target");
  block.content.content[0]!.content = [
    { type: "text", text: "前端平台工程师" },
  ];
  return document;
}

function addAnchor(anchorId: string, label = "target") {
  const element = document.createElement("button");
  element.textContent = label;
  element.dataset.onboardingAnchor = anchorId;
  element.scrollIntoView = vi.fn();
  document.body.append(element);
  return element;
}

describe("ResumeOnboardingController", () => {
  afterEach(() => {
    document.querySelectorAll("[data-onboarding-anchor]").forEach((node) => node.remove());
    clientMocks.update.mockReset();
  });

  it("waits for valid document evidence and a completed save", async () => {
    const run = createRun("edit-text");
    const target = addAnchor("onboarding-edit-target");
    const changed = changedTextDocument();
    clientMocks.update.mockResolvedValue(nextRun(run, "format-text"));

    const { rerender } = render(
      <ResumeOnboardingController
        document={changed}
        run={run}
        saveStatus="dirty"
        onSelectRibbonTab={vi.fn()}
      />,
    );
    await Promise.resolve();
    expect(clientMocks.update).not.toHaveBeenCalled();

    rerender(
      <ResumeOnboardingController
        document={changed}
        run={run}
        saveStatus="saved"
        onSelectRibbonTab={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(clientMocks.update).toHaveBeenCalledWith("run-one", {
        type: "complete-step",
        stepId: "edit-text",
      });
    });
    target.remove();
  });

  it("navigates to the real control without changing resume content", async () => {
    const run = createRun("insert-content");
    const document = createEditorOnboardingDocument("zh-CN");
    const before = structuredClone(document);
    const target = addAnchor("editor-insert-content");
    const onSelectRibbonTab = vi.fn();

    render(
      <ResumeOnboardingController
        document={document}
        run={run}
        saveStatus="saved"
        onSelectRibbonTab={onSelectRibbonTab}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "带我前往" }));
    expect(onSelectRibbonTab).toHaveBeenCalledWith("insert");
    await waitFor(() => expect(target.scrollIntoView).toHaveBeenCalled());
    expect(target).toHaveFocus();
    expect(document).toEqual(before);
  });

  it("shows recovery controls for a missing anchor", () => {
    const run = createRun("format-text");
    clientMocks.update.mockResolvedValue(nextRun(run, "insert-content"));

    render(
      <ResumeOnboardingController
        document={createEditorOnboardingDocument("zh-CN")}
        run={run}
        saveStatus="saved"
        onSelectRibbonTab={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "再试一次" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "跳过此步" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出练习" })).toBeInTheDocument();
  });

  it("restores prior focus after dismissing the guide", async () => {
    const returnTarget = document.createElement("button");
    returnTarget.textContent = "Return focus";
    document.body.append(returnTarget);
    returnTarget.focus();
    const run = createRun("canvas-intro");
    addAnchor("editor-canvas");
    clientMocks.update.mockResolvedValue({
      ...run,
      status: "dismissed",
      resumeId: undefined,
    });

    render(
      <ResumeOnboardingController
        document={createEditorOnboardingDocument("zh-CN")}
        run={run}
        saveStatus="saved"
        onSelectRibbonTab={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "退出练习" }));

    await waitFor(() => expect(returnTarget).toHaveFocus());
    returnTarget.remove();
  });
});
