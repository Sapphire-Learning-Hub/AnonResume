import { render, screen } from "@testing-library/react";

import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

const state = vi.hoisted(() => ({
  locale: "zh-CN" as "en-US" | "zh-CN",
  rejectRuntime: false,
  values: {
    legalContactEmail: "privacy@example.com",
    legalEffectiveDate: "2026-10-09",
    legalOperatorName: "Example Operator",
    privacyPolicyUrl: "",
    supportUrl: "",
    termsOfServiceUrl: "",
  },
}));
const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMocks.redirect,
}));

vi.mock("@/i18n/server", () => ({
  getRequestLocale: () => Promise.resolve(state.locale),
}));

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: () => {
    if (state.rejectRuntime) return Promise.reject(new Error("unavailable"));
    return Promise.resolve({ values: state.values });
  },
}));

describe("public legal pages", () => {
  beforeEach(() => {
    state.locale = "zh-CN";
    state.rejectRuntime = false;
    state.values.legalContactEmail = "privacy@example.com";
    state.values.legalEffectiveDate = "2026-10-09";
    state.values.legalOperatorName = "Example Operator";
    state.values.privacyPolicyUrl = "";
    state.values.supportUrl = "";
    state.values.termsOfServiceUrl = "";
    navigationMocks.redirect.mockClear();
  });

  it("renders the built-in privacy policy with instance information", async () => {
    render(await PrivacyPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "隐私政策" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Example Operator")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "privacy@example.com" }))
      .toHaveAttribute("href", "mailto:privacy@example.com");
    expect(screen.getByText("2026年10月9日")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "你可以管理的信息" }))
      .toBeInTheDocument();
  });

  it("renders the built-in terms in English", async () => {
    state.locale = "en-US";
    render(await TermsPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms of service" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Using the service" }))
      .toBeInTheDocument();
  });

  it("redirects only the legal page with an external override", async () => {
    state.values.privacyPolicyUrl = "https://legal.example.com/privacy";

    await expect(PrivacyPage()).rejects.toThrow(
      "redirect:https://legal.example.com/privacy",
    );
    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      "https://legal.example.com/privacy",
    );

    render(await TermsPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "服务条款" }),
    ).toBeInTheDocument();
  });

  it("falls back to the built-in policy when configuration is unavailable", async () => {
    state.rejectRuntime = true;
    render(await PrivacyPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "隐私政策" }),
    ).toBeInTheDocument();
    expect(screen.getByText("当前 AnonResume 实例运营方"))
      .toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "获取支持" }))
      .toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "获取支持" })) {
      expect(link).toHaveAttribute("href", "/docs/support");
    }
  });
});
