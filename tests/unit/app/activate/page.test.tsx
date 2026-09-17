const activationMocks = vi.hoisted(() => ({
  inspectAdminActivation: vi.fn(),
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: vi.fn().mockResolvedValue("zh-CN"),
}));

vi.mock("@/lib/admin/activation", () => ({
  AdminActivationError: class AdminActivationError extends Error {},
  inspectAdminActivation: activationMocks.inspectAdminActivation,
}));

import { generateMetadata } from "@/app/activate/page";

describe("activation page metadata", () => {
  it("identifies an invited account instead of a super administrator", async () => {
    activationMocks.inspectAdminActivation.mockResolvedValue({
      email: "invitee@example.com",
      purpose: "product_user",
      requiresMfa: false,
    });

    const metadata = await Reflect.apply(generateMetadata, undefined, [{
      searchParams: Promise.resolve({ token: "invite-token" }),
    }]);

    expect(metadata.title).toBe("激活邀请账号");
    expect(activationMocks.inspectAdminActivation).toHaveBeenCalledWith(
      "invite-token",
    );
  });
});
