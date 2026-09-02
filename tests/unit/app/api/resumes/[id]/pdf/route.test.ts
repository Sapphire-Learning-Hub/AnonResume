import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOptionalSession } from "@/lib/auth-session";
import {
  createGeneratedResumeRecord,
  getResumeRecord,
  listResumeVersionSnapshots,
  resetResumeRepository,
} from "@/lib/resume-repository";
import { getPdfExportStatus } from "@/lib/pdf-export-queue";

import { POST } from "@/app/api/resumes/[id]/pdf/route";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("pdf route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "foundation",
      createId: () => "resume-foundation",
    });
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: {
        id: "session-demo",
        userId: "user-demo",
      },
      user: {
        id: "user-demo",
        name: "Demo User",
        email: "demo@example.com",
      },
    } as never);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetResumeRepository();
  });

  it("returns the configured per-user limit when export admission is rejected", async () => {
    vi.stubEnv("PDF_EXPORT_MAX_ACTIVE_PER_USER", "1");
    const request = () =>
      POST(
        new Request("http://localhost/api/resumes/resume-foundation/pdf", {
          method: "POST",
          headers: {
            cookie: "better-auth.session_token=demo-session",
            origin: "http://localhost",
          },
        }),
        { params: Promise.resolve({ id: "resume-foundation" }) },
      );

    expect((await request()).status).toBe(202);
    const response = await request();

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "user_queue_limit",
      limit: 1,
    });
  });

  it("queues a PDF export for an owned resume", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-foundation/pdf", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=demo-session",
          origin: "http://localhost",
        },
      }),
      {
        params: Promise.resolve({ id: "resume-foundation" }),
      },
    );

    expect(response.status).toBe(202);
    const payload = await response.json();

    expect(payload.job).toMatchObject({
      id: expect.any(String),
      accessToken: expect.any(String),
      status: "queued",
    });
    await expect(
      getPdfExportStatus({
        jobId: payload.job.id,
        requesterUserId: "user-demo",
      }),
    ).resolves.toMatchObject({ status: "queued", position: 1 });
    expect(
      await listResumeVersionSnapshots("user-demo", "resume-foundation"),
    ).toHaveLength(0);
  });

  it("does not create a missing resume during pdf export", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-missing/pdf", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=demo-session",
          origin: "http://localhost",
        },
      }),
      {
        params: Promise.resolve({ id: "resume-missing" }),
      },
    );

    expect(response.status).toBe(404);
    expect(await getResumeRecord("user-demo", "resume-missing")).toBeUndefined();
  });

  it("rejects cross-origin pdf export requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-foundation/pdf", {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=demo-session",
          origin: "https://evil.example",
        },
      }),
      {
        params: Promise.resolve({ id: "resume-foundation" }),
      },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("forbidden");
  });
});
