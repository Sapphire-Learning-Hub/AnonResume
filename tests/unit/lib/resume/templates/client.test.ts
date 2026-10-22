import {
  fetchPersonalTemplatePage,
  savePersonalTemplateRequest,
  TemplateRequestError,
} from "@/lib/resume/templates/client";
afterEach(() => vi.unstubAllGlobals());
it("preserves deliberate failures including non-JSON responses without exposing raw text", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("database secret", { status: 500 })),
  );
  await expect(fetchPersonalTemplatePage()).rejects.toMatchObject({
    code: "request_failed",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: "template_source_conflict" }, { status: 409 }),
    ),
  );
  await expect(fetchPersonalTemplatePage()).rejects.toBeInstanceOf(
    TemplateRequestError,
  );
});
it("validates successful data rather than trusting malformed responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [{ document: "private" }] })),
  );
  await expect(fetchPersonalTemplatePage()).rejects.toThrow();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ templateId: "ok", version: 1 })),
  );
  await expect(
    savePersonalTemplateRequest({
      resumeId: "r",
      sourceVersion: 1,
      name: "A",
      operationId: "request",
    }),
  ).resolves.toEqual({ templateId: "ok", version: 1 });
});
