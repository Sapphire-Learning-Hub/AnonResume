import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AcceptInvitationPanel } from "@/components/invitations/AcceptInvitationPanel";

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { email: mocks.signIn } },
}));

vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: { error: mocks.error } }),
}));

describe("AcceptInvitationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue({ error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ email: "fixed@example.com" }), { status: 201 }),
    ));
  });

  it("keeps the invited email fixed and signs in after acceptance", async () => {
    render(<AcceptInvitationPanel email="fixed@example.com" token="raw-token" />);

    expect(screen.getByDisplayValue("fixed@example.com")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "New user" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "new-user-password" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "new-user-password" } });
    fireEvent.click(screen.getByRole("button", { name: "接受邀请" }));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith({
      email: "fixed@example.com",
      password: "new-user-password",
    }));
    expect(mocks.replace).toHaveBeenCalledWith("/app");
  });

  it("rejects mismatched passwords before calling the server", async () => {
    render(<AcceptInvitationPanel email="fixed@example.com" token="raw-token" />);
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "New user" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "new-user-password" } });
    fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: "different-password" } });
    fireEvent.click(screen.getByRole("button", { name: "接受邀请" }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
  });
});
