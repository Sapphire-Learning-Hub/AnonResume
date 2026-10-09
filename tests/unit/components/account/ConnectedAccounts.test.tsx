import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const authMocks = vi.hoisted(() => ({
  linkSocial: vi.fn(),
  listAccounts: vi.fn(),
  unlinkAccount: vi.fn(),
}));
const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({ authClient: authMocks }));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: feedbackMocks }),
}));

import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";

const credentialAccount = {
  id: "credential-account",
  providerId: "credential",
};
const githubAccount = {
  id: "github-account",
  providerId: "github",
};

describe("ConnectedAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      callbackURL: "/api/account/social-link/result?provider=github&outcome=success",
      errorCallbackURL: "/api/account/social-link/result?provider=github&outcome=error",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    authMocks.linkSocial.mockResolvedValue({ data: { redirect: true }, error: null });
    authMocks.unlinkAccount.mockResolvedValue({ data: { status: true }, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts GitHub account linking and returns to the account connections section", async () => {
    authMocks.listAccounts.mockResolvedValue({
      data: [credentialAccount],
      error: null,
    });

    render(<ConnectedAccounts />);
    fireEvent.click(await screen.findByRole("button", { name: "关联 GitHub" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/social-link/attempt",
      expect.objectContaining({ method: "POST" }),
    ));
    await waitFor(() => expect(authMocks.linkSocial).toHaveBeenCalledWith({
      callbackURL: "/api/account/social-link/result?provider=github&outcome=success",
      errorCallbackURL: "/api/account/social-link/result?provider=github&outcome=error",
      provider: "github",
    }));
  });

  it("opens the passive merge flow only after a GitHub collision callback", async () => {
    authMocks.listAccounts.mockResolvedValue({
      data: [credentialAccount],
      error: null,
    });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      providerId: "github",
      requiresAdminMfa: false,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const { rerender } = render(<ConnectedAccounts />);
    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "合并账号" })).not.toBeInTheDocument();

    rerender(<ConnectedAccounts mergeRequested />);

    expect(await screen.findByRole("dialog", { name: "合并账号" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/social-merge/intent",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("unlinks GitHub when another sign-in method remains", async () => {
    authMocks.listAccounts
      .mockResolvedValueOnce({
        data: [credentialAccount, githubAccount],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [credentialAccount],
        error: null,
      });

    render(<ConnectedAccounts />);
    fireEvent.click(await screen.findByRole("button", { name: "解除 GitHub 关联" }));
    const dialog = screen.getByRole("dialog", { name: "解除 GitHub 关联" });
    fireEvent.click(within(dialog).getByRole("button", { name: "解除关联" }));

    await waitFor(() => expect(authMocks.unlinkAccount).toHaveBeenCalledWith({
      accountId: "github-account",
    }));
    expect(await screen.findByRole("button", { name: "关联 GitHub" })).toBeInTheDocument();
    expect(feedbackMocks.success).toHaveBeenCalledWith("GitHub 账号关联已解除。");
  });

  it("prevents unlinking the only remaining sign-in method", async () => {
    authMocks.listAccounts.mockResolvedValue({
      data: [githubAccount],
      error: null,
    });

    render(<ConnectedAccounts />);

    expect(await screen.findByRole("button", {
      name: "解除 GitHub 关联",
    })).toBeDisabled();
  });

  it("keeps account navigation available when linked accounts fail to load", async () => {
    authMocks.listAccounts
      .mockResolvedValueOnce({ data: null, error: { message: "failed" } })
      .mockResolvedValueOnce({ data: [credentialAccount], error: null });

    render(<ConnectedAccounts />);

    expect(await screen.findByText("关联账号暂时无法加载。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载关联账号" }));

    expect(await screen.findByRole("button", { name: "关联 GitHub" })).toBeInTheDocument();
    expect(authMocks.listAccounts).toHaveBeenCalledTimes(2);
  });
});
