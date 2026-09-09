import { buildAppNavigation } from "@/components/dashboard/app-navigation";
import type { AppShellAccess } from "@/lib/app-shell-access";

const label = (key: string) => key;

function hrefs(access: AppShellAccess) {
  return buildAppNavigation(access, label).map((section) => ({
    id: section.id,
    items: section.items.map((item) => item.href),
  }));
}

describe("app navigation", () => {
  it("shows only product links to product users and dormant administrators", () => {
    const expected = [{ id: "product", items: ["/app", "/app/fonts"] }];

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
        permissions: ["overview.read", "users.read", "audit.read"],
        productAccess: true,
      }),
    ).toEqual([
      { id: "product", items: ["/app", "/app/fonts"] },
      {
        id: "management",
        items: [
          "/app/manage",
          "/app/manage/users",
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
          "/app/manage/audit",
          "/app/manage/system",
          "/app/manage/security",
        ],
      },
    ]);
  });

  it("keeps product links but limits management links during delegated-admin recovery", () => {
    expect(
      hrefs({
        kind: "delegated_admin",
        mode: "recovery",
        productAccess: true,
      }),
    ).toEqual([
      { id: "product", items: ["/app", "/app/fonts"] },
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
