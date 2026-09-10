export type AuthenticatedEntry =
  | "/app"
  | "/app/manage"
  | "/app/manage/security"
  | "management_mfa";

export function resolveAuthenticatedEntry(input: {
  productAccess: boolean;
  assignedManagement: { kind: "super_admin" | "delegated_admin" } | null;
  activeManagement: { recoveryRequired: boolean } | null;
}): AuthenticatedEntry {
  if (input.activeManagement) {
    return input.activeManagement.recoveryRequired
      ? "/app/manage/security"
      : "/app/manage";
  }

  if (input.productAccess) return "/app";
  if (input.assignedManagement?.kind === "super_admin") {
    return "management_mfa";
  }

  return "/app";
}
