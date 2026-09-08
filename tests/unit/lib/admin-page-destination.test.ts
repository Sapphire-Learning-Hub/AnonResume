import { resolveAdminPageFailureDestination } from "@/lib/admin-page";

describe("resolveAdminPageFailureDestination", () => {
  it("keeps every failure inside the unified application flow", () => {
    expect(resolveAdminPageFailureDestination("recovery", true)).toBe(
      "/app/manage/security",
    );
    expect(resolveAdminPageFailureDestination("unauthenticated", true)).toBe(
      "/app",
    );
    expect(resolveAdminPageFailureDestination("unauthenticated", false)).toBe(
      "/sign-in",
    );
    expect(resolveAdminPageFailureDestination("forbidden", true)).toBe(
      "/app/manage/forbidden",
    );
  });
});
