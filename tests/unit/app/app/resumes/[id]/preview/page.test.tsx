import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { requireSession } from "@/lib/auth-session";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";
import ResumePreviewPage from "@/app/app/resumes/[id]/preview/page";

vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(),
}));

describe("ResumePreviewPage", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "foundation",
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
    expect(screen.getByText("基础版简历")).toBeInTheDocument();
    expect(screen.getByText("个人简介")).toBeInTheDocument();
    expect(
      screen.getByText("基于流式布局的结构化简历编辑基础能力"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回编辑器" })).toHaveAttribute(
      "href",
      "/app/resumes/resume-foundation",
    );
  });
});
