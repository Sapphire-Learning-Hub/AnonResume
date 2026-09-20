import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decision: vi.fn(),
  handlerGet: vi.fn(),
  handlerPost: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock("@/lib/admin/setup/access", () => ({
  getSetupAccessDecision: mocks.decision,
}));

vi.mock("@/lib/auth/config", () => ({
  getAuth: mocks.getAuth,
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: mocks.handlerGet,
    POST: mocks.handlerPost,
  }),
}));

import { GET, POST } from "@/app/api/auth/[...all]/route";

describe("authentication setup gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockResolvedValue({});
    mocks.handlerGet.mockResolvedValue(new Response(null, { status: 204 }));
    mocks.handlerPost.mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("blocks auth mutations while initial setup is pending", async () => {
    mocks.decision.mockResolvedValue("require_setup");

    const response = await POST(
      new Request("http://localhost/api/auth/sign-up/email", { method: "POST" }) as never,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "instance_setup_required",
    });
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });

  it("preserves auth reads and recovery-mode mutations", async () => {
    mocks.decision.mockResolvedValue("management_recovery");

    await expect(
      GET(new Request("http://localhost/api/auth/get-session") as never),
    ).resolves.toMatchObject({ status: 204 });
    await expect(
      POST(
        new Request("http://localhost/api/auth/sign-in/email", { method: "POST" }) as never,
      ),
    ).resolves.toMatchObject({ status: 204 });

    expect(mocks.handlerGet).toHaveBeenCalledOnce();
    expect(mocks.handlerPost).toHaveBeenCalledOnce();
  });
});
