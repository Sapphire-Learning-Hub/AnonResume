import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: feedbackMocks }),
}));

import { AdminMfaResetRequestControl } from "@/components/admin/AdminMfaResetRequestControl";

describe("AdminMfaResetRequestControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a required recovery reason from the management challenge", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ request: { id: "request-1", status: "pending" } }),
          { status: 201 },
        ),
      );

    render(<AdminMfaResetRequestControl onClose={vi.fn()} open />);
    await screen.findByText("申请重置管理 MFA");
    fireEvent.change(screen.getByPlaceholderText("说明设备与恢复码丢失的情况"), {
      target: { value: "手机遗失，离线保存的恢复码也无法找回。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交申请" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        "/api/account/management-mfa-reset",
        expect.objectContaining({ method: "POST" }),
      );
      expect(feedbackMocks.success).toHaveBeenCalled();
    });
  });

  it("shows and cancels an existing pending request", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request: {
              id: "5b67ea55-1fe3-4f7d-9a0c-f1271144071f",
              reason: "手机遗失，恢复码也无法找回。",
              status: "pending",
              expiresAt: "2026-09-12T00:00:00.000Z",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    render(<AdminMfaResetRequestControl onClose={vi.fn()} open />);
    await screen.findByText("等待超级管理员审批");
    fireEvent.click(screen.getByRole("button", { name: "取消申请" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenLastCalledWith(
        "/api/account/management-mfa-reset",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
