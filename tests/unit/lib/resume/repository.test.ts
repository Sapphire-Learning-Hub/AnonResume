import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { createRichTextFromPlainText } from "@/domain/resume/operations";
import { getManagedConfigDefaults } from "@/lib/config/registry";
import { getDatabasePool } from "@/lib/runtime/database";

const runtimeConfig = vi.hoisted(() => ({
  values: null as ReturnType<typeof getManagedConfigDefaults> | null,
}));

vi.mock("@/lib/config/runtime", () => ({
  getRuntimeConfig: vi.fn(async () => ({
    values: runtimeConfig.values,
  })),
}));

import {
  createGeneratedResumeRecord,
  createResumeRecord,
  deleteResumeRecord,
  duplicateResumeRecord,
  duplicateGeneratedResumeRecord,
  getResumeRecord,
  getOrCreateResumeRecord,
  paginateResumeEntries,
  paginateResumeVersionSnapshots,
  getPublishedResumeBySlug,
  publishResumeRecord,
  ResumeIdentifierConflictError,
  resetResumeRepository,
  restoreResumeVersion,
  saveResumeRecord,
  snapshotResumeVersion,
} from "@/lib/resume/repository";

async function listResumeEntries(userId: string) {
  return (
    await paginateResumeEntries({ userId, page: 1, pageSize: 100 })
  ).items;
}

async function listResumeVersionSnapshots(userId: string, resumeId: string) {
  return (
    await paginateResumeVersionSnapshots({
      userId,
      resumeId,
      page: 1,
      pageSize: 100,
    })
  ).items;
}

describe("resume repository persistence", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    runtimeConfig.values = getManagedConfigDefaults();
    await resetResumeRepository();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetResumeRepository();
  });

  it("keeps a new user's resume list empty across repeated reads", async () => {
    await expect(listResumeEntries("new-user")).resolves.toEqual([]);
    await expect(listResumeEntries("new-user")).resolves.toEqual([]);
  });

  it("paginates a user's resume catalog with stable ordering", async () => {
    for (const [index, title] of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].entries()) {
      const document = createDefaultResumeDocument();
      const resumeId = `resume-page-${index}`;
      document.meta.title = title;
      await createResumeRecord("user-page", resumeId);
      await saveResumeRecord({
        userId: "user-page",
        resumeId,
        version: 1,
        document,
      });
      await getDatabasePool().query(
        `UPDATE "${process.env.ANONRESUME_DB_SCHEMA || "public"}".resumes
            SET updated_at = $1
          WHERE user_id = $2 AND id = $3`,
        [new Date(Date.UTC(2026, 0, index + 1)), "user-page", resumeId],
      );
    }

    const result = await paginateResumeEntries({
      userId: "user-page",
      page: 2,
      pageSize: 2,
    });

    expect(result).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
    expect(result.items.map((resume) => resume.title)).toEqual([
      "Charlie",
      "Bravo",
    ]);
  });

  it("searches the full scoped resume catalog before paginating", async () => {
    for (const [userId, resumeId, title] of [
      ["user-search", "resume-frontend", "Frontend Engineer"],
      ["user-search", "resume-backend", "Backend Engineer"],
      ["user-other", "resume-other-frontend", "Frontend Manager"],
    ] as const) {
      const document = createDefaultResumeDocument();
      document.meta.title = title;
      await createResumeRecord(userId, resumeId);
      await saveResumeRecord({ userId, resumeId, version: 1, document });
    }

    const result = await paginateResumeEntries({
      userId: "user-search",
      page: 8,
      pageSize: 1,
      query: "frontEND",
    });

    expect(result).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    expect(result.items.map((resume) => resume.id)).toEqual(["resume-frontend"]);
  });

  it("does not recreate a user's last deleted resume", async () => {
    await createResumeRecord("user-empty", "resume-only");
    await deleteResumeRecord("user-empty", "resume-only");

    await expect(listResumeEntries("user-empty")).resolves.toEqual([]);
  });

  it("creates a generated resume from the selected template", async () => {
    const created = await createGeneratedResumeRecord({
      userId: "user-template",
      locale: "zh-CN",
      templateId: "modular",
    });

    expect(created.title).toBe("等宽模块简历");
    expect(created.version).toBe(1);
    expect(created.document.meta.title).toBe("等宽模块简历");
  });

  it("creates a generated resume from a validated imported document", async () => {
    const document = createDefaultResumeDocument();

    document.meta.title = "Imported Markdown Resume";
    document.meta.import = {
      format: "markdown",
      dialect: "mujicv",
      importedAt: "2026-09-01T14:00:00.000Z",
      originalSource: "# Imported Markdown Resume",
      diagnostics: [],
    };

    const created = await createGeneratedResumeRecord({
      userId: "user-import",
      locale: "zh-CN",
      document,
      createId: () => "resume-imported",
    });

    expect(created).toMatchObject({
      id: "resume-imported",
      title: "Imported Markdown Resume",
      version: 1,
      document,
    });
  });

  it("rejects conflicting template and imported document inputs", async () => {
    await expect(
      createGeneratedResumeRecord({
        userId: "user-invalid-import",
        locale: "zh-CN",
        templateId: "blank",
        document: createDefaultResumeDocument(),
      }),
    ).rejects.toThrow("mutually exclusive");
  });

  it("writes saved resume records into postgres storage", async () => {
    const document = createDefaultResumeDocument();

    document.meta.title = "Database Resume";
    await createResumeRecord("user-a", "resume-database");

    await saveResumeRecord({
      userId: "user-a",
      resumeId: "resume-database",
      version: 1,
      document,
    });

    const schemaName = process.env.ANONRESUME_DB_SCHEMA || "public";
    const result = await getDatabasePool().query(
      `SELECT user_id, id, name, version, published
         FROM "${schemaName}"."resumes"
        WHERE user_id = $1 AND id = $2`,
      ["user-a", "resume-database"],
    );

    expect(result.rows).toEqual([
      {
        user_id: "user-a",
        id: "resume-database",
        name: "Database Resume",
        version: 2,
        published: false,
      },
    ]);
  });

  it("builds catalog summaries from visible content instead of section labels", async () => {
    const document = createDefaultResumeDocument();
    const firstBlock = document.sections[0]?.blocks[0];

    if (!firstBlock || firstBlock.type !== "text") {
      throw new Error("Default profile must start with a text block");
    }

    document.sections[0]!.title = createRichTextFromPlainText("Profile");
    firstBlock.content = createRichTextFromPlainText(
      "Meaningful opening statement for recruiters",
    );
    await createResumeRecord("user-summary", "resume-summary");
    await saveResumeRecord({
      userId: "user-summary",
      resumeId: "resume-summary",
      version: 1,
      document,
    });

    const schemaName = process.env.ANONRESUME_DB_SCHEMA || "public";
    await getDatabasePool().query(
      `UPDATE "${schemaName}"."resumes"
          SET summary = $1
        WHERE user_id = $2 AND id = $3`,
      ["Profile", "user-summary", "resume-summary"],
    );

    const entry = (await listResumeEntries("user-summary")).find(
      (resume) => resume.id === "resume-summary",
    );

    expect(entry?.summary).toBe("Meaningful opening statement for recruiters");
  });

  it("truncates long catalog summaries without changing resume content", async () => {
    const document = createDefaultResumeDocument();
    const firstBlock = document.sections[0]?.blocks[0];
    const longSummary = "a".repeat(180);

    if (!firstBlock || firstBlock.type !== "text") {
      throw new Error("Default profile must start with a text block");
    }

    firstBlock.content = createRichTextFromPlainText(longSummary);
    await createResumeRecord("user-summary", "resume-long-summary");
    await saveResumeRecord({
      userId: "user-summary",
      resumeId: "resume-long-summary",
      version: 1,
      document,
    });

    const entry = (await listResumeEntries("user-summary")).find(
      (resume) => resume.id === "resume-long-summary",
    );

    expect(entry?.summary).toBe(`${"a".repeat(157)}...`);
    const saved = await getResumeRecord("user-summary", "resume-long-summary");

    expect(saved?.document.sections[0]?.blocks[0]).toMatchObject({
      content: createRichTextFromPlainText(longSummary),
    });
  });

  it("preserves a custom catalog summary when the resume document is saved later", async () => {
    const document = createDefaultResumeDocument();
    const firstBlock = document.sections[0]?.blocks[0];

    if (!firstBlock || firstBlock.type !== "text") {
      throw new Error("Default profile must start with a text block");
    }

    await createResumeRecord("user-custom-summary", "resume-custom-summary");

    const summarySave = await saveResumeRecord({
      userId: "user-custom-summary",
      resumeId: "resume-custom-summary",
      version: 1,
      summary: "Frontend platform engineer focused on design systems.",
      document,
    });

    firstBlock.content = createRichTextFromPlainText(
      "This later document edit must not replace the catalog summary.",
    );
    await saveResumeRecord({
      userId: "user-custom-summary",
      resumeId: "resume-custom-summary",
      version: summarySave.version,
      document,
    });

    const entry = (await listResumeEntries("user-custom-summary")).find(
      (resume) => resume.id === "resume-custom-summary",
    );
    const record = await getResumeRecord(
      "user-custom-summary",
      "resume-custom-summary",
    );

    expect(entry?.summary).toBe(
      "Frontend platform engineer focused on design systems.",
    );
    expect(record?.summary).toBe(
      "Frontend platform engineer focused on design systems.",
    );
  });

  it("persists saved resume documents across repository resets", async () => {
    const document = createDefaultResumeDocument();
    document.meta.title = "Persisted Resume";
    await createResumeRecord("__legacy_single_user__", "resume-persisted");

    const saved = await saveResumeRecord({
      resumeId: "resume-persisted",
      version: 1,
      document,
    });

    expect(saved.version).toBe(2);
    expect(
      await listResumeVersionSnapshots("__legacy_single_user__", "resume-persisted"),
    ).toEqual([]);

    await resetResumeRepository({ preservePersistedData: true });

    const loaded = await getOrCreateResumeRecord("resume-persisted");

    expect(loaded.title).toBe("Persisted Resume");
    expect(loaded.version).toBe(2);
    expect(loaded.document.meta.title).toBe("Persisted Resume");
  });

  it("persists published slugs across repository resets", async () => {
    await createGeneratedResumeRecord({
      userId: "__legacy_single_user__",
      templateId: "classic",
      createId: () => "resume-fullstack",
    });
    const published = await publishResumeRecord("resume-fullstack");

    expect(published.slug).toBe("resume-fullstack");
    expect(
      await listResumeVersionSnapshots("__legacy_single_user__", "resume-fullstack"),
    ).toHaveLength(1);

    await resetResumeRepository({ preservePersistedData: true });

    expect((await getPublishedResumeBySlug("resume-fullstack"))?.id).toBe(
      "resume-fullstack",
    );
  });

  it("enforces globally unique resume ids across users", async () => {
    await createResumeRecord("user-a", "resume-shared");

    await expect(
      createResumeRecord("user-b", "resume-shared"),
    ).rejects.toBeInstanceOf(ResumeIdentifierConflictError);
    await expect(getResumeRecord("user-b", "resume-shared")).resolves.toBeUndefined();
  });

  it("derives first-publication slugs from globally unique resume ids", async () => {
    const firstDocument = createDefaultResumeDocument();
    const secondDocument = createDefaultResumeDocument();

    firstDocument.meta.title = "none";
    secondDocument.meta.title = "none";
    await createResumeRecord("user-demo", "resume-first");
    await createResumeRecord("user-demo", "resume-second");
    await saveResumeRecord({
      userId: "user-demo",
      resumeId: "resume-first",
      version: 1,
      document: firstDocument,
    });
    await saveResumeRecord({
      userId: "user-demo",
      resumeId: "resume-second",
      version: 1,
      document: secondDocument,
    });

    await expect(publishResumeRecord("user-demo", "resume-first")).resolves.toMatchObject({
      slug: "resume-first",
    });
    await expect(publishResumeRecord("user-demo", "resume-second")).resolves.toMatchObject({
      slug: "resume-second",
    });
  });

  it("records a snapshot when a resume is published", async () => {
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    await publishResumeRecord("user-demo", "resume-foundation");

    const snapshots = await listResumeVersionSnapshots(
      "user-demo",
      "resume-foundation",
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      userId: "user-demo",
      resumeId: "resume-foundation",
      version: 1,
    });
    expect(snapshots[0]?.document.meta.title).toBe("居中叙事简历");
  });

  it("retains only the configured maximum number of version snapshots", async () => {
    runtimeConfig.values = {
      ...getManagedConfigDefaults(),
      resumeVersionHistoryLimit: 2,
    };
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });

    await snapshotResumeVersion("user-demo", "resume-foundation");
    await snapshotResumeVersion("user-demo", "resume-foundation");
    await snapshotResumeVersion("user-demo", "resume-foundation");

    await expect(
      listResumeVersionSnapshots("user-demo", "resume-foundation"),
    ).resolves.toHaveLength(2);
  });

  it("paginates retained version snapshots", async () => {
    runtimeConfig.values = {
      ...getManagedConfigDefaults(),
      resumeVersionHistoryLimit: 10,
    };
    await createResumeRecord("user-history-page", "resume-history-page");
    for (let index = 0; index < 5; index += 1) {
      await snapshotResumeVersion("user-history-page", "resume-history-page");
    }

    const first = await paginateResumeVersionSnapshots({
      userId: "user-history-page",
      resumeId: "resume-history-page",
      page: 1,
      pageSize: 2,
    });
    const last = await paginateResumeVersionSnapshots({
      userId: "user-history-page",
      resumeId: "resume-history-page",
      page: 99,
      pageSize: 2,
    });

    expect(first).toMatchObject({ page: 1, total: 5, totalPages: 3 });
    expect(first.items).toHaveLength(2);
    expect(last).toMatchObject({ page: 3, total: 5, totalPages: 3 });
    expect(last.items).toHaveLength(1);
    expect(last.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it("deletes only the selected user's resume and its version history", async () => {
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    await createResumeRecord("user-other", "resume-other-foundation");
    await snapshotResumeVersion("user-demo", "resume-foundation");
    await snapshotResumeVersion("user-other", "resume-other-foundation");

    await deleteResumeRecord("user-demo", "resume-foundation");

    await expect(getResumeRecord("user-demo", "resume-foundation")).resolves.toBeUndefined();
    await expect(
      listResumeVersionSnapshots("user-demo", "resume-foundation"),
    ).resolves.toEqual([]);
    await expect(getResumeRecord("user-other", "resume-other-foundation")).resolves.toMatchObject({
      id: "resume-other-foundation",
      userId: "user-other",
    });
    await expect(
      listResumeVersionSnapshots("user-other", "resume-other-foundation"),
    ).resolves.toHaveLength(1);
  });

  it("rejects a generated resume identifier already owned by another user", async () => {
    const resumeId = "resume-20260830-160000-00000000-0000-4000-8000-000000000000";

    await createResumeRecord("user-a", resumeId);

    await expect(createResumeRecord("user-b", resumeId)).rejects.toMatchObject({
      name: "ResumeIdentifierConflictError",
      resumeId,
    });
  });

  it("retries generated identifiers when an identifier collision is detected", async () => {
    const collidingId = "resume-20260830-160001-00000000-0000-4000-8000-000000000000";
    const availableId = "resume-20260830-160001-00000000-0000-4000-8000-000000000001";
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce(collidingId)
      .mockReturnValueOnce(availableId);

    await createResumeRecord("user-a", collidingId);

    await expect(
      createGeneratedResumeRecord({
        userId: "user-b",
        createId,
      }),
    ).resolves.toMatchObject({
      id: availableId,
      userId: "user-b",
    });
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("retries generated identifiers when duplicating a resume", async () => {
    const collidingId = "resume-20260830-160002-00000000-0000-4000-8000-000000000000";
    const availableId = "resume-20260830-160002-00000000-0000-4000-8000-000000000001";
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce(collidingId)
      .mockReturnValueOnce(availableId);

    await createResumeRecord("user-copy", "resume-source");
    await createResumeRecord("user-copy", collidingId);

    await expect(
      duplicateGeneratedResumeRecord({
        userId: "user-copy",
        resumeId: "resume-source",
        title: "Resume source copy",
        createId,
      }),
    ).resolves.toMatchObject({
      id: availableId,
      title: "Resume source copy",
    });
    expect(createId).toHaveBeenCalledTimes(2);
  });

  it("includes publication state and edit time in scoped catalog entries", async () => {
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    await publishResumeRecord("user-demo", "resume-foundation");

    const entry = (await listResumeEntries("user-demo")).find(
      (resume) => resume.id === "resume-foundation",
    );

    expect(entry).toMatchObject({
      id: "resume-foundation",
      published: true,
      slug: "resume-foundation",
      updatedAt: expect.any(Number),
    });
  });

  it("restores a snapshot without discarding the current resume version", async () => {
    const firstDocument = createDefaultResumeDocument();
    const currentDocument = createDefaultResumeDocument();

    firstDocument.meta.title = "First saved version";
    currentDocument.meta.title = "Current version";

    await createResumeRecord("user-history", "resume-history");
    const firstSave = await saveResumeRecord({
      userId: "user-history",
      resumeId: "resume-history",
      version: 1,
      document: firstDocument,
    });
    const snapshot = await snapshotResumeVersion("user-history", "resume-history");
    const currentSave = await saveResumeRecord({
      userId: "user-history",
      resumeId: "resume-history",
      version: firstSave.version,
      document: currentDocument,
    });

    const restored = await restoreResumeVersion({
      userId: "user-history",
      resumeId: "resume-history",
      snapshotId: snapshot.id,
      version: currentSave.version,
    });

    expect(restored).toMatchObject({
      version: currentSave.version + 1,
      title: "First saved version",
    });
    expect(restored.document.meta.title).toBe("First saved version");
    await expect(listResumeVersionSnapshots("user-history", "resume-history")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: snapshot.id,
          document: expect.objectContaining({
            meta: expect.objectContaining({ title: "First saved version" }),
          }),
        }),
        expect.objectContaining({
          document: expect.objectContaining({
            meta: expect.objectContaining({ title: "Current version" }),
          }),
        }),
      ]),
    );
  });

  it("creates an unpublished, independently editable copy of a resume", async () => {
    const sourceDocument = createDefaultResumeDocument();

    sourceDocument.meta.title = "Source resume";
    await createResumeRecord("user-copy", "resume-source");
    await saveResumeRecord({
      userId: "user-copy",
      resumeId: "resume-source",
      version: 1,
      document: sourceDocument,
    });

    const copy = await duplicateResumeRecord({
      userId: "user-copy",
      resumeId: "resume-source",
      copyId: "resume-copy",
      title: "Source resume - Copy",
    });

    expect(copy).toMatchObject({
      id: "resume-copy",
      title: "Source resume - Copy",
      version: 1,
      published: false,
    });
    expect(copy.document).not.toBe(sourceDocument);
    expect(copy.document.meta.title).toBe("Source resume - Copy");

    copy.document.meta.title = "Edited copy";

    expect((await getOrCreateResumeRecord("user-copy", "resume-source")).title).toBe(
      "Source resume",
    );
  });
});
