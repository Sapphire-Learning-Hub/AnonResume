import { getTableConfig } from "drizzle-orm/pg-core";

import { userInvitations } from "@/db/invitation-schema";

describe("user invitation database schema", () => {
  it("stores invitation ownership and terminal lifecycle state", () => {
    const config = getTableConfig(userInvitations);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "inviter_user_id",
        "invited_email",
        "token_hash",
        "last_sent_at",
        "expires_at",
        "accepted_by_user_id",
        "accepted_at",
        "revoked_at",
        "invalidated_at",
        "invalidation_reason",
        "legacy_invited_user_id",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "user_invitations_inviter_created_idx",
        "user_invitations_email_idx",
        "user_invitations_token_hash_unique",
        "user_invitations_legacy_user_unique",
      ]),
    );
  });
});
