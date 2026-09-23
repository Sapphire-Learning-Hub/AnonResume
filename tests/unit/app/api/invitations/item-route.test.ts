const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  sendInvitation: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: mocks.getSession,
}));

vi.mock("@/lib/invitations/service", () => ({
  resendUserInvitation: mocks.resendInvitation,
  revokeUserInvitation: mocks.revokeInvitation,
}));

vi.mock("@/lib/runtime/email", () => ({
  sendProductInvitationEmail: mocks.sendInvitation,
}));

import { DELETE } from "@/app/api/invitations/[id]/route";
import { POST } from "@/app/api/invitations/[id]/resend/route";
import {
  InvitationNotActionableError,
  InvitationResendTooSoonError,
} from "@/lib/invitations/errors";

describe("product invitation item routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", name: "Current user", email: "me@example.com" },
    });
    mocks.resendInvitation.mockResolvedValue({ outcome: "sent" });
    mocks.revokeInvitation.mockResolvedValue(undefined);
  });

  it("resends only the current user's invitation", async () => {
    const response = await POST(
      new Request("http://localhost/api/invitations/invite-1/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "invite-1" }) },
    );

    expect(response.status).toBe(202);
    expect(mocks.resendInvitation).toHaveBeenCalledWith({
      inviterUserId: "user-1",
      invitationId: "invite-1",
      inviterName: "Current user",
      deliverInvitation: mocks.sendInvitation,
    });
  });

  it("returns the next resend time for cooldown errors", async () => {
    mocks.resendInvitation.mockRejectedValue(
      new InvitationResendTooSoonError(new Date("2026-09-30T00:00:00.000Z")),
    );

    const response = await POST(
      new Request("http://localhost/api/invitations/invite-1/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "invite-1" }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "INVITATION_RESEND_TOO_SOON",
      nextAllowedAt: "2026-09-30T00:00:00.000Z",
    });
  });

  it("revokes only the current user's invitation", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/invitations/invite-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "invite-1" }) },
    );

    expect(response.status).toBe(204);
    expect(mocks.revokeInvitation).toHaveBeenCalledWith({
      inviterUserId: "user-1",
      invitationId: "invite-1",
    });
  });

  it("does not reveal missing or foreign invitation ownership", async () => {
    mocks.revokeInvitation.mockRejectedValue(new InvitationNotActionableError());

    const response = await DELETE(
      new Request("http://localhost/api/invitations/foreign", { method: "DELETE" }),
      { params: Promise.resolve({ id: "foreign" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "INVITATION_NOT_FOUND" });
  });
});
