import {
  createAccountMergeToken,
  createMergedAccountEmail,
  digestAccountMergeEmail,
  hashAccountMergeToken,
  maskAccountMergeEmail,
  normalizeAccountMergeEmail,
  verifyAccountMergeToken,
} from "@/lib/auth/account/merge/tokens";

const secret = "account-merge-test-secret-that-is-long-enough";

describe("account merge tokens", () => {
  it("generates opaque tokens while persisting only a keyed digest", () => {
    const token = createAccountMergeToken("link-attempt", {
      secret,
      randomBytes: () => Buffer.alloc(32, 7),
    });

    expect(token.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.raw).not.toBe(token.digest);
    expect(token.digest).toHaveLength(64);
    expect(hashAccountMergeToken("link-attempt", token.raw, secret))
      .toBe(token.digest);
    expect(verifyAccountMergeToken(
      "link-attempt",
      token.raw,
      token.digest,
      secret,
    )).toBe(true);
    expect(verifyAccountMergeToken(
      "operation-status",
      token.raw,
      token.digest,
      secret,
    )).toBe(false);
  });

  it("normalizes, masks, and irreversibly digests audit email values", () => {
    expect(normalizeAccountMergeEmail("  User.Name@Example.COM "))
      .toBe("user.name@example.com");
    expect(maskAccountMergeEmail("User.Name@Example.COM"))
      .toBe("u***@example.com");
    expect(maskAccountMergeEmail("x@example.com")).toBe("x***@example.com");
    expect(digestAccountMergeEmail(" User.Name@Example.COM ", secret))
      .toBe(digestAccountMergeEmail("user.name@example.com", secret));
    expect(digestAccountMergeEmail("user.name@example.com", secret))
      .not.toContain("user.name");
  });

  it("creates deterministic unique non-routable tombstone addresses", () => {
    expect(createMergedAccountEmail("1cdd6734-a29e-4d35-a6cc-9e7355de0b4e"))
      .toBe("merged+1cdd6734-a29e-4d35-a6cc-9e7355de0b4e@users.invalid");
    expect(createMergedAccountEmail("user/with unsafe chars"))
      .toMatch(/^merged\+[a-z0-9-]+-[a-f0-9]{12}@users\.invalid$/);
    expect(createMergedAccountEmail("user-a"))
      .not.toBe(createMergedAccountEmail("user-b"));
  });
});
