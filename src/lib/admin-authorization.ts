import type { AdminPermission } from "./admin-permissions";
import { hashAdminSecret } from "./admin-crypto";

export class AdminAuthenticationError extends Error {
  constructor(message = "Management authentication is required") {
    super(message);
    this.name = "AdminAuthenticationError";
  }
}

export class AdminPermissionError extends Error {
  constructor(permission: AdminPermission) {
    super(`Missing management permission: ${permission}`);
    this.name = "AdminPermissionError";
  }
}

export class AdminReauthenticationRequiredError extends Error {
  constructor() {
    super("Recent management MFA verification is required");
    this.name = "AdminReauthenticationRequiredError";
  }
}

export class AdminMfaRecoveryRequiredError extends Error {
  constructor() {
    super("Management MFA recovery must be completed");
    this.name = "AdminMfaRecoveryRequiredError";
  }
}

export interface StoredAdminSession {
  id: string;
  userId: string;
  baseSessionId: string;
  accessVersion: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  reauthenticatedAt: Date | null;
  revokedAt: Date | null;
}

export interface StoredAdminAccess {
  kind: "super_admin" | "delegated_admin";
  accessVersion: number;
  permissions: AdminPermission[];
  recoveryRequired: boolean;
}

export interface AdminAuthorizationStore {
  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredAdminSession | null>;
  getAccess(userId: string): Promise<StoredAdminAccess | null>;
  touchSession(
    sessionId: string,
    input: { lastSeenAt: Date; idleExpiresAt: Date },
  ): Promise<void>;
}

export interface AdminAuthorizationContext extends StoredAdminAccess {
  adminSessionId: string;
  userId: string;
  baseSessionId: string;
  reauthenticatedAt: Date | null;
}

export async function authorizeAdminRequest({
  store,
  baseSession,
  rawAdminToken,
  now = new Date(),
  idleSeconds,
}: {
  store: AdminAuthorizationStore;
  baseSession: { userId: string; sessionId: string } | null;
  rawAdminToken: string | null | undefined;
  now?: Date;
  idleSeconds: number;
}): Promise<AdminAuthorizationContext> {
  if (!baseSession || !rawAdminToken) {
    throw new AdminAuthenticationError();
  }

  const storedSession = await store.findSessionByTokenHash(
    hashAdminSecret(rawAdminToken),
  );
  if (
    !storedSession ||
    storedSession.revokedAt ||
    storedSession.userId !== baseSession.userId ||
    storedSession.baseSessionId !== baseSession.sessionId ||
    storedSession.idleExpiresAt <= now ||
    storedSession.absoluteExpiresAt <= now
  ) {
    throw new AdminAuthenticationError("Management session is invalid or expired");
  }

  const access = await store.getAccess(baseSession.userId);
  if (!access || access.accessVersion !== storedSession.accessVersion) {
    throw new AdminAuthenticationError("Management access has changed");
  }

  const idleExpiresAt = new Date(
    Math.min(
      now.getTime() + idleSeconds * 1000,
      storedSession.absoluteExpiresAt.getTime(),
    ),
  );
  await store.touchSession(storedSession.id, {
    lastSeenAt: now,
    idleExpiresAt,
  });

  return {
    ...access,
    adminSessionId: storedSession.id,
    userId: storedSession.userId,
    baseSessionId: storedSession.baseSessionId,
    reauthenticatedAt: storedSession.reauthenticatedAt,
  };
}

export function requireAdminPermission(
  context: Pick<AdminAuthorizationContext, "kind" | "permissions">,
  permission: AdminPermission,
) {
  if (
    context.kind !== "super_admin" &&
    !context.permissions.includes(permission)
  ) {
    throw new AdminPermissionError(permission);
  }
}

export function requireRecentAdminReauthentication(
  context: Pick<AdminAuthorizationContext, "reauthenticatedAt"> &
    Partial<Pick<AdminAuthorizationContext, "recoveryRequired">>,
  now: Date,
  reauthSeconds: number,
  options: { allowRecoveryEnrollment?: boolean } = {},
) {
  if (options.allowRecoveryEnrollment && context.recoveryRequired) {
    return;
  }

  if (
    !context.reauthenticatedAt ||
    now.getTime() - context.reauthenticatedAt.getTime() > reauthSeconds * 1000
  ) {
    throw new AdminReauthenticationRequiredError();
  }
}
