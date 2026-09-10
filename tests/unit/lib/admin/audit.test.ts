import {
  createAdminAuditChanges,
  sanitizeAdminAuditMetadata,
} from "@/lib/admin/audit";

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

  it("records only changed fields and strips secrets inside change values", () => {
    const metadata = sanitizeAdminAuditMetadata({
      changes: createAdminAuditChanges(
        {
          description: "before",
          name: "unchanged",
          secret: "old-secret",
        },
        {
          description: "after",
          name: "unchanged",
          secret: "new-secret",
        },
      ),
    });

    expect(metadata).toEqual({
      changes: [{
        field: "description",
        before: "before",
        after: "after",
      }],
    });
  });
});
