import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

import { ManagementModeControl } from "@/components/dashboard/ManagementModeControl";

describe("ManagementModeControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a management MFA challenge and supports recovery codes", () => {
    render(<ManagementModeControl state="available" />);

    fireEvent.click(screen.getByRole("button", { name: "进入管理模式" }));

    expect(screen.getByText("验证管理身份")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);

    fireEvent.click(
      screen.getByRole("button", { name: "使用一次性恢复码" }),
    );

    expect(
      screen.getByPlaceholderText("XXXX-XXXX-XXXX-XXXX-XXXX"),
    ).toBeInTheDocument();
  });

  it("starts MFA enrollment instead of requesting an unavailable code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          deviceId: "device-first",
          secret: "FIRSTDEVICESECRET",
          uri: "otpauth://totp/AnonResume:user%40example.com?secret=FIRSTDEVICESECRET",
        }),
        { status: 200 },
      ),
    );
    render(
      <ManagementModeControl
        email="user@example.com"
        enrollmentRequired
        state="available"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "进入管理模式" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/manage/session",
        expect.objectContaining({
          body: expect.stringContaining('"action":"begin_enrollment"'),
          method: "POST",
        }),
      );
      expect(screen.getByText("绑定虚拟 MFA 设备")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "扫描二维码" })).toBeInTheDocument();
    });
  });

  it("shows first-time recovery codes before entering management mode", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            deviceId: "device-first",
            secret: "FIRSTDEVICESECRET",
            uri: "otpauth://totp/AnonResume:user%40example.com?secret=FIRSTDEVICESECRET",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            recoveryCodes: ["AAAA-BBBB-CCCC-DDDD-EEEE"],
          }),
          { status: 200 },
        ),
      );
    render(
      <ManagementModeControl
        email="user@example.com"
        enrollmentRequired
        state="available"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "进入管理模式" }));
    await screen.findAllByRole("textbox");
    fireEvent.submit(
      screen.getByRole("button", { name: "完成激活" }).closest("form")!,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        "/api/manage/session",
        expect.objectContaining({
          body: expect.stringContaining('"action":"complete_enrollment"'),
          method: "POST",
        }),
      );
      expect(screen.getByText("AAAA-BBBB-CCCC-DDDD-EEEE")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "进入管理中台" }));
    expect(routerMocks.replace).toHaveBeenCalledWith("/app/manage");
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("enters management mode after successful verification", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, recoveryRequired: false }), {
        status: 200,
      }),
    );
    render(<ManagementModeControl state="available" />);

    fireEvent.click(screen.getByRole("button", { name: "进入管理模式" }));
    fireEvent.click(
      screen.getByRole("button", { name: "使用一次性恢复码" }),
    );
    fireEvent.change(
      screen.getByPlaceholderText("XXXX-XXXX-XXXX-XXXX-XXXX"),
      {
        target: { value: "AAAA-BBBB-CCCC-DDDD-EEEE" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "进入管理中台" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/manage/session",
        expect.objectContaining({ method: "POST" }),
      );
      expect(routerMocks.replace).toHaveBeenCalledWith("/app/manage");
      expect(routerMocks.refresh).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("dialog")).toHaveClass("ant-zoom-leave");
  });

  it("exits management mode without signing out of the product", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<ManagementModeControl state="active" />);

    fireEvent.click(screen.getByRole("button", { name: "退出管理模式" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/manage/session",
        { method: "DELETE" },
      );
      expect(routerMocks.replace).toHaveBeenCalledWith("/app");
      expect(routerMocks.refresh).toHaveBeenCalledOnce();
    });
  });
});
