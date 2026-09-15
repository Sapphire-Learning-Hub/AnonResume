import type { ResumeDocument } from "@/domain/resume/schema";
import type { ResumeValidationIssue } from "@/domain/resume/validation";
import type { PageResult } from "@/lib/shared/pagination";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";

export class ResumeVersionConflictClientError extends Error {
  currentVersion: number;

  constructor(currentVersion: number) {
    super("version_conflict");
    this.name = "ResumeVersionConflictClientError";
    this.currentVersion = currentVersion;
  }
}

export class ResumeValidationClientError extends Error {
  issues: ResumeValidationIssue[];

  constructor(issues: ResumeValidationIssue[]) {
    super("resume_validation_failed");
    this.name = "ResumeValidationClientError";
    this.issues = issues;
  }
}

export interface ResumeVersionSnapshotSummary {
  id: string;
  version: number;
  createdAt: number;
}

export interface ResumeVersionSnapshotDetail
  extends ResumeVersionSnapshotSummary {
  document: ResumeDocument;
}

export async function fetchResumeEntriesPage({
  page,
  pageSize,
  query = "",
}: {
  page: number;
  pageSize: number;
  query?: string;
}): Promise<PageResult<ResumeCatalogEntry>> {
  const searchParams = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (query) searchParams.set("q", query);
  const response = await fetch(`/api/resumes?${searchParams.toString()}`);

  return (await parseJson(response)) as unknown as PageResult<ResumeCatalogEntry>;
}

export async function fetchCurrentResumeDocument(
  resumeId: string,
): Promise<{
  document: ResumeDocument;
  version: number;
  updatedAt: number;
}> {
  const response = await fetch(`/api/resumes/${resumeId}`);
  const payload = await parseJson(response);
  const resume = payload.resume as {
    document: ResumeDocument;
    version: number;
    updatedAt: number;
  };

  return {
    document: resume.document,
    version: resume.version,
    updatedAt: resume.updatedAt,
  };
}

async function parseJson(response: Response) {
  let payload: Record<string, unknown> | undefined;

  try {
    const value = (await response.json()) as unknown;

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      payload = value as Record<string, unknown>;
    }
  } catch {
    // Error responses are not guaranteed to contain a JSON body.
  }

  if (!response.ok) {
    if (
      payload?.error === "version_conflict" &&
      typeof payload.currentVersion === "number"
    ) {
      throw new ResumeVersionConflictClientError(payload.currentVersion);
    }

    if (
      payload?.error === "resume_validation_failed" &&
      Array.isArray(payload.issues)
    ) {
      throw new ResumeValidationClientError(
        payload.issues as ResumeValidationIssue[],
      );
    }

    throw new Error(
      typeof payload?.error === "string" ? payload.error : "request_failed",
    );
  }

  if (!payload) {
    throw new Error("invalid_response");
  }

  return payload;
}

export async function saveResumeDocument(params: {
  resumeId: string;
  version: number;
  document: ResumeDocument;
}): Promise<{ version: number; updatedAt: number }> {
  const response = await fetch(`/api/resumes/${params.resumeId}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      version: params.version,
      document: params.document,
    }),
  });
  const payload = await parseJson(response);
  const resume = payload.resume as { version: number; updatedAt: number };

  return {
    version: resume.version,
    updatedAt: resume.updatedAt,
  };
}

export async function updateResumeSummary(params: {
  resumeId: string;
  summary: string;
  version: number;
}): Promise<{ summary: string; updatedAt: number; version: number }> {
  const response = await fetch(`/api/resumes/${params.resumeId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      summary: params.summary,
      version: params.version,
    }),
  });
  const payload = await parseJson(response);
  const resume = payload.resume as {
    summary: string;
    updatedAt: number;
    version: number;
  };

  return {
    summary: resume.summary,
    updatedAt: resume.updatedAt,
    version: resume.version,
  };
}

export async function fetchResumeVersionSnapshots(
  resumeId: string,
  request: { page: number; pageSize: number } = { page: 1, pageSize: 20 },
): Promise<PageResult<ResumeVersionSnapshotSummary>> {
  const searchParams = new URLSearchParams({
    page: String(request.page),
    pageSize: String(request.pageSize),
  });
  const response = await fetch(
    `/api/resumes/${resumeId}/versions?${searchParams.toString()}`,
  );
  const payload = await parseJson(response);

  return payload as unknown as PageResult<ResumeVersionSnapshotSummary>;
}

export async function fetchResumeVersionSnapshot(params: {
  resumeId: string;
  snapshotId: string;
}): Promise<ResumeVersionSnapshotDetail> {
  const response = await fetch(
    `/api/resumes/${params.resumeId}/versions/${params.snapshotId}`,
  );
  const payload = await parseJson(response);

  return payload.version as ResumeVersionSnapshotDetail;
}

export async function createResumeVersionSnapshot(
  resumeId: string,
): Promise<ResumeVersionSnapshotSummary> {
  const response = await fetch(`/api/resumes/${resumeId}/versions`, {
    method: "POST",
  });
  const payload = await parseJson(response);

  return payload.version as ResumeVersionSnapshotSummary;
}

export async function restoreResumeVersion(params: {
  resumeId: string;
  snapshotId: string;
  version: number;
}): Promise<{
  document: ResumeDocument;
  version: number;
  updatedAt: number;
}> {
  const response = await fetch(
    `/api/resumes/${params.resumeId}/versions/${params.snapshotId}/restore`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ version: params.version }),
    },
  );
  const payload = await parseJson(response);
  const resume = payload.resume as {
    document: ResumeDocument;
    version: number;
    updatedAt: number;
  };

  return resume;
}

export async function publishResume(params: {
  resumeId: string;
}): Promise<{ slug: string }> {
  const response = await fetch(`/api/resumes/${params.resumeId}/publish`, {
    method: "POST",
  });
  const payload = await parseJson(response);
  const resume = payload.resume as { slug: string };

  return {
    slug: resume.slug,
  };
}

export async function unpublishResume(params: {
  resumeId: string;
}): Promise<void> {
  const response = await fetch(`/api/resumes/${params.resumeId}/unpublish`, {
    method: "POST",
  });

  await parseJson(response);
}

export async function exportResumePdfDocument(params: {
  resumeId: string;
}): Promise<void> {
  const { startResumePdfExport } = await import("@/lib/pdf/export-client");

  await startResumePdfExport(params.resumeId);
}
