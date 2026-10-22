import { z } from "zod";
import { resumeDocumentSchema } from "@/domain/resume/schema";
import {
  attachErrorDiagnostic,
  readResponseDiagnostic,
} from "@/lib/observability/diagnostics/schema";
import {
  savedTemplateSchema,
  templatePageSchema,
  templateSummarySchema,
  type SaveTemplateInput,
  type ReplaceTemplateInput,
} from "./types";

export class TemplateRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TemplateRequestError";
  }
}
async function request<T>(
  url: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(body !== undefined
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const payload: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(payload);
    throw attachErrorDiagnostic(
      new TemplateRequestError(
        error.success ? error.data.error : "request_failed",
      ),
      readResponseDiagnostic(response),
    );
  }
  return schema.parse(payload);
}
const base = "/api/resume-templates";
const detailSchema = templateSummarySchema.extend({
  document: resumeDocumentSchema,
});
export function fetchPersonalTemplatePage(query = "", cursor?: string) {
  const params = new URLSearchParams({ q: query });
  if (cursor) params.set("cursor", cursor);
  return request(`${base}?${params}`, templatePageSchema);
}
export function fetchPersonalTemplate(id: string) {
  return request(`${base}/${encodeURIComponent(id)}`, detailSchema);
}
export function savePersonalTemplateRequest(input: SaveTemplateInput) {
  return request(base, savedTemplateSchema, "POST", input);
}
export function replacePersonalTemplateRequest(input: ReplaceTemplateInput) {
  const { templateId, ...body } = input;
  return request(
    `${base}/${encodeURIComponent(templateId)}/document`,
    savedTemplateSchema,
    "PUT",
    body,
  );
}
export function renamePersonalTemplateRequest(
  id: string,
  version: number,
  name: string,
) {
  return request(
    `${base}/${encodeURIComponent(id)}`,
    templateSummarySchema,
    "PATCH",
    { version, name },
  );
}
export function deletePersonalTemplateRequest(id: string, version: number) {
  return request(`${base}/${encodeURIComponent(id)}`, z.null(), "DELETE", {
    version,
  });
}
export function instantiatePersonalTemplateRequest(
  id: string,
  templateVersion: number,
  operationId: string,
) {
  return request(
    `${base}/${encodeURIComponent(id)}/instantiate`,
    z.object({ resumeId: z.string() }),
    "POST",
    { templateVersion, operationId },
  );
}
