import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getEditorOnboardingRunForResume } from "@/lib/onboarding/repository";
import type { EditorOnboardingRun } from "@/lib/onboarding/types";
import {
  createGeneratedResumeRecord,
  publishResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

import ResumeEditorPage from "@/app/app/resumes/[id]/page";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/onboarding/repository", () => ({
  getEditorOnboardingRunForResume: vi.fn(),
}));

vi.mock("@/components/editor/onboarding/ResumeOnboardingController", () => ({
  ResumeOnboardingController: ({ run }: { run: EditorOnboardingRun }) => (
    <div data-testid="resume-onboarding-controller">{run.currentStep}</div>
  ),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: {
      destroy: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    toast: { error: vi.fn() },
  }),
}));

vi.mock("@/components/editor/EditorViewportGuard", () => ({
  EditorViewportGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="editor-viewport-guard">{children}</div>
  ),
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>(
    "next/navigation",
  );

  return {
    ...actual,
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    useRouter: () => ({
      push: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

describe("ResumeEditorPage", () => {
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
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("renders the editor route with the shared shell for an existing resume", async () => {
    await publishResumeRecord("user-demo", "resume-foundation");

    const page = await ResumeEditorPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(screen.getByTestId("editor-viewport-guard")).toBeInTheDocument();
    expect(screen.getByText("画布")).toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("林知夏")).toBeInTheDocument();
  });

  it("loads published resume metadata into the editor shell", async () => {
    await publishResumeRecord("user-demo", "resume-foundation");

    const page = await ResumeEditorPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue("居中叙事简历");
    fireEvent.click(screen.getByRole("button", { name: "更多公开页操作" }));
    expect(await screen.findByRole("link", { name: "打开公开页" })).toHaveAttribute(
      "href",
      "/resume/resume-foundation",
    );
  });

  it("loads the owner-scoped onboarding run for a practice resume", async () => {
    vi.mocked(getEditorOnboardingRunForResume).mockResolvedValue({
      id: "run-demo",
      userId: "user-demo",
      flowKey: "editor-basics",
      flowVersion: 1,
      source: "manual",
      resumeId: "resume-foundation",
      status: "active",
      currentStep: "canvas-intro",
      createdAt: 1,
      updatedAt: 1,
    });

    const page = await ResumeEditorPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(getEditorOnboardingRunForResume).toHaveBeenCalledWith(
      "user-demo",
      "resume-foundation",
    );
    expect(screen.getByTestId("resume-onboarding-controller")).toHaveTextContent(
      "canvas-intro",
    );
  });

  it("does not mount onboarding for a standard resume", async () => {
    const page = await ResumeEditorPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(
      screen.queryByTestId("resume-onboarding-controller"),
    ).not.toBeInTheDocument();
  });

  it("returns not found for a missing resume id", async () => {
    await expect(
      ResumeEditorPage({
        params: Promise.resolve({ id: "resume-missing" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
