import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import * as resumeClient from "@/lib/resume/client";

import {
  fetchCurrentResumeDocument,
  fetchResumeEntriesPage,
  fetchResumeVersionSnapshots,
  ResumeValidationClientError,
  ResumeVersionConflictClientError,
  restoreResumeVersion,
  saveResumeDocument,
  updateResumeSummary,
  exportResumePdfDocument,
} from "@/lib/resume/client";

describe("fetchResumeEntriesPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a numbered and filtered resume catalog page", async () => {
    const page = {
      items: [],
      page: 2,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(page), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      fetchResumeEntriesPage({ page: 2, pageSize: 10, query: "frontend" }),
    ).resolves.toEqual(page);
    expect(fetch).toHaveBeenCalledWith(
      "/api/resumes?page=2&pageSize=10&q=frontend",
    );
  });
});

describe("exportResumePdfDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues the export instead of waiting for PDF bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            job: {
              id: "job-one",
              accessToken: "token-one",
              status: "queued",
            },
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await exportResumePdfDocument({ resumeId: "resume-demo" });

    expect(fetch).toHaveBeenCalledWith("/api/resumes/resume-demo/pdf", {
      method: "POST",
    });
  });
});

describe("fetchCurrentResumeDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the current cloud document for conflict comparison", async () => {
    const document = createDefaultResumeDocument();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            resume: { document, version: 7, updatedAt: 1200 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(fetchCurrentResumeDocument("resume-demo")).resolves.toEqual({
      document,
      version: 7,
      updatedAt: 1200,
    });
    expect(fetch).toHaveBeenCalledWith("/api/resumes/resume-demo");
  });
});

describe("saveResumeDocument", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a typed version conflict error for stale saves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "version_conflict",
            currentVersion: 7,
          }),
          {
            status: 409,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    let caughtError: unknown;

    try {
      await saveResumeDocument({
        resumeId: "resume-demo",
        version: 3,
        document: createDefaultResumeDocument(),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ResumeVersionConflictClientError);
    expect(caughtError).toMatchObject({
      currentVersion: 7,
    });
  });

  it("throws a typed validation error for rejected resume payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "resume_validation_failed",
            issues: [
              {
                code: "invalid_color",
                path: "settings.theme.accent",
                message: "Accent color must be a valid hex color.",
              },
            ],
          }),
          {
            status: 400,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    let caughtError: unknown;

    try {
      await saveResumeDocument({
        resumeId: "resume-demo",
        version: 3,
        document: createDefaultResumeDocument(),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(ResumeValidationClientError);
    expect(caughtError).toMatchObject({
      issues: [
        {
          code: "invalid_color",
          path: "settings.theme.accent",
        },
      ],
    });
  });

  it("sends summary-only updates through PATCH", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            resume: {
              summary: "Updated catalog summary",
              updatedAt: 900,
              version: 4,
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const result = await updateResumeSummary({
      resumeId: "resume-demo",
      summary: "Updated catalog summary",
      version: 3,
    });

    expect(result).toEqual({
      summary: "Updated catalog summary",
      updatedAt: 900,
      version: 4,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/resumes/resume-demo",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          summary: "Updated catalog summary",
          version: 3,
        }),
      }),
    );
  });
});

describe("resume version client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads version summaries without requesting their document payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              { id: "snapshot-1", version: 3, createdAt: 800 },
            ],
            page: 2,
            pageSize: 20,
            total: 21,
            totalPages: 2,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      fetchResumeVersionSnapshots("resume-demo", { page: 2, pageSize: 20 }),
    ).resolves.toEqual({
      items: [{ id: "snapshot-1", version: 3, createdAt: 800 }],
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/resumes/resume-demo/versions?page=2&pageSize=20",
    );
  });

  it("loads one complete version snapshot for comparison", async () => {
    const document = createDefaultResumeDocument();

    document.meta.title = "Historical document";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: {
              id: "snapshot-1",
              version: 3,
              createdAt: 800,
              document,
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const fetchVersionSnapshot = (
      resumeClient as typeof resumeClient & {
        fetchResumeVersionSnapshot: (params: {
          resumeId: string;
          snapshotId: string;
        }) => Promise<{
          id: string;
          version: number;
          createdAt: number;
          document: typeof document;
        }>;
      }
    ).fetchResumeVersionSnapshot;

    expect(fetchVersionSnapshot).toBeTypeOf("function");
    await expect(
      fetchVersionSnapshot({
        resumeId: "resume-demo",
        snapshotId: "snapshot-1",
      }),
    ).resolves.toEqual({
      id: "snapshot-1",
      version: 3,
      createdAt: 800,
      document,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/resumes/resume-demo/versions/snapshot-1",
    );
  });

  it("restores a version through the optimistic-lock endpoint", async () => {
    const document = createDefaultResumeDocument();

    document.meta.title = "Restored document";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            resume: { document, version: 6, updatedAt: 900 },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    await expect(
      restoreResumeVersion({
        resumeId: "resume-demo",
        snapshotId: "snapshot-1",
        version: 5,
      }),
    ).resolves.toEqual({ document, version: 6, updatedAt: 900 });
    expect(fetch).toHaveBeenCalledWith(
      "/api/resumes/resume-demo/versions/snapshot-1/restore",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ version: 5 }),
      }),
    );
  });
});
