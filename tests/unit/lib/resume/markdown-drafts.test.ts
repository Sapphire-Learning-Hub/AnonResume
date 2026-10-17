import "fake-indexeddb/auto";

import {
  createResumeMarkdownDraftRepository,
  LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION,
  type LocalResumeMarkdownDraft,
} from "@/lib/resume/markdown-drafts";
import { serializeResumeMarkdown } from "@/domain/resume/markdown";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";

function createDraft(
  overrides: Partial<LocalResumeMarkdownDraft> = {},
): LocalResumeMarkdownDraft {
  const projection = serializeResumeMarkdown(
    createDefaultResumeDocument("zh-CN"),
    { baseDocumentVersion: overrides.baseVersion ?? 4 },
  ).projection;
  return {
    schemaVersion: LOCAL_RESUME_MARKDOWN_DRAFT_SCHEMA_VERSION,
    resumeId: "resume-demo",
    source: ":::group\n未闭合",
    baseVersion: 4,
    updatedAt: 500,
    projection,
    ...overrides,
  };
}

describe("createResumeMarkdownDraftRepository", () => {
  it("stores, loads, and deletes exact invalid Markdown source", async () => {
    const repository = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-${crypto.randomUUID()}`,
    });
    const draft = createDraft();

    await repository.saveDraft(draft);
    await expect(repository.getDraft("resume-demo")).resolves.toEqual(draft);
    await repository.deleteDraft("resume-demo");
    await expect(repository.getDraft("resume-demo")).resolves.toBeUndefined();
  });

  it("does not let an older write replace a newer source draft", async () => {
    const databaseName = `anonresume-markdown-${crypto.randomUUID()}`;
    const first = createResumeMarkdownDraftRepository({ databaseName });
    const second = createResumeMarkdownDraftRepository({ databaseName });
    const newer = createDraft({
      source: "newer invalid source",
      baseVersion: 8,
      updatedAt: 900,
    });
    await first.saveDraft(newer);
    await second.saveDraft(createDraft({
      source: "older source",
      baseVersion: 7,
      updatedAt: 800,
    }));

    await expect(first.getDraft("resume-demo")).resolves.toEqual(newer);
  });

  it("isolates repositories backed by different database names", async () => {
    const first = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-a-${crypto.randomUUID()}`,
    });
    const second = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-b-${crypto.randomUUID()}`,
    });
    await first.saveDraft(createDraft({
      source: "local source",
      baseVersion: 2,
      updatedAt: 300,
    }));

    await expect(second.getDraft("resume-demo")).resolves.toBeUndefined();
  });

  it("keeps a stale base version visible with its exact source and projection", async () => {
    const repository = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-${crypto.randomUUID()}`,
    });
    const draft = createDraft({
      source: "<!-- exact -->\n## 经历\n",
      baseVersion: 2,
    });

    await repository.saveDraft(draft);

    await expect(repository.getDraft("resume-demo")).resolves.toEqual(draft);
  });

  it("discards unsupported draft and projection versions", async () => {
    const repository = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-${crypto.randomUUID()}`,
    });
    const draft = createDraft();

    await repository.saveDraft({
      ...draft,
      schemaVersion: 2,
    } as unknown as LocalResumeMarkdownDraft);
    await expect(repository.getDraft("resume-demo")).resolves.toBeUndefined();

    await repository.saveDraft({
      ...draft,
      projection: { ...draft.projection, version: 2 },
      updatedAt: draft.updatedAt + 1,
    } as unknown as LocalResumeMarkdownDraft);
    await expect(repository.getDraft("resume-demo")).resolves.toBeUndefined();
  });
});
