const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  inspect: vi.fn(),
}));

vi.mock("@/lib/invitations/acceptance", () => ({
  acceptUserInvitation: mocks.accept,
  inspectUserInvitation: mocks.inspect,
  InvalidUserInvitationError: class extends Error {},
}));

import { POST } from "@/app/api/invitations/accept/route";
import { GET } from "@/app/api/invitations/accept/inspect/route";

describe("public invitation acceptance routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspect.mockResolvedValue({ email: "invited@example.com" });
    mocks.accept.mockResolvedValue({ email: "invited@example.com", userId: "user-1" });
  });

  it("inspects only a valid token", async () => {
    const response = await GET(
      new Request("http://localhost/api/invitations/accept/inspect?token=raw-token"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "invited@example.com" });
    expect(mocks.inspect).toHaveBeenCalledWith("raw-token");
  });

  it("validates and accepts a password-protected invitation", async () => {
    const response = await POST(
      new Request("http://localhost/api/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "raw-token", name: "New user", password: "new-user-password" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ email: "invited@example.com" });
  });

  it("maps every invalid token state to one public error", async () => {
    const { InvalidUserInvitationError } = await import("@/lib/invitations/acceptance");
    mocks.inspect.mockRejectedValue(new InvalidUserInvitationError());

    const response = await GET(
      new Request("http://localhost/api/invitations/accept/inspect?token=invalid"),
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "INVALID_INVITATION" });
  });
});
