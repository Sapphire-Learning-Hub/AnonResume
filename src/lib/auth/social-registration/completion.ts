import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { invalidateInvitationsForIndependentRegistrationInTransaction } from "@/lib/invitations/registration";
import { getDatabasePool } from "@/lib/runtime/database";

import { SocialRegistrationError } from "./errors";
import {
  consumeLockedSocialRegistrationAttempt,
  lockSocialRegistrationAttemptForUpdate,
} from "./repository";

type CompletionDependencies = {
  afterAccountsCreated?: () => Promise<void>;
};

export async function completeSocialRegistration(
  input: {
    rawToken: string;
    displayName: string;
    password: string;
    now?: Date;
  },
  dependencies: CompletionDependencies = {},
) {
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 80) {
    throw new SocialRegistrationError("display_name_invalid");
  }
  if (input.password.length < 8 || input.password.length > 128) {
    throw new SocialRegistrationError("password_invalid");
  }

  const now = input.now ?? new Date();
  const passwordHash = await hashPassword(input.password);
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const attempt = await lockSocialRegistrationAttemptForUpdate(client, {
      rawToken: input.rawToken,
      now,
    });
    if (
      (attempt.state !== "profile_captured" &&
        attempt.state !== "email_verified") ||
      !attempt.providerAccountId ||
      !attempt.selectedEmail ||
      attempt.providerId !== "github"
    ) {
      throw new SocialRegistrationError("intent_invalid");
    }
    if (
      attempt.state === "profile_captured" &&
      (!attempt.providerEmailVerified ||
        attempt.providerEmail !== attempt.selectedEmail)
    ) {
      throw new SocialRegistrationError("intent_invalid");
    }

    const [provider, email] = await Promise.all([
      client.query<{ id: string }>(
        `SELECT id FROM "account"
          WHERE "providerId" = $1 AND "accountId" = $2
          LIMIT 1`,
        [attempt.providerId, attempt.providerAccountId],
      ),
      client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1`,
        [attempt.selectedEmail],
      ),
    ]);
    if (provider.rows[0] || email.rows[0]) {
      throw new SocialRegistrationError("account_conflict");
    }

    const userId = randomUUID();
    await client.query(
      `INSERT INTO "user"
        (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $5, $5)`,
      [userId, displayName, attempt.selectedEmail, attempt.avatarUrl, now],
    );
    await client.query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId", password,
         "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'credential', $2, $3, $4, $4, 'local:credential')`,
      [randomUUID(), userId, passwordHash, now],
    );
    await client.query(
      `INSERT INTO "account"
        (id, "accountId", "providerId", "userId",
         "createdAt", "updatedAt", issuer)
       VALUES ($1, $2, 'github', $3, $4, $4, 'local:oauth:github')`,
      [randomUUID(), attempt.providerAccountId, userId, now],
    );
    await dependencies.afterAccountsCreated?.();
    await invalidateInvitationsForIndependentRegistrationInTransaction(
      client,
      attempt.selectedEmail,
      userId,
      now,
    );
    await consumeLockedSocialRegistrationAttempt(client, {
      attemptId: attempt.id,
      now,
    });
    await client.query("COMMIT");
    return { email: attempt.selectedEmail, userId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if ((error as { code?: string }).code === "23505") {
      throw new SocialRegistrationError("account_conflict");
    }
    throw error;
  } finally {
    client.release();
  }
}
