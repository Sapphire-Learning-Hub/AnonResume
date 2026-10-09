import {
  evaluateAccountMergePolicy,
  type AccountMergePolicyInput,
} from "@/lib/auth/account/merge/policy";
import { AccountMergeError } from "@/lib/auth/account/merge/errors";

function account(
  overrides: Partial<AccountMergePolicyInput["current"]> = {},
): AccountMergePolicyInput["current"] {
  return {
    userId: "current-user",
    lifecycleStatus: "active",
    suspended: false,
    adminKind: null,
    hasPassword: true,
    providerAccounts: [],
    ...overrides,
  };
}

function input(
  overrides: Partial<AccountMergePolicyInput> = {},
): AccountMergePolicyInput {
  return {
    current: account(),
    target: account({
      userId: "target-user",
      providerAccounts: [{ providerId: "github", accountId: "github-42" }],
    }),
    provider: { providerId: "github", accountId: "github-42" },
    ...overrides,
  };
}

async function expectPolicyError(
  value: AccountMergePolicyInput,
  code: AccountMergeError["code"],
) {
  try {
    evaluateAccountMergePolicy(value);
    expect.unreachable("Expected account merge policy to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(AccountMergeError);
    expect(error).toEqual(expect.objectContaining({ code }));
  }
}

describe("account merge policy", () => {
  it("lets two ordinary accounts choose either primary and defaults to current", () => {
    expect(evaluateAccountMergePolicy(input())).toEqual({
      allowedPrimaryChoices: ["current", "target"],
      defaultPrimaryChoice: "current",
      selectedPrimaryChoice: "current",
      requiresAdminMfa: false,
    });
    expect(evaluateAccountMergePolicy(input({ requestedPrimary: "target" })))
      .toMatchObject({ selectedPrimaryChoice: "target" });
  });

  it("forces a current administrator to remain primary and require MFA", () => {
    expect(evaluateAccountMergePolicy(input({
      current: account({ adminKind: "delegated_admin" }),
    }))).toEqual({
      allowedPrimaryChoices: ["current"],
      defaultPrimaryChoice: "current",
      selectedPrimaryChoice: "current",
      requiresAdminMfa: true,
    });
  });

  it("rejects non-admin to admin and administrator to administrator merges", async () => {
    await expectPolicyError(input({
      target: account({
        userId: "target-user",
        adminKind: "delegated_admin",
        providerAccounts: [{ providerId: "github", accountId: "github-42" }],
      }),
    }), "target_is_administrator");

    await expectPolicyError(input({
      current: account({ adminKind: "super_admin" }),
      target: account({
        userId: "target-user",
        adminKind: "delegated_admin",
        providerAccounts: [{ providerId: "github", accountId: "github-42" }],
      }),
    }), "administrator_pair");
  });

  it.each(["pending_deletion", "deleted", "merged"] as const)(
    "rejects a %s participant",
    async (lifecycleStatus) => {
      await expectPolicyError(input({
        target: account({
          userId: "target-user",
          lifecycleStatus,
          providerAccounts: [{ providerId: "github", accountId: "github-42" }],
        }),
      }), "account_unavailable");
    },
  );

  it("rejects suspended, quarantined, self, and passwordless participants", async () => {
    await expectPolicyError(input({
      target: account({ userId: "target-user", suspended: true }),
    }), "account_unavailable");
    await expectPolicyError(input({
      target: account({
        userId: "target-user",
        adminKind: "quarantined_admin",
      }),
    }), "account_unavailable");
    await expectPolicyError(input({
      target: account({ userId: "current-user" }),
    }), "same_account");
    await expectPolicyError(input({
      target: account({ userId: "target-user", hasPassword: false }),
    }), "password_unavailable");
  });

  it("removes a primary choice that would collide with another provider identity", async () => {
    const value = input({
      current: account({
        providerAccounts: [{ providerId: "github", accountId: "github-other" }],
      }),
    });

    expect(evaluateAccountMergePolicy(value)).toEqual({
      allowedPrimaryChoices: ["target"],
      defaultPrimaryChoice: "target",
      selectedPrimaryChoice: "target",
      requiresAdminMfa: false,
    });
    await expectPolicyError(
      { ...value, requestedPrimary: "current" },
      "provider_conflict",
    );
  });

  it("rejects a forced administrator primary that has a provider conflict", async () => {
    await expectPolicyError(input({
      current: account({
        adminKind: "super_admin",
        providerAccounts: [{ providerId: "github", accountId: "github-other" }],
      }),
    }), "provider_conflict");
  });
});
