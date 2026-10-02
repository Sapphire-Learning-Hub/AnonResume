import { getOptionalSession } from "@/lib/auth/session";
import { restartEditorOnboarding } from "@/lib/onboarding/service";

import { POST } from "@/app/api/onboarding/editor-basics/restart/route";

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: vi.fn(),
}));

vi.mock("@/lib/onboarding/service", () => ({
  restartEditorOnboarding: vi.fn(),
}));

describe("editor onboarding restart route", () => {
  beforeEach(() => {
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: "session-one", userId: "user-one" },
      user: { id: "user-one", name: "User", email: "user@example.com" },
    } as never);
    vi.mocked(restartEditorOnboarding).mockResolvedValue({
      id: "run-one",
      userId: "user-one",
      flowKey: "editor-basics",
      flowVersion: 1,
      source: "manual",
      resumeId: "practice-one",
      status: "active",
      currentStep: "canvas-intro",
      createdAt: 1,
      updatedAt: 1,
    });
  });

  it("requires a same-origin authenticated request", async () => {
    const crossOrigin = await POST(
      new Request("http://localhost/api/onboarding/editor-basics/restart", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(crossOrigin.status).toBe(403);

    vi.mocked(getOptionalSession).mockResolvedValue(null);
    const unauthorized = await POST(
      new Request("http://localhost/api/onboarding/editor-basics/restart", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(unauthorized.status).toBe(401);
  });

  it("returns the new editor location", async () => {
    const response = await POST(
      new Request("http://localhost/api/onboarding/editor-basics/restart", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      editorHref: "/app/resumes/practice-one",
      run: expect.objectContaining({ id: "run-one" }),
    });
  });
});
