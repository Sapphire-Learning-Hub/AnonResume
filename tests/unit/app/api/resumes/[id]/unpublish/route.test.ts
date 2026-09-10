import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOptionalSession } from "@/lib/auth-session";
import {
  createGeneratedResumeRecord,
  getResumeRecord,
  getPublishedResumeBySlug,
  publishResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";

import { POST } from "@/app/api/resumes/[id]/unpublish/route";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("unpublish route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    await publishResumeRecord("user-demo", "resume-foundation");
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
    await resetResumeRepository();
  });

  it("unpublishes a resume and removes it from the public lookup", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-foundation/unpublish", {
        method: "POST",
        headers: {
          origin: "http://localhost",
        },
      }),
      {
        params: Promise.resolve({ id: "resume-foundation" }),
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.resume.id).toBe("resume-foundation");
    expect(body.resume.published).toBe(false);
    expect(body.resume.slug).toBe("resume-foundation");
    expect(await getPublishedResumeBySlug("resume-foundation")).toBeUndefined();
  });

  it("does not create a missing resume on unpublish", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-missing/unpublish", {
        method: "POST",
        headers: {
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

  it("rejects cross-origin unpublish requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-foundation/unpublish", {
        method: "POST",
        headers: {
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
