CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inviter_user_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"token_hash" text,
	"last_sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_user_id" text,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"legacy_invited_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_invitations_inviter_created_idx" ON "user_invitations" USING btree ("inviter_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_invitations_email_idx" ON "user_invitations" USING btree ("invited_email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invitations_token_hash_unique" ON "user_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invitations_legacy_user_unique" ON "user_invitations" USING btree ("legacy_invited_user_id");--> statement-breakpoint
WITH latest_product_tokens AS (
	SELECT DISTINCT ON (token.user_id)
		token.user_id,
		token.token_hash,
		token.expires_at,
		token.created_at,
		token.consumed_at
	FROM "admin_activation_tokens" AS token
	WHERE token.purpose = 'product_user'
	ORDER BY token.user_id, token.created_at DESC, token.id DESC
), attributable_invitations AS (
	SELECT
		token.*,
		identity.email,
		audit.actor_user_id,
		credential."createdAt" AS credential_created_at
	FROM latest_product_tokens AS token
	JOIN "user" AS identity ON identity.id = token.user_id
	JOIN LATERAL (
		SELECT event.actor_user_id
		FROM "admin_audit_events" AS event
		WHERE event.action = 'user.invite'
			AND event.outcome = 'success'
			AND event.target_id = token.user_id
			AND event.actor_user_id IS NOT NULL
		ORDER BY event.created_at ASC, event.id ASC
		LIMIT 1
	) AS audit ON true
	LEFT JOIN LATERAL (
		SELECT account."createdAt"
		FROM "account" AS account
		WHERE account."userId" = token.user_id
			AND account."providerId" = 'credential'
		ORDER BY account."createdAt" ASC
		LIMIT 1
	) AS credential ON true
)
INSERT INTO "user_invitations" (
	"inviter_user_id",
	"invited_email",
	"token_hash",
	"last_sent_at",
	"expires_at",
	"accepted_by_user_id",
	"accepted_at",
	"legacy_invited_user_id",
	"created_at",
	"updated_at"
)
SELECT
	actor_user_id,
	lower(email),
	CASE WHEN credential_created_at IS NULL THEN token_hash ELSE NULL END,
	created_at,
	expires_at,
	CASE WHEN credential_created_at IS NULL THEN NULL ELSE user_id END,
	credential_created_at,
	user_id,
	created_at,
	now()
FROM attributable_invitations
ON CONFLICT ("legacy_invited_user_id") DO NOTHING;--> statement-breakpoint
UPDATE "admin_roles"
SET
	permissions = COALESCE(
		(
			SELECT jsonb_agg(permission)
			FROM jsonb_array_elements(permissions) AS permission
			WHERE permission <> '"users.invite"'::jsonb
		),
		'[]'::jsonb
	),
	updated_at = now()
WHERE permissions @> '["users.invite"]'::jsonb;
