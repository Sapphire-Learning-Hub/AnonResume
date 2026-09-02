import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { requireSession } from "@/lib/auth-session";
import { listResumeEntries } from "@/lib/resume-repository";

import WorkbenchLayout from "@/app/app/(workbench)/layout";

vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/resume-repository", () => ({
  listResumeEntries: vi.fn(),
}));

vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign Out</button>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/fonts",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("FontMarketPage", () => {
  it("loads the signed-in user's resumes and renders the market", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-demo" },
      user: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
      },
    } as never);
    vi.mocked(listResumeEntries).mockResolvedValue([
      {
        id: "resume-foundation",
        title: "基础版简历",
        summary: "前端工程师简历",
        updatedAt: Date.UTC(2026, 7, 31, 8, 0, 0),
        version: 1,
        published: false,
      },
    ]);

    render(await WorkbenchLayout());

    expect(requireSession).toHaveBeenCalledOnce();
    expect(listResumeEntries).toHaveBeenCalledWith("user-demo");
    expect(screen.getByRole("heading", { name: "字体市场" })).toBeInTheDocument();
  });
});
