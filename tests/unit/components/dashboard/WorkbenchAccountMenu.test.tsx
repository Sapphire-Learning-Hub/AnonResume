import { fireEvent, render, screen } from "@testing-library/react";

import {
  DEFAULT_PUBLIC_RUNTIME_CONFIG,
  PublicRuntimeConfigProvider,
} from "@/components/config/PublicRuntimeConfigProvider";

vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">退出登录</button>,
}));
vi.mock("@/components/dashboard/ManagementModeControl", () => ({
  ManagementModeControl: () => null,
}));
vi.mock("@/components/invitations/UserInvitationDialog", () => ({
  UserInvitationDialog: () => null,
}));
vi.mock("@/i18n/LocaleSwitcher", () => ({
  LocaleSwitcher: () => <button type="button">界面设置</button>,
}));

import { WorkbenchAccountMenu } from "@/components/dashboard/WorkbenchAccountMenu";

describe("WorkbenchAccountMenu", () => {
  it("links product users and delegated administrators to the account center", () => {
    render(
      <WorkbenchAccountMenu
        access={{
          mode: "product",
          productAccess: true,
          canEnterManagement: false,
          mfaEnrollmentRequired: false,
        }}
        collapsed={false}
        email="user@example.com"
        name="User"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "User user@example.com" }));
    expect(screen.getByRole("link", { name: "账号中心" })).toHaveAttribute(
      "href",
      "/app/account",
    );
    expect(screen.getByRole("link", { name: "帮助中心" })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(screen.getByRole("link", { name: "获取支持" })).toHaveAttribute(
      "href",
      "/docs/support",
    );
  });

  it("does not expose an account center to the management-only superadmin", () => {
    render(
      <WorkbenchAccountMenu
        access={{
          mode: "management",
          productAccess: false,
          kind: "super_admin",
          permissions: [],
        }}
        collapsed={false}
        email="admin@example.com"
        name="Admin"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Admin admin@example.com" }));
    expect(screen.queryByRole("link", { name: "账号中心" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "帮助中心" })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(screen.getByRole("link", { name: "获取支持" })).toHaveAttribute(
      "href",
      "/docs/support",
    );
  });

  it("opens a configured support destination externally", () => {
    render(
      <PublicRuntimeConfigProvider
        value={{
          ...DEFAULT_PUBLIC_RUNTIME_CONFIG,
          supportUrl: "https://support.example.com/tickets",
        }}
      >
        <WorkbenchAccountMenu
          access={{
            mode: "product",
            productAccess: true,
            canEnterManagement: false,
            mfaEnrollmentRequired: false,
          }}
          collapsed={false}
          email="user@example.com"
          name="User"
        />
      </PublicRuntimeConfigProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "User user@example.com" }));
    expect(screen.getByRole("link", { name: "获取支持" }))
      .toHaveAttribute("href", "https://support.example.com/tickets");
    expect(screen.getByRole("link", { name: "获取支持" }))
      .toHaveAttribute("target", "_blank");
  });
});
