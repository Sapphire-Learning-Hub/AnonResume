import { getOptionalSession } from "@/lib/auth/session";
import {
  EditorOnboardingTransitionError,
  transitionEditorOnboarding,
} from "@/lib/onboarding/service";

import { PATCH } from "@/app/api/onboarding/editor-basics/runs/[id]/route";

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: vi.fn(),
}));

vi.mock("@/lib/onboarding/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/onboarding/service")>();
  return {
    ...actual,
    transitionEditorOnboarding: vi.fn(),
  };
});

function createRequest(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/onboarding/editor-basics/runs/run-one", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

describe("editor onboarding transition route", () => {
  beforeEach(() => {
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: "session-one", userId: "user-one" },
      user: { id: "user-one", name: "User", email: "user@example.com" },
    } as never);
    vi.mocked(transitionEditorOnboarding).mockResolvedValue({
      id: "run-one",
      userId: "user-one",
      flowKey: "editor-basics",
      flowVersion: 1,
      source: "automatic",
      resumeId: "practice-one",
      status: "active",
      currentStep: "edit-text",
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it("requires authentication and same origin", async () => {
    expect(
      (await PATCH(createRequest({ type: "pause" }, "https://evil.example"), {
        params: Promise.resolve({ id: "run-one" }),
      })).status,
    ).toBe(403);

    vi.mocked(getOptionalSession).mockResolvedValue(null);
    expect(
      (await PATCH(createRequest({ type: "pause" }), {
        params: Promise.resolve({ id: "run-one" }),
      })).status,
    ).toBe(401);
  });

  it("rejects malformed and unsupported actions", async () => {
    const response = await PATCH(
      createRequest({ type: "complete-step", stepId: "not-a-step" }),
      { params: Promise.resolve({ id: "run-one" }) },
    );
    expect(response.status).toBe(400);
    expect(transitionEditorOnboarding).not.toHaveBeenCalled();
  });

  it("uses the authenticated owner and maps rejected transitions", async () => {
    const response = await PATCH(
      createRequest({ type: "complete-step", stepId: "canvas-intro" }),
      { params: Promise.resolve({ id: "run-one" }) },
    );
    expect(response.status).toBe(200);
    expect(transitionEditorOnboarding).toHaveBeenCalledWith({
      userId: "user-one",
      runId: "run-one",
      action: { type: "complete-step", stepId: "canvas-intro" },
    });

    vi.mocked(transitionEditorOnboarding).mockRejectedValueOnce(
      new EditorOnboardingTransitionError(),
    );
    const rejected = await PATCH(createRequest({ type: "pause" }), {
      params: Promise.resolve({ id: "run-other" }),
    });
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: "transition_rejected" });
  });
});
