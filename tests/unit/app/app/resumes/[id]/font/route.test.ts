import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getResumeFontPreset } from "@/domain/resume/font-presets";
import { db, userFontPreferences } from "@/db";
import { requireSession } from "@/lib/auth/session";
import { MAX_ACTION_REQUEST_BYTES } from "@/lib/http/request-body";
import { listUserFontPreferences } from "@/lib/resume/fonts/preferences";
import {
  createGeneratedResumeRecord,
  getResumeRecord,
  resetResumeRepository,
} from "@/lib/resume/repository";

import { POST } from "@/app/app/resumes/[id]/font/route";

vi.mock("@/lib/auth/session", () => ({
  requireSession: vi.fn(),
}));

function createFontRequest(
  fontPresetId: string,
  origin = "http://localhost",
  returnTo?: string,
  version = 1,
) {
  const body = new FormData();
  body.set("fontPresetId", fontPresetId);
  body.set("version", String(version));
  if (returnTo) {
    body.set("returnTo", returnTo);
  }

  return new Request("http://localhost/app/resumes/resume-foundation/font", {
    method: "POST",
    headers: { origin },
    body,
  });
}

describe("apply resume font route", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetResumeRepository();
    await db.delete(userFontPreferences);
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
    await db.delete(userFontPreferences);
  });

  it("updates the signed-in user's resume and redirects to its editor", async () => {
    const response = await POST(createFontRequest("lxgw-wenkai"), {
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/app/resumes/resume-foundation",
    );
    await expect(getResumeRecord("user-demo", "resume-foundation")).resolves.toMatchObject({
      version: 2,
      document: {
        settings: {
          typography: {
            fontFamily: getResumeFontPreset("lxgw-wenkai")!.fontFamily,
          },
        },
      },
    });
    await expect(listUserFontPreferences("user-demo")).resolves.toContainEqual({
      fontPresetId: "lxgw-wenkai",
      favorite: false,
      lastAppliedAt: expect.any(Number),
    });
  });

  it("returns a mobile font application to the font market", async () => {
    const response = await POST(
      createFontRequest("lxgw-wenkai", "http://localhost", "/app/fonts"),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/app/fonts");
  });

  it("does not accept an arbitrary font application redirect", async () => {
    const response = await POST(
      createFontRequest("lxgw-wenkai", "http://localhost", "https://evil.example"),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/app/fonts");
  });

  it("rejects unknown font identifiers without changing the resume", async () => {
    const response = await POST(createFontRequest("untrusted-font"), {
      params: Promise.resolve({ id: "resume-foundation" }),
    });

    expect(response.status).toBe(400);
    await expect(getResumeRecord("user-demo", "resume-foundation")).resolves.toMatchObject({
      version: 1,
      document: {
        settings: {
          typography: {
            fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
          },
        },
      },
    });
  });

  it("rejects a stale resume version without recording recent usage", async () => {
    const response = await POST(
      createFontRequest("lxgw-wenkai", "http://localhost", undefined, 2),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "version_conflict",
      currentVersion: 1,
    });
    await expect(getResumeRecord("user-demo", "resume-foundation")).resolves.toMatchObject({
      version: 1,
    });
    await expect(listUserFontPreferences("user-demo")).resolves.toEqual([]);
  });

  it("rejects a missing resume version", async () => {
    const request = createFontRequest("lxgw-wenkai");
    const body = await request.formData();
    body.delete("version");

    const response = await POST(
      new Request(request.url, {
        method: "POST",
        headers: { origin: "http://localhost" },
        body,
      }),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_version" });
  });

  it("rejects cross-origin requests before loading the session", async () => {
    const response = await POST(
      createFontRequest("lxgw-wenkai", "https://evil.example"),
      { params: Promise.resolve({ id: "resume-foundation" }) },
    );

    expect(response.status).toBe(403);
    expect(requireSession).not.toHaveBeenCalled();
  });

  it("rejects oversized font forms before parsing", async () => {
    const response = await POST(
      new Request("http://localhost/app/resumes/resume-foundation/font", {
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
