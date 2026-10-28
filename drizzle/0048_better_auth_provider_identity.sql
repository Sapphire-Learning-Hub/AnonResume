-- Better Auth 1.7.3+ identifies accounts by providerId/accountId. Preserve the
-- legacy issuer values, but never merge ambiguous identities during upgrade.
DO $$
BEGIN
  IF to_regclass('account') IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('anonresume:account-provider-identity'));
  LOCK TABLE "account" IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1 FROM "account"
    GROUP BY "providerId", "accountId" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate provider account identities; inspect accounts before upgrading';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('account') AND attname = 'issuer'
      AND NOT attisdropped
  ) THEN
    ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
  END IF;

  DROP INDEX IF EXISTS "account_issuer_accountid_key";
  DROP INDEX IF EXISTS "account_issuer_accountId_uidx";
  CREATE UNIQUE INDEX IF NOT EXISTS "account_provider_accountid_key"
    ON "account" ("providerId", "accountId");
END $$;
