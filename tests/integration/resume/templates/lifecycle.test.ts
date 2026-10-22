import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db,
  resumes,
  resumeTemplates,
  resumeTemplateOperations,
  resumeVersions,
  accountLifecycle,
} from "@/db";
import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";
import { getDatabasePool } from "@/lib/runtime/database";
import {
  createGeneratedResumeRecord,
  deleteResumeRecord,
} from "@/lib/resume/repository";
import {
  savePersonalTemplate,
  getPersonalTemplate,
  listPersonalTemplates,
  replacePersonalTemplate,
  instantiatePersonalTemplate,
  deletePersonalTemplate,
  renamePersonalTemplate,
} from "@/lib/resume/templates/service";
import { getManagedConfigDefaults } from "@/lib/config/registry";

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: async () => ({ values: getManagedConfigDefaults() }),
}));

describe("personal template lifecycle", () => {
  const userId = `template-${randomUUID()}`;
  beforeEach(async () => {
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, 'Template test', $2, true, now(), now()) ON CONFLICT (id) DO NOTHING`,
      [userId, `${userId}@example.com`],
    );
  });
  afterEach(async () => {
    await db
      .delete(resumeTemplateOperations)
      .where(eq(resumeTemplateOperations.userId, userId));
    await db.delete(resumeTemplates).where(eq(resumeTemplates.userId, userId));
    await db.delete(resumes).where(eq(resumes.userId, userId));
    await db
      .delete(accountLifecycle)
      .where(eq(accountLifecycle.userId, userId));
    await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [userId]);
  });
  async function source() {
    return createGeneratedResumeRecord({
      userId,
      document: createResumeDocumentFromTemplate("modular", "zh-CN"),
    });
  }

  it("keeps an independent full snapshot after its source is trashed and creates a private fresh resume", async () => {
    const resume = await source();
    const input = {
      resumeId: resume.id,
      sourceVersion: resume.version,
      name: " 我的模板 ",
      operationId: randomUUID(),
    };
    const saved = await savePersonalTemplate(userId, input);
    await deleteResumeRecord(userId, resume.id);
    const detail = await getPersonalTemplate(userId, saved.templateId);
    expect(detail.name).toBe("我的模板");
    expect(detail.document).toEqual(resume.document);
    const created = await instantiatePersonalTemplate(userId, {
      templateId: detail.id,
      templateVersion: detail.version,
      operationId: randomUUID(),
      locale: "zh-CN",
    });
    const [row] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.id, created.resumeId));
    expect(row).toMatchObject({
      userId,
      name: "我的模板",
      published: false,
      slug: null,
      version: 1,
    });
    expect(
      await db
        .select()
        .from(resumeVersions)
        .where(eq(resumeVersions.resumeId, created.resumeId)),
    ).toEqual([]);
    await deletePersonalTemplate({
      userId,
      templateId: detail.id,
      version: detail.version,
    });
    expect(
      (await db.select().from(resumes).where(eq(resumes.id, created.resumeId)))
        .length,
    ).toBe(1);
    await expect(savePersonalTemplate(userId, input)).rejects.toMatchObject({
      code: "template_not_found",
    });
  });

  it("isolates every operation by owner and enforces optimistic versions", async () => {
    const resume = await source();
    const saved = await savePersonalTemplate(userId, {
      resumeId: resume.id,
      sourceVersion: 1,
      name: "A",
      operationId: randomUUID(),
    });
    expect((await listPersonalTemplates({ userId: "other" })).items).toEqual(
      [],
    );
    await expect(
      getPersonalTemplate("other", saved.templateId),
    ).rejects.toMatchObject({ code: "template_not_found" });
    await expect(
      deletePersonalTemplate({
        userId,
        templateId: saved.templateId,
        version: 9,
      }),
    ).rejects.toMatchObject({ code: "template_version_conflict" });
    await renamePersonalTemplate({
      userId,
      templateId: saved.templateId,
      version: 1,
      name: "B",
    });
    await expect(
      replacePersonalTemplate(userId, {
        templateId: saved.templateId,
        templateVersion: 1,
        resumeId: resume.id,
        sourceVersion: 1,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "template_version_conflict" });
    await expect(
      instantiatePersonalTemplate(userId, {
        templateId: saved.templateId,
        templateVersion: 1,
        operationId: randomUUID(),
        locale: "en-US",
      }),
    ).rejects.toMatchObject({ code: "template_version_conflict" });
  });

  it("deduplicates concurrent requests and rejects reuse with different input", async () => {
    const resume = await source();
    const input = {
      resumeId: resume.id,
      sourceVersion: 1,
      name: "A",
      operationId: randomUUID(),
    };
    const [first, second] = await Promise.all([
      savePersonalTemplate(userId, input),
      savePersonalTemplate(userId, input),
    ]);
    expect(first).toEqual(second);
    expect((await listPersonalTemplates({ userId })).items).toHaveLength(1);
    await expect(
      savePersonalTemplate(userId, { ...input, name: "B" }),
    ).rejects.toMatchObject({ code: "template_operation_conflict" });
    const create = {
      templateId: first.templateId,
      templateVersion: 1,
      operationId: randomUUID(),
      locale: "en-US" as const,
    };
    expect(await instantiatePersonalTemplate(userId, create)).toEqual(
      await instantiatePersonalTemplate(userId, create),
    );
    const results = await Promise.allSettled([
      renamePersonalTemplate({
        userId,
        templateId: first.templateId,
        version: 1,
        name: "C",
      }),
      renamePersonalTemplate({
        userId,
        templateId: first.templateId,
        version: 1,
        name: "D",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("paginates summaries and treats wildcard characters literally", async () => {
    const resume = await source();
    await db.insert(resumeTemplates).values(
      Array.from({ length: 22 }, (_, i) => ({
        id: randomUUID(),
        userId,
        name: `中文%_ ${i}`,
        document: resume.document,
        updatedAt: new Date("2026-01-01Z"),
      })),
    );
    const first = await listPersonalTemplates({ userId, query: "%_" });
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).not.toHaveProperty("document");
    const next = await listPersonalTemplates({
      userId,
      query: "%_",
      cursor: first.nextCursor!,
    });
    expect(next.items).toHaveLength(2);
    expect(
      new Set([...first.items, ...next.items].map((item) => item.id)).size,
    ).toBe(22);
    await expect(
      listPersonalTemplates({
        userId,
        query: "other",
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects stale sources and invalid documents without preventing removal", async () => {
    const resume = await source();
    await expect(
      savePersonalTemplate(userId, {
        resumeId: resume.id,
        sourceVersion: 99,
        name: "A",
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "template_source_conflict" });
    const id = randomUUID();
    await db
      .insert(resumeTemplates)
      .values({ id, userId, name: "broken", document: { schemaVersion: 999 } });
    expect((await listPersonalTemplates({ userId })).items).toHaveLength(1);
    await expect(getPersonalTemplate(userId, id)).rejects.toMatchObject({
      code: "template_document_unavailable",
    });
    await deletePersonalTemplate({ userId, templateId: id, version: 1 });
    expect((await listPersonalTemplates({ userId })).items).toEqual([]);
  });

  it("serializes new writes against an account entering the deletion cooling period", async () => {
    const resume = await source();
    let release!: () => void;
    let ready!: () => void;
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deletion = db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`anonresume:account-deletion:${userId}`}))`,
      );
      await tx.insert(accountLifecycle).values({
        userId,
        status: "pending_deletion",
        deletionRequestedAt: new Date(),
        deletionDueAt: new Date(Date.now() + 7 * 86_400_000),
      });
      ready();
      await barrier;
    });
    await locked;
    const pending = savePersonalTemplate(userId, {
      resumeId: resume.id,
      sourceVersion: 1,
      name: "Blocked",
      operationId: randomUUID(),
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: "template_account_unavailable",
    });
    release();
    await deletion;
    await assertion;
    expect((await listPersonalTemplates({ userId })).items).toEqual([]);
  });

  it("rejects another active account across source reads and all template mutations", async () => {
    const other = `other-${randomUUID()}`;
    await getDatabasePool().query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, 'Other', $2, true, now(), now())`,
      [other, `${other}@example.com`],
    );
    try {
      const resume = await source();
      const template = await savePersonalTemplate(userId, {
        resumeId: resume.id,
        sourceVersion: 1,
        name: "Private",
        operationId: randomUUID(),
      });
      await expect(
        savePersonalTemplate(other, {
          resumeId: resume.id,
          sourceVersion: 1,
          name: "Stolen",
          operationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "template_not_found" });
      await expect(
        renamePersonalTemplate({
          userId: other,
          templateId: template.templateId,
          version: 1,
          name: "Changed",
        }),
      ).rejects.toMatchObject({ code: "template_not_found" });
      await expect(
        deletePersonalTemplate({
          userId: other,
          templateId: template.templateId,
          version: 1,
        }),
      ).rejects.toMatchObject({ code: "template_not_found" });
      await expect(
        replacePersonalTemplate(other, {
          templateId: template.templateId,
          templateVersion: 1,
          resumeId: resume.id,
          sourceVersion: 1,
          operationId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "template_not_found" });
      await expect(
        instantiatePersonalTemplate(other, {
          templateId: template.templateId,
          templateVersion: 1,
          operationId: randomUUID(),
          locale: "zh-CN",
        }),
      ).rejects.toMatchObject({ code: "template_not_found" });
      expect(
        (await getPersonalTemplate(userId, template.templateId)).name,
      ).toBe("Private");
    } finally {
      await getDatabasePool().query(`DELETE FROM "user" WHERE id = $1`, [
        other,
      ]);
    }
  });
});
