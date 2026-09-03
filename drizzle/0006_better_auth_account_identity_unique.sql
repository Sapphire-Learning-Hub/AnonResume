CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountid_key"
  ON "account" ("issuer", "accountId");
