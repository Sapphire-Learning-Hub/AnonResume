import { render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

import { requireAppShellContext } from "@/lib/auth/app-shell-context";
import { getRuntimeConfig } from "@/lib/config/runtime";

import WorkbenchLayout from "@/app/app/(workbench)/layout";

vi.mock("@/lib/auth/app-shell-context", () => ({
  requireAppShellContext: vi.fn(),
}));

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("WorkbenchLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRuntimeConfig).mockResolvedValue({
      health: "healthy",
    } as never);
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
    expect(screen.getByRole("navigation", { name: "工作台导航" })).toBeInTheDocument();
  });

  it("only exposes the user fields required by the client shell", async () => {
    vi.mocked(requireAppShellContext).mockResolvedValue({
      access: {
        canEnterManagement: false,
        mfaEnrollmentRequired: false,
        mode: "product",
        productAccess: true,
      },
      user: {
        id: "user-private-id",
        name: "Demo User",
        email: "demo@example.com",
        emailVerified: true,
        image: "https://example.com/private-avatar.png",
      },
    } as never);

    const result = await WorkbenchLayout({
      children: <h1>Route content</h1>,
    });

    expect(result.props.user).toEqual({
      name: "Demo User",
      email: "demo@example.com",
    });
  });

  it("passes restart requirements to an active delegated management session", async () => {
    vi.mocked(requireAppShellContext).mockResolvedValue({
      access: {
        kind: "delegated_admin",
        mode: "management",
        permissions: ["system.read"],
        productAccess: true,
      },
      user: {
        id: "admin-demo",
        name: "Admin User",
        email: "admin@example.com",
      },
    } as never);
    vi.mocked(getRuntimeConfig).mockResolvedValue({
      health: "restart_required",
    } as never);

    render(
      await WorkbenchLayout({
        children: <h1>Management content</h1>,
      }),
    );

    expect(screen.getByText("部分配置等待重启生效")).toBeInTheDocument();
  });
});
