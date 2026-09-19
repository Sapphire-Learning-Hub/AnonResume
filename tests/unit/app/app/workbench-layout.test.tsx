import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { requireAppShellContext } from "@/lib/auth/app-shell-context";

import WorkbenchLayout from "@/app/app/(workbench)/layout";

vi.mock("@/lib/auth/app-shell-context", () => ({
  requireAppShellContext: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("WorkbenchLayout", () => {
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
    expect(screen.getByRole("navigation", { name: "工作台导航" })).toBeInTheDocument();
  });
});
