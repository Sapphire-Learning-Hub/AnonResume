import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import { getOptionalSession } from "@/lib/auth-session";
import { MAX_ACTION_REQUEST_BYTES } from "@/lib/request-body";
import {
  createResumeRecord,
  resetResumeRepository,
  saveResumeRecord,
  snapshotResumeVersion,
} from "@/lib/resume-repository";

import { POST } from "@/app/api/resumes/[id]/versions/[snapshotId]/restore/route";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("restore resume version route", () => {
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

  it("restores the requested snapshot and advances the document version", async () => {
    const firstDocument = createDefaultResumeDocument();
    const currentDocument = createDefaultResumeDocument();

    firstDocument.meta.title = "Version one";
    currentDocument.meta.title = "Version two";

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

    const response = await POST(
      new Request(
        `http://localhost/api/resumes/resume-history/versions/${snapshot.id}/restore`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({ version: currentSave.version }),
        },
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
      resume: expect.objectContaining({
        version: currentSave.version + 1,
        title: "Version one",
      }),
    });
  });

  it("rejects oversized restore requests before JSON parsing", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/resumes/resume-history/versions/snapshot/restore",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost",
          },
          body: JSON.stringify({ padding: "x".repeat(MAX_ACTION_REQUEST_BYTES) }),
        },
      ),
      {
        params: Promise.resolve({
          id: "resume-history",
          snapshotId: "snapshot",
        }),
      },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "request_payload_too_large",
    });
  });
});
