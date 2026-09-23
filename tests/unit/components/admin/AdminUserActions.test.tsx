import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    toast: { error: vi.fn(), success: vi.fn() },
  }),
}));

import { AdminUserActions } from "@/components/admin/AdminUserActions";

describe("AdminUserActions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms before revoking all user sessions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    render(
      <AdminUserActions
        canResendInvitation={false}
        canRevokeSessions
        canSuspend={false}
        suspended={false}
        userId="user-1"
        userName="Alice"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "撤销会话" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "撤销用户会话" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认撤销" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/users/user-1/sessions",
        { method: "DELETE" },
      );
    });
  });

  it("confirms before resending a pending invitation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    render(
      <AdminUserActions
        canResendInvitation
        canRevokeSessions={false}
        canSuspend={false}
        suspended={false}
        userId="user-2"
        userName="Bob"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重发邀请" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "重发邀请邮件" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认重发" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/manage/users/user-2/invitation",
        { method: "POST" },
      );
    });
  });
});
