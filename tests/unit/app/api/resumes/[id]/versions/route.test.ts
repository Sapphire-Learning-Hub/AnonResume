import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOptionalSession } from "@/lib/auth-session";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
  snapshotResumeVersion,
} from "@/lib/resume-repository";

import { GET, POST } from "@/app/api/resumes/[id]/versions/route";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("resume version routes", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "foundation",
      createId: () => "resume-foundation",
    });
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-demo" },
      user: { id: "user-demo", name: "Demo User", email: "demo@example.com" },
    } as never);
  });

  afterEach(async () => {
    await resetResumeRepository();
  });

  it("lists and creates restore points for the current user resume", async () => {
    const existing = await snapshotResumeVersion("user-demo", "resume-foundation");

    const listResponse = await GET(
      new Request(
        "http://localhost/api/resumes/resume-foundation/versions?page=1&pageSize=20",
      ),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: existing.id,
          version: existing.version,
        }),
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    const createResponse = await POST(
      new Request("http://localhost/api/resumes/resume-foundation/versions", {
        method: "POST",
        headers: { origin: "http://localhost" },
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toEqual({
      version: expect.objectContaining({
        id: expect.any(String),
        version: expect.any(Number),
        createdAt: expect.any(Number),
      }),
    });
  });
});
