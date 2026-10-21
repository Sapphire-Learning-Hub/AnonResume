"use client";

import { z } from "zod";
import {
  attachErrorDiagnostic,
  readResponseDiagnostic,
} from "@/lib/observability/diagnostics/schema";
import type { PageResult } from "@/lib/shared/pagination";
import type { ResumeTrashEntry } from "./types";

export class ResumeTrashClientError extends Error {
  constructor(public readonly code: string) {
    super("resume_trash_operation_failed");
    this.name = "ResumeTrashClientError";
  }
}
const entry = z.object({
  id: z.string(),
  title: z.string(),
  version: z.number().int(),
  deletedAt: z.number(),
  purgeAfter: z.number(),
  recoverable: z.boolean(),
});
const pageSchema = z.object({
  items: z.array(entry),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

async function request(url: string, method: "GET" | "POST" = "GET") {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(method === "POST"
      ? { headers: { "content-type": "application/json" }, body: "{}" }
      : {}),
  });
  if (!response.ok) {
    const payload = z
      .object({ error: z.string() })
      .safeParse(await response.json().catch(() => null));
    throw attachErrorDiagnostic(
      new ResumeTrashClientError(
        payload.success ? payload.data.error : "unknown",
      ),
      readResponseDiagnostic(response),
    );
  }
  return response;
}
export async function fetchResumeTrashPage(input: {
  page: number;
  pageSize: number;
  query?: string;
}): Promise<PageResult<ResumeTrashEntry>> {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    q: input.query ?? "",
  });
  return pageSchema.parse(
    await (await request(`/api/resumes/trash?${params}`)).json(),
  );
}
export async function restoreTrashedResumeClient(id: string) {
  await request(`/api/resumes/${encodeURIComponent(id)}/restore`, "POST");
}
export async function purgeTrashedResumeClient(id: string) {
  await request(`/api/resumes/${encodeURIComponent(id)}/purge`, "POST");
}
