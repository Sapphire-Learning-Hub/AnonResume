import "fake-indexeddb/auto";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";

import { createResumeDraftRepository } from "@/lib/resume/drafts";

describe("createResumeDraftRepository", () => {
  it("stores and loads a local draft by resume id", async () => {
    const repository = createResumeDraftRepository({
      databaseName: `anonresume-test-${crypto.randomUUID()}`,
    });

    const draft = {
      resumeId: "resume-demo",
      document: createDefaultResumeDocument(),
      baseVersion: 3,
      updatedAt: 500,
    };

    await repository.saveDraft(draft);

    await expect(repository.getDraft("resume-demo")).resolves.toEqual(draft);
  });
});
