import { resolvePublicInformationDestinations } from "@/lib/public-info/destinations";

describe("public information destinations", () => {
  it("uses built-in pages when no external destinations are configured", () => {
    expect(
      resolvePublicInformationDestinations({
        privacyPolicyUrl: "",
        supportUrl: "",
        termsOfServiceUrl: "",
      }),
    ).toEqual({
      privacy: { external: false, href: "/privacy" },
      support: { external: false, href: "/docs/support" },
      terms: { external: false, href: "/terms" },
    });
  });

  it("overrides each legal destination independently", () => {
    expect(
      resolvePublicInformationDestinations({
        privacyPolicyUrl: "https://example.com/privacy",
        supportUrl: "",
        termsOfServiceUrl: "",
      }),
    ).toEqual({
      privacy: { external: true, href: "https://example.com/privacy" },
      support: { external: false, href: "/docs/support" },
      terms: { external: false, href: "/terms" },
    });
  });

  it("uses configured external destinations for support and both legal pages", () => {
    expect(
      resolvePublicInformationDestinations({
        privacyPolicyUrl: "https://example.com/privacy",
        supportUrl: "https://example.com/support",
        termsOfServiceUrl: "https://example.com/terms",
      }),
    ).toEqual({
      privacy: { external: true, href: "https://example.com/privacy" },
      support: { external: true, href: "https://example.com/support" },
      terms: { external: true, href: "https://example.com/terms" },
    });
  });
});
