import type { AdminPermission } from "@/lib/admin/permissions";

export type ManagementKind = "super_admin" | "delegated_admin";

export type AppShellAccess =
  | {
      mode: "product";
      productAccess: true;
      canEnterManagement: boolean;
      mfaEnrollmentRequired: boolean;
    }
  | {
      mode: "management";
      productAccess: boolean;
      kind: ManagementKind;
      permissions: AdminPermission[];
    }
  | {
      mode: "recovery";
      productAccess: boolean;
      kind: ManagementKind;
    };

export function resolveAppShellAccess(input: {
  productAccess: boolean;
  assignedManagement: {
    kind: ManagementKind;
    mfaConfigured: boolean;
  } | null;
  activeManagement: {
    kind: ManagementKind;
    permissions: AdminPermission[];
    recoveryRequired: boolean;
  } | null;
}): AppShellAccess {
  if (input.activeManagement) {
    if (input.activeManagement.recoveryRequired) {
      return {
        kind: input.activeManagement.kind,
        mode: "recovery",
        productAccess: input.productAccess,
      };
    }

    return {
      kind: input.activeManagement.kind,
      mode: "management",
      permissions: input.activeManagement.permissions,
      productAccess: input.productAccess,
    };
  }

  if (!input.productAccess) {
    throw new Error(
      "Management-only identity requires management authentication",
    );
  }

  return {
    canEnterManagement:
      input.assignedManagement?.kind === "delegated_admin",
    mfaEnrollmentRequired:
      input.assignedManagement?.kind === "delegated_admin" &&
      !input.assignedManagement.mfaConfigured,
    mode: "product",
    productAccess: true,
  };
}
