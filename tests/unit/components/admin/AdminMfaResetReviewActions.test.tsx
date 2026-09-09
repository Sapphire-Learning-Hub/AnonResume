import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: feedbackMocks }),
}));
vi.mock("@/components/admin/AdminOtpInput", () => ({
  AdminOtpInput: ({ onChange }: { onChange: (value: string) => void }) => (
    <button onClick={() => onChange("123456")} type="button">
      填写验证码
    </button>
  ),
}));

import { AdminMfaResetReviewActions } from "@/components/admin/AdminMfaResetReviewActions";

describe("AdminMfaResetReviewActions", () => {
  beforeEach(() => vi.clearAllMocks());

  const pendingRequest = {
    expiresAt: "2026/9/12 17:27:20",
    reason: "手机遗失，恢复码也无法找回。",
    requestId: "request-1",
    requestedAt: "2026/9/9 17:27:20",
    requesterEmail: "user@example.com",
    requesterName: "User",
    status: "pending" as const,
    statusLabel: "待审批",
  };

  it("reauthenticates before retrying an approval", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "mfa_reauthentication_required" }), {
          status: 428,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request: { status: "approved" } }), {
          status: 200,
        }),
      );

    render(<AdminMfaResetReviewActions {...pendingRequest} />);

    expect(screen.queryByText(pendingRequest.reason)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "批准" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    const details = screen.getByRole("dialog", { name: "MFA 重置申请详情" });
    expect(within(details).getByText(pendingRequest.reason)).toBeInTheDocument();
    expect(within(details).getByText(pendingRequest.requesterEmail)).toBeInTheDocument();

    fireEvent.click(
      within(details).getByRole("button", { name: /^批\s*准$/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认批准" }));
    await screen.findByText("再次验证管理身份");

    fireEvent.click(screen.getByRole("button", { name: "填写验证码" }));
    fireEvent.click(screen.getByRole("button", { name: /^验\s*证$/ }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        2,
        "/api/manage/session/reauth",
        expect.objectContaining({ method: "POST" }),
      );
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        3,
        "/api/manage/mfa-reset-requests/request-1",
        expect.objectContaining({ method: "PATCH" }),
      );
      expect(routerMocks.refresh).toHaveBeenCalled();
    });
  });

  it("shows reviewed request details without approval controls", () => {
    render(
      <AdminMfaResetReviewActions
        {...pendingRequest}
        reviewReason="身份已线下核验"
        status="approved"
        statusLabel="已批准"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "详情" }));
    const details = screen.getByRole("dialog", { name: "MFA 重置申请详情" });

    expect(within(details).getByText("身份已线下核验")).toBeInTheDocument();
    expect(
      within(details).queryByRole("button", { name: /^批\s*准$/ }),
    ).toBeNull();
    expect(
      within(details).queryByRole("button", { name: /^驳\s*回$/ }),
    ).toBeNull();
  });
});
