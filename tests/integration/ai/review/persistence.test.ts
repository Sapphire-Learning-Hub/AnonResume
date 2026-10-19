import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { aiModels, aiProviderCredentials, aiRuns, db, resumes } from "@/db";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";

describe("review run storage", () => {
  it("accepts a message-free review but rejects a message-free conversation", async () => {
    const userId = randomUUID();
    const resumeId = randomUUID();
    const [provider] = await db.insert(aiProviderCredentials).values({ kind: "platform", displayName: "Review fixture", baseUrl: "https://example.com", encryptedApiKey: Buffer.from("fixture") }).returning();
    const [model] = await db.insert(aiModels).values({ providerId: provider!.id, providerModelKey: "review", displayName: "Review", contextWindow: 32000, maxOutputTokens: 4096, inputPointRate: 1, cachedInputPointRate: 0, outputPointRate: 1 }).returning();
    await db.insert(resumes).values({ id: resumeId, userId, name: "Review", summary: "", document: createDefaultResumeDocument("en-US") });
    const base = { userId, resumeId, modelId: model!.id, keySource: "platform" as const, status: "complete" as const, resumeVersion: 1, contextHash: "fixture", promptVersion: 1 };
    try {
      await expect(db.insert(aiRuns).values({ ...base, kind: "resume_review" })).resolves.toBeDefined();
      await expect(db.insert(aiRuns).values(base)).rejects.toThrow();
      await expect(db.insert(aiRuns).values({ ...base, kind: "resume_review", resumeId: randomUUID() })).rejects.toThrow();
    } finally {
      await db.delete(resumes).where(eq(resumes.id, resumeId));
      await db.delete(aiProviderCredentials).where(eq(aiProviderCredentials.id, provider!.id));
    }
  });
});
