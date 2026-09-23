import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { UserInvitationManager } from "@/components/invitations/UserInvitationManager";

const feedback = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: feedback }),
}));

describe("UserInvitationManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "processed" }), { status: 202 }),
    ));
  });

  it("shows usage and sends only the entered email", async () => {
    const onChange = vi.fn();
    render(<UserInvitationManager onChange={onChange} initialData={{
      activeCount: 2,
      limit: 5,
      now: "2026-09-24T00:00:00.000Z",
      items: [],
    }} />);

    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("受邀邮箱"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送邀请" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.com" }),
      }),
    ));
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce());
  });

  it("offers actions only while an invitation remains actionable", () => {
    render(<UserInvitationManager onChange={vi.fn()} initialData={{
      activeCount: 1,
      limit: 5,
      now: "2026-09-24T00:00:00.000Z",
      items: [
        {
          id: "pending",
          email: "pending@example.com",
          status: "pending",
          createdAt: "2026-09-01T00:00:00.000Z",
          lastSentAt: "2026-09-01T00:00:00.000Z",
          expiresAt: "2099-10-01T00:00:00.000Z",
          nextResendAt: "2026-09-06T00:00:00.000Z",
        },
        {
          id: "accepted",
          email: "accepted@example.com",
          status: "accepted",
          createdAt: "2026-09-01T00:00:00.000Z",
          lastSentAt: "2026-09-01T00:00:00.000Z",
          expiresAt: "2026-09-08T00:00:00.000Z",
          nextResendAt: "2026-09-06T00:00:00.000Z",
        },
      ],
    }} />);

    expect(screen.getByRole("button", { name: "重新发送" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument();
    expect(screen.getByText("已接受")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "重新发送" })).toHaveLength(1);
  });
});
