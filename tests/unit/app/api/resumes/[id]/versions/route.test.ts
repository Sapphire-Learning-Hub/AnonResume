import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOptionalSession } from "@/lib/auth/session";
import {
  createGeneratedResumeRecord,
  resetResumeRepository,
  snapshotResumeVersion,
  getResumeRecord,
  saveResumeRecord,
} from "@/lib/resume/repository";

import { GET, POST } from "@/app/api/resumes/[id]/versions/route";
import { createResumeVersionSnapshot } from "@/lib/resume/client";

vi.mock("@/lib/auth/session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("resume version routes", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    await createGeneratedResumeRecord({
      userId: "user-demo",
      templateId: "centered",
      createId: () => "resume-foundation",
    });
    vi.mocked(getOptionalSession).mockResolvedValue({
      session: { id: "session-demo", userId: "user-demo" },
      user: { id: "user-demo", name: "Demo User", email: "demo@example.com" },
    } as never);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetResumeRepository();
  });

  it("creates a manual restore point through the browser client's HTTP payload", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
      POST(
        new Request(new URL(url, "http://localhost"), {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            origin: "http://localhost",
          },
          body: init?.body ?? "",
        }),
        { params: Promise.resolve({ id: "resume-foundation" }) },
      ),
    );
    const snapshot = await createResumeVersionSnapshot("resume-foundation");
    expect(snapshot.version).toBe(1);
    const response = await GET(
      new Request("http://localhost/api/resumes/resume-foundation/versions"),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );
    expect((await response.json()).items).toEqual([
      expect.objectContaining({ id: snapshot.id }),
    ]);
  });

  it("lists and creates restore points for the current user resume", async () => {
    const existing = await snapshotResumeVersion(
      "user-demo",
      "resume-foundation",
    );

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
      autosave: null,
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

  it("returns the rolling point separately from normal history without sending document contents", async () => {
    const record = await getResumeRecord("user-demo", "resume-foundation");
    const document = structuredClone(record!.document);
    document.meta.title = "Changed";
    await saveResumeRecord({
      userId: "user-demo",
      resumeId: "resume-foundation",
      version: 1,
      document,
    });
    const response = await GET(
      new Request("http://localhost/api/resumes/resume-foundation/versions"),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );
    const result = await response.json();
    expect(result).toMatchObject({
      items: [],
      total: 0,
      autosave: { version: 1, kind: "autosave" },
    });
    expect(result.autosave).not.toHaveProperty("document");
  });
});
