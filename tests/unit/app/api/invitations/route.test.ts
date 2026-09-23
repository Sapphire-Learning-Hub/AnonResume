const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn(),
  getSession: vi.fn(),
  listInvitations: vi.fn(),
  sendInvitation: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: mocks.getSession,
}));

vi.mock("@/lib/invitations/service", () => ({
  createUserInvitation: mocks.createInvitation,
  listUserInvitations: mocks.listInvitations,
}));

vi.mock("@/lib/runtime/email", () => ({
  sendProductInvitationEmail: mocks.sendInvitation,
}));

import { GET, POST } from "@/app/api/invitations/route";
import { InvitationLimitError } from "@/lib/invitations/errors";

describe("product invitation collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      user: { id: "user-1", name: "Current user", email: "me@example.com" },
    });
    mocks.listInvitations.mockResolvedValue({ activeCount: 0, limit: 5, items: [] });
    mocks.createInvitation.mockResolvedValue({ outcome: "handled" });
  });

  it("requires an authenticated product session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("lists only invitations owned by the current user", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.listInvitations).toHaveBeenCalledWith("user-1");
  });

  it("accepts only an email and derives inviter identity from the session", async () => {
    const response = await POST(
      new Request("http://localhost/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com" }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "processed" });
    expect(mocks.createInvitation).toHaveBeenCalledWith({
      inviterUserId: "user-1",
      inviterName: "Current user",
      inviterEmail: "me@example.com",
      invitedEmail: "new@example.com",
      deliverInvitation: mocks.sendInvitation,
    });
  });

  it("rejects privilege-bearing fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", roleIds: ["role-1"] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("maps the active limit to a stable error", async () => {
    mocks.createInvitation.mockRejectedValue(new InvitationLimitError());

    const response = await POST(
      new Request("http://localhost/api/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "INVITATION_LIMIT_REACHED" });
  });
});
