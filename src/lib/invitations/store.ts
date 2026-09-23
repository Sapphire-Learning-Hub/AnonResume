import { randomBytes } from "node:crypto";

import type { PoolClient } from "pg";
import { z } from "zod";

import { hashAdminSecret } from "@/lib/admin/crypto";
import { InvitationEmailError } from "@/lib/invitations/errors";
import { INVITATION_RESEND_INTERVAL_MS } from "@/lib/invitations/constants";
import type {
  UserInvitationStatus,
  UserInvitationSummary,
} from "@/lib/invitations/types";
import { resolveApplicationOriginForBootstrap } from "@/lib/runtime/configuration";

export type InvitationRow = {
  id: string;
  inviterUserId: string;
  invitedEmail: string;
  tokenHash: string | null;
  lastSentAt: Date;
  expiresAt: Date;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invalidatedAt: Date | null;
  invalidationReason:
    | "registered_independently"
    | "accepted_via_other_invitation"
    | null;
  legacyInvitedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const emailSchema = z.email().max(254);

export function normalizeInvitationEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) throw new InvitationEmailError();
  return email;
}

export function createInvitationToken() {
  const rawToken = randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashAdminSecret(rawToken) };
}

export function createInvitationUrl(rawToken: string) {
  const url = new URL(
    "/accept-invitation",
    resolveApplicationOriginForBootstrap(),
  );
  url.searchParams.set("token", rawToken);
  return url.toString();
}

export async function lockInvitationScope(
  client: PoolClient,
  inviterUserId: string,
  invitedEmail: string,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('user-inviter:' || $1))",
    [inviterUserId],
  );
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('user-invite-email:' || $1))",
    [invitedEmail],
  );
}

export async function lockInvitationEmail(
  client: PoolClient,
  invitedEmail: string,
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('user-invite-email:' || $1))",
    [invitedEmail],
  );
}

export function deriveInvitationStatus(
  row: InvitationRow,
  now: Date,
): UserInvitationStatus {
  if (row.acceptedAt) return "accepted";
  if (row.revokedAt) return "revoked";
  if (row.invalidatedAt) {
    return row.invalidationReason === "accepted_via_other_invitation"
      ? "accepted_via_other_invitation"
      : "registered_independently";
  }
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

export function toInvitationSummary(
  row: InvitationRow,
  now: Date,
): UserInvitationSummary {
  return {
    id: row.id,
    email: row.invitedEmail,
    status: deriveInvitationStatus(row, now),
    createdAt: row.createdAt,
    lastSentAt: row.lastSentAt,
    expiresAt: row.expiresAt,
    nextResendAt: new Date(
      row.lastSentAt.getTime() + INVITATION_RESEND_INTERVAL_MS,
    ),
  };
}

export function isInvitationTerminal(row: InvitationRow) {
  return Boolean(row.acceptedAt || row.revokedAt || row.invalidatedAt);
}
