import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { requireSession } from "@/lib/auth-session";
import { listResumeEntries } from "@/lib/resume-repository";

import WorkbenchLayout from "@/app/app/(workbench)/layout";
import { metadata as privateAppMetadata } from "@/app/app/layout";

vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/lib/resume-repository", () => ({
  listResumeEntries: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("WorkbenchLayout", () => {
  it("keeps a stable absolute browser title across private app routes", () => {
    expect(privateAppMetadata.title).toEqual({ absolute: "AnonResume" });
  });

  it("owns the persistent workbench chrome around route content", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-demo" },
      user: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
      },
    } as never);
    vi.mocked(listResumeEntries).mockResolvedValue([]);

    render(await WorkbenchLayout());

    expect(requireSession).toHaveBeenCalledOnce();
    expect(listResumeEntries).toHaveBeenCalledWith("user-demo");
    expect(screen.getByRole("heading", { name: "简历" })).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/brand/anonresume-lockup.png"]'),
    ).toHaveAttribute("alt", "AnonResume");
    expect(screen.getByRole("navigation", { name: "工作台导航" })).toBeInTheDocument();
    expect(screen.getByText(/当前登录：/)).toHaveTextContent(
      "当前登录：Demo User · demo@example.com",
    );
  });
});
