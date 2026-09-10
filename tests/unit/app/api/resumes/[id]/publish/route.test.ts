import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOptionalSession } from "@/lib/auth-session";
import {
  createGeneratedResumeRecord,
  getResumeRecord,
  getPublishedResumeBySlug,
  resetResumeRepository,
} from "@/lib/resume-repository";

import { POST } from "@/app/api/resumes/[id]/publish/route";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("publish route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "classic",
      createId: () => "resume-fullstack",
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
    await resetResumeRepository();
  });

  it("publishes an unpublished resume and returns a public slug", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-fullstack/publish", {
        method: "POST",
        headers: {
          origin: "http://localhost",
        },
      }),
      {
        params: Promise.resolve({ id: "resume-fullstack" }),
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.resume.id).toBe("resume-fullstack");
    expect(body.resume.published).toBe(true);
    expect(body.resume.slug).toBe("resume-fullstack");
    expect((await getPublishedResumeBySlug("resume-fullstack"))?.id).toBe(
      "resume-fullstack",
    );
  });

  it("does not create and publish a missing resume", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-missing/publish", {
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

  it("rejects cross-origin publish requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/resumes/resume-fullstack/publish", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
        },
      }),
      {
        params: Promise.resolve({ id: "resume-fullstack" }),
      },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("forbidden");
  });
});
