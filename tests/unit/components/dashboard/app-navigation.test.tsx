import { buildAppNavigation } from "@/components/dashboard/app-navigation";
import type { AppShellAccess } from "@/lib/auth/app-shell-access";

const label = (key: string) => key;

function hrefs(access: AppShellAccess) {
  return buildAppNavigation(access, label).map((section) => ({
    id: section.id,
    items: section.items.map((item) => item.href),
  }));
}

describe("app navigation", () => {
  it("shows only product links to product users and dormant administrators", () => {
    const expected = [{
      id: "product",
      items: ["/app", "/app/fonts", "/app/ai"],
    }];

    expect(
      hrefs({
        canEnterManagement: false,
        mfaEnrollmentRequired: false,
        mode: "product",
        productAccess: true,
      }),
    ).toEqual(expected);
    expect(
      hrefs({
        canEnterManagement: true,
        mfaEnrollmentRequired: false,
        mode: "product",
        productAccess: true,
      }),
    ).toEqual(expected);
  });

  it("adds permission-filtered management links for delegated administrators", () => {
    expect(
      hrefs({
        kind: "delegated_admin",
        mode: "management",
        permissions: [
          "overview.read",
          "users.read",
          "announcements.read",
          "audit.read",
        ],
        productAccess: true,
      }),
    ).toEqual([
      { id: "product", items: ["/app", "/app/fonts", "/app/ai"] },
      {
        id: "management",
        items: [
          "/app/manage",
          "/app/manage/users",
          "/app/manage/announcements",
          "/app/manage/audit",
          "/app/manage/security",
        ],
      },
    ]);
  });

  it("replaces product navigation for the super-admin", () => {
    expect(
      hrefs({
        kind: "super_admin",
        mode: "management",
        permissions: [],
        productAccess: false,
      }),
    ).toEqual([
      {
        id: "management",
        items: [
          "/app/manage",
          "/app/manage/users",
          "/app/manage/resumes",
          "/app/manage/exports",
          "/app/manage/roles",
          "/app/manage/announcements",
          "/app/manage/ai",
          "/app/manage/audit",
          "/app/manage/system",
          "/app/manage/configuration",
          "/app/manage/mfa-resets",
          "/app/manage/security",
        ],
      },
    ]);
  });

  it("nests permission-filtered AI pages under AI management", () => {
    const sections = buildAppNavigation({
      kind: "delegated_admin",
      mode: "management",
      permissions: ["ai.quotas.manage", "ai.audit.sensitive.read"],
      productAccess: false,
    }, label);
    const aiItem = sections[0]?.items.find((item) => item.id === "manage-ai");

    expect(aiItem?.href).toBe("/app/manage/ai");
    expect(aiItem?.children?.map((item) => item.href)).toEqual([
      "/app/manage/ai/quotas",
      "/app/manage/ai/usage",
    ]);
  });

  it("shows configuration management only with explicit read access", () => {
    const withConfiguration = hrefs({
      kind: "delegated_admin",
      mode: "management",
      permissions: ["configuration.read"],
      productAccess: false,
    });
    const withSystemOnly = hrefs({
      kind: "delegated_admin",
      mode: "management",
      permissions: ["system.read"],
      productAccess: false,
    });

    expect(withConfiguration[0]?.items).toContain(
      "/app/manage/configuration",
    );
    expect(withSystemOnly[0]?.items).not.toContain(
      "/app/manage/configuration",
    );
  });

  it("keeps product links but limits management links during delegated-admin recovery", () => {
    expect(
      hrefs({
        kind: "delegated_admin",
        mode: "recovery",
        productAccess: true,
      }),
    ).toEqual([
      { id: "product", items: ["/app", "/app/fonts", "/app/ai"] },
      { id: "management", items: ["/app/manage/security"] },
    ]);
  });

  it("shows only MFA management during super-admin recovery", () => {
    expect(
      hrefs({
        kind: "super_admin",
        mode: "recovery",
        productAccess: false,
      }),
    ).toEqual([
      { id: "management", items: ["/app/manage/security"] },
    ]);
  });
});
