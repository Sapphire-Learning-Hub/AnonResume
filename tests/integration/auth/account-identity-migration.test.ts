import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { getDatabasePool } from "@/lib/runtime/database";

const migration = await readFile(
  resolve(process.cwd(), "drizzle/0048_better_auth_provider_identity.sql"),
  "utf8",
);
let client: PoolClient;
beforeEach(async () => {
  client = await getDatabasePool().connect();
  await client.query("BEGIN");
  await client.query(
    'CREATE TEMP TABLE account (id text PRIMARY KEY, "providerId" text NOT NULL, "accountId" text NOT NULL, issuer text NOT NULL) ON COMMIT DROP',
  );
  await client.query("SET LOCAL search_path TO pg_temp");
});
afterEach(async () => {
  await client.query("ROLLBACK");
  client.release();
});

it("preserves legacy identities and permits new accounts without issuer after repeated migration", async () => {
  await client.query("INSERT INTO account VALUES ($1,$2,$3,$4)", [
    "existing",
    "github",
    "123",
    "local:oauth:github",
  ]);
  await client.query(
    'CREATE UNIQUE INDEX account_issuer_accountid_key ON account (issuer, "accountId")',
  );
  await client.query(migration);
  await client.query(migration);
  await expect(
    client.query(
      'INSERT INTO account (id,"providerId","accountId") VALUES ($1,$2,$3)',
      ["new", "credential", "user-id"],
    ),
  ).resolves.toMatchObject({ rowCount: 1 });
  expect(
    (await client.query("SELECT * FROM account WHERE id = $1", ["existing"]))
      .rows,
  ).toEqual([
    {
      id: "existing",
      providerId: "github",
      accountId: "123",
      issuer: "local:oauth:github",
    },
  ]);
});

it("refuses ambiguous provider identities instead of silently merging accounts", async () => {
  await client.query("INSERT INTO account VALUES ($1,$2,$3,$4),($5,$2,$3,$6)", [
    "one",
    "github",
    "123",
    "issuer-one",
    "two",
    "issuer-two",
  ]);
  await expect(client.query(migration)).rejects.toThrow(
    /Duplicate provider account identities/,
  );
});

it("supports fresh schemas while allowing the same subject at different providers", async () => {
  await client.query("ALTER TABLE account DROP COLUMN issuer");
  await client.query(migration);
  await client.query("INSERT INTO account VALUES ($1,$2,$3),($4,$5,$3)", [
    "one",
    "github",
    "123",
    "two",
    "credential",
  ]);
  await expect(
    client.query("INSERT INTO account VALUES ($1,$2,$3)", [
      "duplicate",
      "github",
      "123",
    ]),
  ).rejects.toMatchObject({ code: "23505" });
});

it("does nothing before the authentication tables exist", async () => {
  await client.query("DROP TABLE account");
  await expect(client.query(migration)).resolves.toBeDefined();
  expect((await client.query("SELECT to_regclass('account') AS identity_table")).rows[0]?.identity_table).toBeNull();
});
