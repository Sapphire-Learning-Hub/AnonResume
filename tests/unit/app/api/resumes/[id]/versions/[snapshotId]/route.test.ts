import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { getOptionalSession } from "@/lib/auth/session";
import {
  createResumeRecord,
  resetResumeRepository,
  saveResumeRecord,
  snapshotResumeVersion,
} from "@/lib/resume/repository";

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("resume version detail route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-history" },
      user: { id: "user-history", name: "History User", email: "history@example.com" },
    } as never);
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("loads the requested snapshot document for the current user", async () => {
    const historicalDocument = createDefaultResumeDocument();

    historicalDocument.meta.title = "Historical document";
    await createResumeRecord("user-history", "resume-history");
    await saveResumeRecord({
      userId: "user-history",
      resumeId: "resume-history",
      version: 1,
      document: historicalDocument,
    });
    const snapshot = await snapshotResumeVersion("user-history", "resume-history");
    const { GET } = await import(
      "@/app/api/resumes/[id]/versions/[snapshotId]/route"
    );

    const response = await GET(
      new Request(
        `http://localhost/api/resumes/resume-history/versions/${snapshot.id}`,
      ),
      {
        params: Promise.resolve({
          id: "resume-history",
          snapshotId: snapshot.id,
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: expect.objectContaining({
        id: snapshot.id,
        version: snapshot.version,
        document: expect.objectContaining({
          meta: expect.objectContaining({ title: "Historical document" }),
        }),
      }),
    });
  });
});
