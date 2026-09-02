import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireSession } from "@/lib/auth-session";
import { MAX_ACTION_REQUEST_BYTES } from "@/lib/request-body";
import {
  createGeneratedResumeRecord,
  getResumeRecord,
  resetResumeRepository,
} from "@/lib/resume-repository";

import { POST } from "@/app/app/resumes/[id]/duplicate/route";

vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(),
}));

describe("duplicate resume route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "foundation",
      createId: () => "resume-foundation",
    });
    vi.mocked(requireSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-demo" },
      user: { id: "user-demo", name: "Demo User", email: "demo@example.com" },
    } as never);
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("creates an unpublished copy and redirects to its editor", async () => {
    const response = await POST(
      new Request("http://localhost/app/resumes/resume-foundation/duplicate", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(307);

    const copyId = response.headers.get("location")?.split("/").at(-1);

    expect(copyId).toMatch(/^resume-\d{8}-\d{6}-[0-9a-f-]{36}$/i);
    await expect(getResumeRecord("user-demo", copyId!)).resolves.toMatchObject({
      id: copyId,
      title: "基础版简历 - 副本",
      published: false,
      version: 1,
    });
  });

  it("rejects cross-origin duplicate requests", async () => {
    const response = await POST(
      new Request("http://localhost/app/resumes/resume-foundation/duplicate", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns a mobile duplicate action to the workbench", async () => {
    const response = await POST(
      new Request("http://localhost/app/resumes/resume-foundation/duplicate", {
        method: "POST",
        headers: { origin: "http://localhost" },
        body: new URLSearchParams({ returnTo: "/app" }),
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/app");
  });

  it("rejects oversized duplicate forms before parsing", async () => {
    const response = await POST(
      new Request("http://localhost/app/resumes/resume-foundation/duplicate", {
        method: "POST",
        headers: { origin: "http://localhost", "content-type": "text/plain" },
        body: "x".repeat(MAX_ACTION_REQUEST_BYTES + 1),
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "request_payload_too_large",
    });
  });
});
