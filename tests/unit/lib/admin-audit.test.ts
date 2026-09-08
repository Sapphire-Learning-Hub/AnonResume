import { sanitizeAdminAuditMetadata } from "@/lib/admin-audit";

describe("admin audit metadata", () => {
  it("recursively strips credentials, content and binary result fields", () => {
    expect(
      sanitizeAdminAuditMetadata({
        reason: "policy violation",
        nested: {
          access_token: "secret-token",
          recoveryCodes: ["secret-code"],
          document: { title: "private" },
          count: 3,
        },
      }),
    ).toEqual({
      reason: "policy violation",
      nested: { count: 3 },
    });
  });
});
