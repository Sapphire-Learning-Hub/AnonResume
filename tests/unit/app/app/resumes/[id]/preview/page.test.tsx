import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { requireSession } from "@/lib/auth/session";
import { getEditorOnboardingRunForResume } from "@/lib/onboarding/repository";
import { markEditorOnboardingPreviewVisited } from "@/lib/onboarding/service";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";
import ResumePreviewPage from "@/app/app/resumes/[id]/preview/page";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/onboarding/repository", () => ({
  getEditorOnboardingRunForResume: vi.fn(),
}));

vi.mock("@/lib/onboarding/service", () => ({
  markEditorOnboardingPreviewVisited: vi.fn(),
}));

describe("ResumePreviewPage", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    vi.mocked(requireSession).mockResolvedValue({
      session: {
        id: "session-demo",
        userId: "user-demo",
      },
      user: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
      },
    } as never);
    vi.mocked(getEditorOnboardingRunForResume).mockResolvedValue(undefined);
    vi.mocked(markEditorOnboardingPreviewVisited).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("renders the shared resume renderer in preview mode for a known resume", async () => {
    const page = await ResumePreviewPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(screen.getByText("预览")).toBeInTheDocument();
    const header = screen.getByRole("region", { name: "居中叙事简历" });
    expect(header).toContainElement(
      screen.getByRole("heading", { level: 1, name: "居中叙事简历" }),
    );
    expect(screen.getByText("林知夏")).toBeInTheDocument();
    expect(screen.getByText("品牌策划与内容创意")).toBeInTheDocument();
    expect(header).toContainElement(
      screen.getByRole("link", { name: "返回编辑器" }),
    );
    expect(screen.getByRole("link", { name: "返回编辑器" })).toHaveAttribute(
      "href",
      "/app/resumes/resume-foundation",
    );
    expect(markEditorOnboardingPreviewVisited).not.toHaveBeenCalled();
  });

  it("marks a practice preview and provides a practice-specific return label", async () => {
    vi.mocked(getEditorOnboardingRunForResume).mockResolvedValue({
      id: "run-demo",
      userId: "user-demo",
      flowKey: "editor-basics",
      flowVersion: 1,
      source: "manual",
      resumeId: "resume-foundation",
      status: "active",
      currentStep: "preview",
      createdAt: 1,
      updatedAt: 1,
    });

    const page = await ResumePreviewPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(markEditorOnboardingPreviewVisited).toHaveBeenCalledWith({
      userId: "user-demo",
      resumeId: "resume-foundation",
    });
    expect(screen.getByText("练习预览")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回练习" })).toHaveAttribute(
      "href",
      "/app/resumes/resume-foundation",
    );
  });
});
