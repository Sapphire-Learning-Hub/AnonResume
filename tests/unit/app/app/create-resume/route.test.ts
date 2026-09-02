import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createResumeDocumentFromTemplate } from "@/domain/resume/templates";
import { requireSession } from "@/lib/auth-session";
import {
  getResumeRecord,
  listResumeEntries,
  resetResumeRepository,
} from "@/lib/resume-repository";

import { POST } from "@/app/app/create-resume/route";
import { MAX_RESUME_IMPORT_REQUEST_BYTES } from "@/lib/request-body";

vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(),
}));

function createRequest(
  templateId?: string,
  origin = "http://localhost",
  returnTo?: string,
) {
  const body =
    templateId === undefined
      ? undefined
      : new URLSearchParams({
          templateId,
          ...(returnTo ? { returnTo } : {}),
        });

  return new Request("http://localhost/app/create-resume", {
    method: "POST",
    headers: { origin },
    body,
  });
}

function createMarkdownRequest({
  dialect = "auto",
  markdown = "# Imported Person\n\n:::left\n\nicon:phone 123456\n\n:::",
  origin = "http://localhost",
  returnTo,
  templateId,
}: {
  dialect?: string;
  markdown?: string;
  origin?: string;
  returnTo?: string;
  templateId?: string;
} = {}) {
  return new Request("http://localhost/app/create-resume", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams({
      creationMode: "markdown",
      dialect,
      markdown,
      ...(returnTo ? { returnTo } : {}),
      ...(templateId ? { templateId } : {}),
    }),
  });
}

describe("create resume route", () => {
  beforeEach(async () => {
    await resetResumeRepository();
    vi.mocked(requireSession).mockResolvedValue({
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

  it.each(["blank", "foundation", "frontend", "fullstack"] as const)(
    "creates the %s template and redirects to the editor",
    async (templateId) => {
      const response = await POST(createRequest(templateId));

      expect(response.status).toBe(307);

      const location = response.headers.get("location");

      expect(location).toMatch(
        /^http:\/\/localhost\/app\/resumes\/resume-\d{8}-\d{6}-[0-9a-f-]{36}$/i,
      );

      const resumeId = location?.split("/").at(-1);
      const created = await getResumeRecord("user-demo", resumeId!);

      expect(resumeId).toBeTruthy();
      expect(created).toEqual(
        expect.objectContaining({
          id: resumeId,
          userId: "user-demo",
          published: false,
        }),
      );
      expect(created?.document).toEqual(
        createResumeDocumentFromTemplate(templateId, "zh-CN"),
      );
    },
  );

  it("uses the blank template when the field is missing", async () => {
    const response = await POST(createRequest());
    const resumeId = response.headers.get("location")?.split("/").at(-1);

    expect(response.status).toBe(307);
    expect(await getResumeRecord("user-demo", resumeId!)).toEqual(
      expect.objectContaining({
        id: resumeId,
        document: createResumeDocumentFromTemplate("blank", "zh-CN"),
      }),
    );
  });

  it("returns mobile creation to the workbench", async () => {
    const response = await POST(
      createRequest("blank", "http://localhost", "/app"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/app");
    expect(await listResumeEntries("user-demo")).toHaveLength(1);
  });

  it("creates a new resume from server-parsed Mujicv Markdown", async () => {
    const response = await POST(createMarkdownRequest());
    const location = response.headers.get("location");
    const resumeId = location?.split("/").at(-1);
    const created = await getResumeRecord("user-demo", resumeId!);

    expect(response.status).toBe(307);
    expect(location).toMatch(/^http:\/\/localhost\/app\/resumes\/resume-/);
    expect(created?.title).toBe("Imported Person");
    expect(created?.document.meta.import).toMatchObject({
      format: "markdown",
      dialect: "mujicv",
      originalSource: expect.stringContaining("icon:phone"),
    });
    expect(created?.document.sections[0]?.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
      ]),
    );
  });

  it("returns mobile Markdown imports to the workbench", async () => {
    const response = await POST(
      createMarkdownRequest({ returnTo: "/app" }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/app");
    expect(await listResumeEntries("user-demo")).toHaveLength(1);
  });

  it.each([
    {
      name: "an unknown dialect",
      request: createMarkdownRequest({ dialect: "unknown" }),
      error: "invalid_markdown_dialect",
    },
    {
      name: "an empty source",
      request: createMarkdownRequest({ markdown: " " }),
      error: "source_empty",
    },
    {
      name: "a conflicting template mode",
      request: createMarkdownRequest({ templateId: "blank" }),
      error: "invalid_creation_mode",
    },
  ])("rejects $name without creating a resume", async ({ request, error }) => {
    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(await listResumeEntries("user-demo")).toEqual([]);
  });

  it("rejects an unknown template without creating a resume", async () => {
    const response = await POST(createRequest("unknown"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_template" });
    expect(await listResumeEntries("user-demo")).toEqual([]);
  });

  it("creates separate records for concurrent create requests", async () => {
    const [firstResponse, secondResponse] = await Promise.all([
      POST(createRequest()),
      POST(createRequest()),
    ]);
    const firstId = firstResponse.headers.get("location")?.split("/").at(-1);
    const secondId = secondResponse.headers.get("location")?.split("/").at(-1);

    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    expect(await getResumeRecord("user-demo", firstId!)).toBeDefined();
    expect(await getResumeRecord("user-demo", secondId!)).toBeDefined();
  });

  it("rejects oversized import forms before form-data parsing", async () => {
    const response = await POST(
      new Request("http://localhost/app/create-resume", {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          origin: "http://localhost",
        },
        body: "x".repeat(MAX_RESUME_IMPORT_REQUEST_BYTES + 1),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "resume_import_payload_too_large",
    });
  });

  it("rejects cross-origin create requests", async () => {
    const response = await POST(createRequest("frontend", "https://evil.example"));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("forbidden");
  });
});
