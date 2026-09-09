import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { requireSession } from "@/lib/auth-session";

import FontMarketPage from "@/app/app/(workbench)/fonts/page";

vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(),
}));

vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign Out</button>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/fonts",
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("FontMarketPage", () => {
  it("loads the signed-in user's resumes and renders the market", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-demo" },
      user: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
      },
    } as never);
    render(await FontMarketPage());

    expect(requireSession).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "字体市场" })).toBeInTheDocument();
  });
});
