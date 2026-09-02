import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOptionalSession } from "@/lib/auth-session";
import { getPdfExportStatus } from "@/lib/pdf-export-queue";
import {
  createGeneratedResumeRecord,
  publishResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";

import { POST } from "@/app/resume/[slug]/pdf/route";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("public resume pdf route", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.mocked(getOptionalSession).mockResolvedValue(null);
    await resetResumeRepository();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetResumeRepository();
  });

  it("rejects anonymous public PDF exports by default", async () => {
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "foundation",
      createId: () => "resume-foundation",
    });
    const published = await publishResumeRecord("user-demo", "resume-foundation");
    const response = await POST(
      new Request(`http://localhost/resume/${published.slug}/pdf`, {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ slug: published.slug! }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "anonymous_pdf_export_disabled",
    });
  });

  it("allows anonymous public PDF exports only with the explicit override", async () => {
    vi.stubEnv("PDF_EXPORT_ALLOW_ANONYMOUS", "true");
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "foundation",
      createId: () => "resume-foundation",
    });
    const published = await publishResumeRecord("user-demo", "resume-foundation");
    const response = await POST(
      new Request(`http://localhost/resume/${published.slug}/pdf`, {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ slug: published.slug! }) },
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
        accessToken: payload.job.accessToken,
      }),
    ).resolves.toMatchObject({ status: "queued" });
  });

  it("returns 404 when the public slug is unavailable", async () => {
    const response = await POST(
      new Request("http://localhost/resume/not-published/pdf", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ slug: "not-published" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
