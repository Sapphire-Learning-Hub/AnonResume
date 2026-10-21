import { randomUUID } from "node:crypto";
import {
  createResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";
import { getDatabasePool } from "@/lib/runtime/database";

const table = (name: string) =>
  `"${process.env.ANONRESUME_DB_SCHEMA}"."${name}"`;

describe("resume data protection constraints", () => {
  beforeEach(() => resetResumeRepository());
  afterEach(() => resetResumeRepository());

  it("retains active records and rejects inconsistent trash deadlines", async () => {
    await createResumeRecord("owner", "protected");
    const pool = getDatabasePool();
    await expect(
      pool.query(`SELECT deleted_at, purge_after FROM ${table("resumes")}`),
    ).resolves.toMatchObject({
      rows: [{ deleted_at: null, purge_after: null }],
    });
    for (const assignment of [
      "deleted_at = now()",
      "purge_after = now()",
      "deleted_at = now(), purge_after = now() - interval '1 day'",
    ]) {
      await expect(
        pool.query(`UPDATE ${table("resumes")} SET ${assignment}`),
      ).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("allows only one rolling snapshot per resume without limiting retained history", async () => {
    await createResumeRecord("owner", "protected");
    const pool = getDatabasePool();
    const insert = (kind: string) =>
      pool.query(
        `INSERT INTO ${table("resume_versions")} (id, user_id, resume_id, version, document, kind)
       SELECT $1, user_id, id, version, document, $2 FROM ${table("resumes")} WHERE id = 'protected'`,
        [randomUUID(), kind],
      );
    await insert("retained");
    await insert("retained");
    await insert("autosave");
    await expect(insert("autosave")).rejects.toMatchObject({ code: "23505" });
    await expect(insert("invalid")).rejects.toMatchObject({ code: "23514" });
  });
});
