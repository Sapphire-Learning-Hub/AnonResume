import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { requireAppShellContext } from "@/lib/auth/app-shell-context";

import WorkbenchLayout from "@/app/app/(workbench)/layout";
import { metadata as privateAppMetadata } from "@/app/app/layout";

vi.mock("@/lib/auth/app-shell-context", () => ({
  requireAppShellContext: vi.fn(),
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
    vi.mocked(requireAppShellContext).mockResolvedValue({
      access: {
        canEnterManagement: false,
        mfaEnrollmentRequired: false,
        mode: "product",
        productAccess: true,
      },
      user: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
      },
    } as never);

    render(
      await WorkbenchLayout({
        children: <h1>Route content</h1>,
      }),
    );

    expect(requireAppShellContext).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Route content" })).toBeInTheDocument();
    expect(
      document.querySelector('img[src="/brand/anonresume-lockup.png"]'),
    ).toHaveAttribute("alt", "AnonResume");
    expect(
      document.querySelector('img[src="/brand/anonresume-lockup.png"]'),
    ).toHaveAttribute("loading", "eager");
    expect(screen.getByRole("navigation", { name: "工作台导航" })).toBeInTheDocument();
    expect(screen.getByText(/当前登录：/)).toHaveTextContent(
      "当前登录：Demo User · demo@example.com",
    );
  });
});
