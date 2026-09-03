import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getOptionalSession } from "@/lib/auth-session";
import { createDefaultResumeDocument } from "@/domain/resume/default-document";
import {
  createGeneratedResumeRecord,
  createResumeRecord,
  getResumeRecord,
  resetResumeRepository,
  saveResumeRecord,
} from "@/lib/resume-repository";

import { GET, PATCH, PUT } from "@/app/api/resumes/[id]/route";
import { MAX_RESUME_JSON_REQUEST_BYTES } from "@/lib/request-body";

vi.mock("@/lib/auth-session", () => ({
  getOptionalSession: vi.fn(),
}));

describe("resume route", () => {
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
    await resetResumeRepository();
  });

  it("rejects unauthenticated resume reads", async () => {
    vi.mocked(getOptionalSession).mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/resumes/resume-foundation"), {
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    expect(response.status).toBe(401);

    const body = await response.json();

    expect(body.error).toBe("unauthorized");
  });

  it("returns a stored resume record", async () => {
    const response = await GET(new Request("http://localhost/api/resumes/resume-foundation"), {
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.resume.id).toBe("resume-foundation");
    expect(body.resume.title).toBe("基础版简历");
    expect(body.resume.published).toBe(false);
    expect(body.resume.slug).toBeUndefined();
    expect((await getResumeRecord("user-demo", "resume-foundation"))?.title).toBe("基础版简历");
  });

  it("does not create a missing resume on read", async () => {
    const response = await GET(new Request("http://localhost/api/resumes/resume-missing"), {
      params: Promise.resolve({ id: "resume-missing" }),
    });

    expect(response.status).toBe(404);
    expect(await getResumeRecord("user-demo", "resume-missing")).toBeUndefined();
  });

  it("updates a resume document with optimistic versioning", async () => {
    await createResumeRecord("user-demo", "resume-demo");

    const document = createDefaultResumeDocument();
    document.meta.title = "Saved Draft";

    const response = await PUT(
      new Request("http://localhost/api/resumes/resume-demo", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          version: 1,
          document,
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-demo" }),
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.resume.id).toBe("resume-demo");
    expect(body.resume.title).toBe("Saved Draft");
    expect(body.resume.version).toBe(2);
    expect(body.resume.updatedAt).toEqual(expect.any(Number));
    expect(
      (
        await saveResumeRecord({
          userId: "user-demo",
          resumeId: "resume-demo",
          version: 2,
          document,
        })
      ).version,
    ).toBe(3);
  });

  it("persists an empty editable text block", async () => {
    const document = createDefaultResumeDocument();
    const textBlock = document.sections[0]?.blocks[0];

    expect(textBlock?.type).toBe("text");
    if (textBlock?.type !== "text") {
      throw new Error("Expected the first profile block to be text.");
    }

    textBlock.content = {
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    };

    const response = await PUT(
      new Request("http://localhost/api/resumes/resume-foundation", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({ version: 1, document }),
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(200);
    const saved = await getResumeRecord("user-demo", "resume-foundation");
    const savedTextBlock = saved?.document.sections[0]?.blocks.find(
      (block) => block.id === textBlock.id,
    );

    expect(savedTextBlock).toMatchObject({
      type: "text",
      content: {
        content: [{ type: "paragraph", content: [] }],
      },
    });
  });

  it("updates only the resume summary with optimistic versioning", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/resumes/resume-foundation", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          version: 1,
          summary: "A concise custom summary for the resume catalog.",
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-foundation" }),
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.resume).toMatchObject({
      id: "resume-foundation",
      summary: "A concise custom summary for the resume catalog.",
      version: 2,
    });
  });

  it("rejects summaries longer than the catalog limit", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/resumes/resume-foundation", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          version: 1,
          summary: "a".repeat(161),
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-foundation" }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("rejects updates to a missing resume", async () => {
    const document = createDefaultResumeDocument();

    const response = await PUT(
      new Request("http://localhost/api/resumes/resume-missing", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          version: 1,
          document,
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-missing" }),
      },
    );

    expect(response.status).toBe(404);
    expect(await getResumeRecord("user-demo", "resume-missing")).toBeUndefined();
  });

  it("rejects stale updates with a 409 conflict", async () => {
    const document = createDefaultResumeDocument();

    await saveResumeRecord({
      userId: "user-demo",
      resumeId: "resume-foundation",
      version: 1,
      document,
    });

    const response = await PUT(
      new Request("http://localhost/api/resumes/resume-foundation", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          version: 1,
          document,
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-foundation" }),
      },
    );

    expect(response.status).toBe(409);

    const body = await response.json();

    expect(body.error).toBe("version_conflict");
    expect(body.currentVersion).toBe(2);
  });

  it("rejects semantically invalid resume payloads with structured issues", async () => {
    await createResumeRecord("user-demo", "resume-demo");

    const document = createDefaultResumeDocument();

    document.settings.theme.accent = "blue";

    const response = await PUT(
      new Request("http://localhost/api/resumes/resume-demo", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          version: 1,
          document,
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-demo" }),
      },
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toBe("resume_validation_failed");
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid_color",
          path: "settings.theme.accent",
        }),
      ]),
    );
  });

  it("rejects oversized resume updates before JSON parsing", async () => {
    const response = await PUT(
      new Request("http://localhost/api/resumes/resume-foundation", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({
          version: 1,
          document: { padding: "x".repeat(MAX_RESUME_JSON_REQUEST_BYTES) },
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-foundation" }),
      },
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "resume_payload_too_large",
    });
  });

  it("rejects cross-origin resume updates", async () => {
    await createResumeRecord("user-demo", "resume-demo");

    const response = await PUT(
      new Request("http://localhost/api/resumes/resume-demo", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          version: 1,
          document: createDefaultResumeDocument(),
        }),
      }),
      {
        params: Promise.resolve({ id: "resume-demo" }),
      },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("forbidden");
  });
});
