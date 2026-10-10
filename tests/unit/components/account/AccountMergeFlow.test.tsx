import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));
const feedbackMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));
vi.mock("@/components/ui/useAppFeedback", () => ({
  useAppFeedback: () => ({ toast: feedbackMocks }),
}));

import { AccountMergeFlow } from "@/components/account/merge/AccountMergeFlow";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

const verifiedMerge = {
  confirmNotBefore: "2026-10-09T12:00:05.000Z",
  allowedPrimaryChoices: ["current", "target"],
  defaultPrimaryChoice: "current",
  requiresAdminMfa: true,
  current: {
    email: "c***@example.com",
    name: "Current User",
    resumeCount: 2,
    loginMethods: ["credential"],
  },
  target: {
    email: "t***@example.com",
    name: "GitHub User",
    resumeCount: 3,
    loginMethods: ["credential", "github"],
  },
};

async function finishConfirmationCountdown() {
  for (let second = 0; second < 5; second += 1) {
    await act(() => vi.advanceTimersByTimeAsync(1_000));
  }
}

describe("AccountMergeFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-09T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("verifies both accounts and enforces the five-second confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/intent")) {
        return jsonResponse({ providerId: "github", requiresAdminMfa: true });
      }
      if (url.endsWith("/verify")) return jsonResponse(verifiedMerge);
      if (url.endsWith("/confirm")) return jsonResponse({ state: "completed" });
      throw new Error(`Unexpected URL: ${url}`);
    }));

    render(<AccountMergeFlow onCancel={vi.fn()} open />);

    expect(await screen.findByLabelText("当前账号密码")).toBeInTheDocument();
    expect(screen.getByLabelText("管理员 MFA 验证码")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("当前账号密码"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号邮箱"), {
      target: { value: "target@example.com" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号密码"), {
      target: { value: "target-password" },
    });
    fireEvent.change(screen.getByLabelText("管理员 MFA 验证码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并继续" }));

    expect(await screen.findByText("Current User")).toBeInTheDocument();
    expect(screen.getByText("GitHub User")).toBeInTheDocument();
    expect(screen.getByText("2 份简历")).toBeInTheDocument();
    expect(screen.getByText("3 份简历")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /保留当前账号/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "5 秒后可确认" })).toBeDisabled();

    await finishConfirmationCountdown();
    fireEvent.click(screen.getByRole("button", { name: "确认合并" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/social-merge/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ primaryChoice: "current" }),
      }),
    ));
    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalledWith(
      "/sign-in?accountMerged=1",
    ));
  });

  it("polls a waiting merge and offers recovery after timeout", async () => {
    let statusRequests = 0;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/intent")) {
        return jsonResponse({ providerId: "github", requiresAdminMfa: false });
      }
      if (url.endsWith("/verify")) {
        return jsonResponse({ ...verifiedMerge, requiresAdminMfa: false });
      }
      if (url.endsWith("/confirm")) return jsonResponse({ state: "waiting" });
      if (url.endsWith("/status")) {
        statusRequests += 1;
        return jsonResponse(statusRequests === 1
          ? { state: "waiting", failureCode: null, primary: null }
          : { state: "expired", failureCode: "active_work_timeout", primary: null });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    render(<AccountMergeFlow onCancel={vi.fn()} open />);
    fireEvent.change(await screen.findByLabelText("当前账号密码"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号邮箱"), {
      target: { value: "target@example.com" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号密码"), {
      target: { value: "target-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并继续" }));
    await screen.findByText("Current User");
    await finishConfirmationCountdown();
    fireEvent.click(screen.getByRole("button", { name: "确认合并" }));

    expect(await screen.findByText("正在等待现有任务完成")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(await screen.findByText("账号合并未完成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回关联账号" })).toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("cancels a verified merge before final confirmation", async () => {
    const onCancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/intent")) {
        return jsonResponse({ providerId: "github", requiresAdminMfa: false });
      }
      if (url.endsWith("/verify")) {
        return jsonResponse({ ...verifiedMerge, requiresAdminMfa: false });
      }
      if (url.endsWith("/cancel")) return jsonResponse({ state: "cancelled" });
      throw new Error(`Unexpected URL: ${url}`);
    }));

    render(<AccountMergeFlow onCancel={onCancel} open />);
    fireEvent.change(await screen.findByLabelText("当前账号密码"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号邮箱"), {
      target: { value: "target@example.com" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号密码"), {
      target: { value: "target-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并继续" }));
    await screen.findByText("Current User");
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/social-merge/cancel",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("stops status polling after the flow is unmounted", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/intent")) {
        return jsonResponse({ providerId: "github", requiresAdminMfa: false });
      }
      if (url.endsWith("/verify")) {
        return jsonResponse({ ...verifiedMerge, requiresAdminMfa: false });
      }
      if (url.endsWith("/confirm")) return jsonResponse({ state: "waiting" });
      if (url.endsWith("/status")) {
        return jsonResponse({ state: "waiting", failureCode: null, primary: null });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const { unmount } = render(<AccountMergeFlow onCancel={vi.fn()} open />);
    fireEvent.change(await screen.findByLabelText("当前账号密码"), {
      target: { value: "current-password" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号邮箱"), {
      target: { value: "target@example.com" },
    });
    fireEvent.change(screen.getByLabelText("另一个账号密码"), {
      target: { value: "target-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并继续" }));
    await screen.findByText("Current User");
    await finishConfirmationCountdown();
    fireEvent.click(screen.getByRole("button", { name: "确认合并" }));
    await screen.findByText("正在等待现有任务完成");
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/account/social-merge/status",
      expect.any(Object),
    ));
    const requestsBeforeUnmount = vi.mocked(fetch).mock.calls.length;

    unmount();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fetch).toHaveBeenCalledTimes(requestsBeforeUnmount);
  });
});
