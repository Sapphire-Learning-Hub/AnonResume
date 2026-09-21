import { getInstanceSetupSnapshot } from "@/lib/admin/setup/repository";

export type SetupAccessDecision =
  | "allow"
  | "require_setup"
  | "management_recovery";

export type AdminSetupAccessErrorCode =
  | "instance_setup_required"
  | "admin_recovery_required";

export class AdminSetupAccessError extends Error {
  constructor(readonly code: AdminSetupAccessErrorCode) {
    super(code);
    this.name = "AdminSetupAccessError";
  }
}

export async function getSetupAccessDecision(
  pathname: string,
): Promise<SetupAccessDecision> {
  const snapshot = await getInstanceSetupSnapshot();
  if (snapshot.state === "completed") return "allow";

  if (snapshot.state === "pending_initialization") {
    return isInitialSetupPathAllowed(pathname) ? "allow" : "require_setup";
  }

  return isManagementPath(pathname) ? "management_recovery" : "allow";
}

export async function requireManagementSetupCompleted(): Promise<void> {
  const snapshot = await getInstanceSetupSnapshot();
  if (snapshot.state === "completed") return;

  throw new AdminSetupAccessError(
    snapshot.state === "pending_initialization"
      ? "instance_setup_required"
      : "admin_recovery_required",
  );
}

function isInitialSetupPathAllowed(pathname: string) {
  return ["/setup", "/api/setup", "/api/health"].some(
    (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
  );
}

function isManagementPath(pathname: string) {
  return ["/app/manage", "/api/manage"].some(
    (managed) => pathname === managed || pathname.startsWith(`${managed}/`),
  );
}
