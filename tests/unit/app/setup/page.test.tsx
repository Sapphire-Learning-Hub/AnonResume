import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/setup/session", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/admin/setup/session")
  >();
  return { ...original, inspectPublicSetupStatus: mocks.inspect };
});

import SetupPage from "@/app/setup/page";

describe("setup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the server-selected setup mode", async () => {
    mocks.inspect.mockResolvedValue({ required: true, mode: "recovery" });

    render(await SetupPage());

    expect(
      screen.getByRole("heading", { name: "恢复超级管理员访问" }),
    ).toBeVisible();
  });

  it("redirects completed instances to sign in", async () => {
    mocks.inspect.mockResolvedValue({ required: false });

    await SetupPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/sign-in");
  });
});
