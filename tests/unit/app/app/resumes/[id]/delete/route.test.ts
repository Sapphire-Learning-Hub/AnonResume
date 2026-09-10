import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireSession } from "@/lib/auth/session";
import {
  createGeneratedResumeRecord,
  getResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

import { POST } from "@/app/app/resumes/[id]/delete/route";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

describe("delete resume route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
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

  it("deletes the signed-in user's resume and returns to the dashboard", async () => {
    const response = await POST(
      new Request("http://localhost/app/resumes/resume-foundation/delete", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/app");
    await expect(getResumeRecord("user-demo", "resume-foundation")).resolves.toBeUndefined();
  });

  it("rejects cross-origin delete requests", async () => {
    const response = await POST(
      new Request("http://localhost/app/resumes/resume-foundation/delete", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(403);
  });
});
