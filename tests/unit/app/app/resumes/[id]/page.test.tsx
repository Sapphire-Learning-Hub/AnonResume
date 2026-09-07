import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/auth-session";
import {
  createGeneratedResumeRecord,
  publishResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";

import ResumeEditorPage from "@/app/app/resumes/[id]/page";

vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(),
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
  };
});

describe("ResumeEditorPage", () => {
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

  it("renders the editor route with the shared shell for an existing resume", async () => {
    await publishResumeRecord("user-demo", "resume-foundation");

    const page = await ResumeEditorPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(screen.getByTestId("editor-viewport-guard")).toBeInTheDocument();
    expect(screen.getByText("画布")).toBeInTheDocument();
    expect(within(screen.getByRole("article")).getByText("个人简介")).toBeInTheDocument();
  });

  it("loads published resume metadata into the editor shell", async () => {
    await publishResumeRecord("user-demo", "resume-foundation");

    const page = await ResumeEditorPage({
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    render(page);

    expect(screen.getByRole("textbox", { name: "简历标题" })).toHaveValue("基础版简历");
    fireEvent.click(screen.getByRole("tab", { name: "文档" }));
    expect(screen.getByRole("link", { name: /打\s*开\s*公\s*开\s*页/ })).toHaveAttribute(
      "href",
      "/resume/resume-foundation",
    );
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
