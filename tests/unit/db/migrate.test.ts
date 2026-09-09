import { and, eq, sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db, getDatabaseSchemaName } from "@/db";
import { migrateDatabase } from "@/db/migrate";
import { pdfExportJobs, resumes, resumeVersions } from "@/db/schema";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { getDatabasePool } from "@/lib/database";

describe("database migrations", () => {
  beforeAll(async () => {
    const schemaName = getDatabaseSchemaName();

    await getDatabasePool().query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await migrateDatabase();
  });

  it("creates every v1 application table from an empty schema", async () => {
    const schemaName = getDatabaseSchemaName();
    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schemaName}
        AND table_name IN ('resumes', 'resume_versions', 'pdf_export_jobs')
      ORDER BY table_name
    `);

    expect(result.rows).toEqual([
      { table_name: "pdf_export_jobs" },
      { table_name: "resume_versions" },
      { table_name: "resumes" },
    ]);
  });

  it("creates composite indexes for paginated resume queries", async () => {
    const schemaName = getDatabaseSchemaName();
    const result = await getDatabasePool().query<{ indexname: string }>(
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = $1
          AND indexname IN (
            'resumes_user_updated_id_idx',
            'resume_versions_resume_created_id_idx'
          )
        ORDER BY indexname`,
      [schemaName],
    );

    expect(result.rows).toEqual([
      { indexname: "resume_versions_resume_created_id_idx" },
      { indexname: "resumes_user_updated_id_idx" },
    ]);
  });

  it("adds the Better Auth account issuer required by credential sign-up", async () => {
    const migration = await readFile(
      resolve(process.cwd(), "drizzle/0005_better_auth_account_issuer.sql"),
      "utf8",
    );

    expect(migration).toContain(
      'ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text NOT NULL',
    );
  });

  it("enforces unique Better Auth account identities", async () => {
    const migration = await readFile(
      resolve(
        process.cwd(),
        "drizzle/0006_better_auth_account_identity_unique.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountid_key"',
    );
    expect(migration).toContain('ON "account" ("issuer", "accountId")');
  });

  it("rejects duplicate public slugs at the database boundary", async () => {
    const document = createDefaultResumeDocument();

    await db.insert(resumes).values([
      {
        id: "resume-slug-one",
        userId: "user-one",
        name: "One",
        summary: "One",
        slug: "shared-slug",
        document,
      },
      {
        id: "resume-slug-two",
        userId: "user-two",
        name: "Two",
        summary: "Two",
        document,
      },
    ]);

    await expect(
      db
        .update(resumes)
        .set({ slug: "shared-slug" })
        .where(sql`${resumes.id} = 'resume-slug-two'`),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("cascades resume deletion to snapshots and PDF jobs", async () => {
    const document = createDefaultResumeDocument();

    await db.insert(resumes).values({
      id: "resume-cascade",
      userId: "user-cascade",
      name: "Cascade",
      summary: "Cascade",
      document,
    });
    await db.insert(resumeVersions).values({
      id: "snapshot-cascade",
      userId: "user-cascade",
      resumeId: "resume-cascade",
      version: 1,
      document,
    });
    await db.insert(pdfExportJobs).values({
      resumeUserId: "user-cascade",
      resumeId: "resume-cascade",
      requesterUserId: "user-cascade",
      accessTokenHash: "token-hash",
      document,
      filename: "resume.pdf",
    });

    await db.delete(resumes).where(sql`${resumes.id} = 'resume-cascade'`);

    await expect(
      db
        .select()
        .from(resumeVersions)
        .where(
          and(
            eq(resumeVersions.userId, "user-cascade"),
            eq(resumeVersions.resumeId, "resume-cascade"),
          ),
        ),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select()
        .from(pdfExportJobs)
        .where(
          and(
            eq(pdfExportJobs.resumeUserId, "user-cascade"),
            eq(pdfExportJobs.resumeId, "resume-cascade"),
          ),
        ),
    ).resolves.toHaveLength(0);
  });
});
