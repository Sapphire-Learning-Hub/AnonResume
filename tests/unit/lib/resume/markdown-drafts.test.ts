import "fake-indexeddb/auto";

import {
  createResumeMarkdownDraftRepository,
  type LocalResumeMarkdownDraft,
} from "@/lib/resume/markdown-drafts";

describe("createResumeMarkdownDraftRepository", () => {
  it("stores, loads, and deletes exact invalid Markdown source", async () => {
    const repository = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-${crypto.randomUUID()}`,
    });
    const draft: LocalResumeMarkdownDraft = {
      resumeId: "resume-demo",
      source: ":::group\n未闭合",
      baseVersion: 4,
      updatedAt: 500,
    };

    await repository.saveDraft(draft);
    await expect(repository.getDraft("resume-demo")).resolves.toEqual(draft);
    await repository.deleteDraft("resume-demo");
    await expect(repository.getDraft("resume-demo")).resolves.toBeUndefined();
  });

  it("does not let an older write replace a newer source draft", async () => {
    const databaseName = `anonresume-markdown-${crypto.randomUUID()}`;
    const first = createResumeMarkdownDraftRepository({ databaseName });
    const second = createResumeMarkdownDraftRepository({ databaseName });
    const newer: LocalResumeMarkdownDraft = {
      resumeId: "resume-demo",
      source: "newer invalid source",
      baseVersion: 8,
      updatedAt: 900,
    };
    await first.saveDraft(newer);
    await second.saveDraft({
      resumeId: "resume-demo",
      source: "older source",
      baseVersion: 7,
      updatedAt: 800,
    });

    await expect(first.getDraft("resume-demo")).resolves.toEqual(newer);
  });

  it("isolates repositories backed by different database names", async () => {
    const first = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-a-${crypto.randomUUID()}`,
    });
    const second = createResumeMarkdownDraftRepository({
      databaseName: `anonresume-markdown-b-${crypto.randomUUID()}`,
    });
    await first.saveDraft({
      resumeId: "resume-demo",
      source: "local source",
      baseVersion: 2,
      updatedAt: 300,
    });

    await expect(second.getDraft("resume-demo")).resolves.toBeUndefined();
  });
});
