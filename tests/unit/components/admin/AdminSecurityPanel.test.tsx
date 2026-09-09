import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));
const feedbackMocks = vi.hoisted(() => ({
  notificationDestroy: vi.fn(),
  notificationWarning: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({
    notification: {
      destroy: feedbackMocks.notificationDestroy,
      warning: feedbackMocks.notificationWarning,
    },
    toast: {
      error: feedbackMocks.toastError,
      success: feedbackMocks.toastSuccess,
    },
  }),
}));

vi.mock("@/components/admin/AdminMfaEnrollmentContent", () => ({
  AdminMfaEnrollmentContent: ({
    onCodeChange,
  }: {
    onCodeChange: (code: string) => void;
  }) => (
    <button onClick={() => onCodeChange("123456")} type="button">
      填写验证码
    </button>
  ),
}));

import {
  AdminSecurityPanel,
  getAdminSecurityResponseAction,
} from "@/components/admin/AdminSecurityPanel";

describe("AdminSecurityPanel response handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        matches: false,
        media: query,
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("returns to management verification when the recovery session expires", () => {
    expect(getAdminSecurityResponseAction(401, "unauthorized")).toBe("verify");
  });

  it("only opens the TOTP reauthentication dialog for a freshness challenge", () => {
    expect(getAdminSecurityResponseAction(428)).toBe("reauthenticate");
    expect(getAdminSecurityResponseAction(401, "invalid_code")).toBe("error");
    expect(getAdminSecurityResponseAction(500)).toBe("error");
  });

  it("offers download and print after rebinding MFA with a recovery session", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            deviceId: "device-new",
            secret: "NEWDEVICESECRET",
            uri: "otpauth://totp/AnonResume:user%40example.com?secret=NEWDEVICESECRET",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            recoveryCodes: ["AAAA-BBBB-CCCC-DDDD-EEEE"],
          }),
          { status: 200 },
        ),
      );

    render(
      <AdminSecurityPanel
        devices={[]}
        email="user@example.com"
        recoveryCodesRemaining={0}
        recoveryRequired
      />,
    );

    expect(feedbackMocks.notificationWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: false,
        key: "management-recovery-required",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "添加 MFA 设备" }));
    fireEvent.change(screen.getByPlaceholderText("设备名称"), {
      target: { value: "新验证器" },
    });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await screen.findByRole("button", { name: "填写验证码" });
    fireEvent.click(screen.getByRole("button", { name: "填写验证码" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "下载恢复码" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "打印恢复码" }),
      ).toBeInTheDocument();
    });
  });

  it("keeps management mode active after removing an MFA device", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    render(
      <AdminSecurityPanel
        devices={[
          {
            id: "device-1",
            name: "主验证器",
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            lastUsedAt: null,
          },
          {
            id: "device-2",
            name: "备用验证器",
            createdAt: new Date("2026-09-02T00:00:00.000Z"),
            lastUsedAt: null,
          },
        ]}
        email="user@example.com"
        recoveryCodesRemaining={10}
        recoveryRequired={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "移除" })[0]!);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "移除 MFA 设备" });
    expect(within(dialog).getByText(/主验证器/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认移除" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/manage/security/mfa/device-1",
        { method: "DELETE" },
      );
      expect(routerMocks.refresh).toHaveBeenCalled();
    });
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });
});
