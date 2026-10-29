import { z } from "zod";
import {
  attachErrorDiagnostic,
  readResponseDiagnostic,
} from "@/lib/observability/diagnostics/schema";
import {
  opportunitySchema,
  opportunityPageSchema,
  applicationSchema,
  applicationPageSchema,
  ganttPageSchema,
  stageMilestonePageSchema,
  eventPageSchema,
  reviewPageSchema,
  savedOpportunitySchema,
  boardSchema,
  jobContextSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
  createApplicationSchema,
  updateApplicationSchema,
  changeStageSchema,
  followupSchema,
  editFollowupSchema,
  deleteFollowupSchema,
  revisionSchema,
  type JobSearchQuery,
  type JobReviewContext,
} from "@/domain/job-search/schema";
export class JobRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "JobRequestError";
  }
}
const base = "/api/job-search";
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${base}/${path}`, {
    method,
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(payload);
    throw attachErrorDiagnostic(
      new JobRequestError(parsed.success ? parsed.data.error : "unknown"),
      readResponseDiagnostic(response),
    );
  }
  return schema.parse(payload);
}
function query(input: Partial<JobSearchQuery> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && key !== "exactDescription")
      params.set(key, String(value));
  return params.toString();
}
export const fetchJobOpportunities = (
  input: Partial<JobSearchQuery> = {},
  signal?: AbortSignal,
) =>
  request(
    `opportunities?${query(input)}`,
    opportunityPageSchema,
    "GET",
    undefined,
    signal,
  );
export const fetchJobCandidates = (description: string, signal?: AbortSignal) =>
  request(
    "opportunities/candidates",
    opportunityPageSchema,
    "POST",
    { description },
    signal,
  );
export const fetchJobOpportunity = (id: string, signal?: AbortSignal) =>
  request(
    `opportunities/${encodeURIComponent(id)}`,
    opportunitySchema,
    "GET",
    undefined,
    signal,
  );
export const saveJobOpportunity = (
  input: z.input<typeof createOpportunitySchema>,
) => request("opportunities", savedOpportunitySchema, "POST", input);
export const editJobOpportunity = (
  id: string,
  input: z.input<typeof updateOpportunitySchema>,
) =>
  request(
    `opportunities/${encodeURIComponent(id)}`,
    opportunitySchema,
    "PATCH",
    input,
  );
export const removeJobOpportunity = (
  id: string,
  input: z.input<typeof revisionSchema>,
) =>
  request(
    `opportunities/${encodeURIComponent(id)}`,
    z.object({ deleted: z.literal(true) }),
    "DELETE",
    input,
  );
export const fetchJobApplications = (
  input: Partial<JobSearchQuery> = {},
  signal?: AbortSignal,
) =>
  request(
    `applications?${query(input)}`,
    applicationPageSchema,
    "GET",
    undefined,
    signal,
  );
export const fetchJobApplication = (id: string, signal?: AbortSignal) =>
  request(
    `applications/${encodeURIComponent(id)}`,
    applicationSchema,
    "GET",
    undefined,
    signal,
  );
export const fetchJobBoard = (
  input: Partial<JobSearchQuery> = {},
  signal?: AbortSignal,
) => request(`board?${query(input)}`, boardSchema, "GET", undefined, signal);
export const saveJobApplication = (
  input: z.input<typeof createApplicationSchema>,
) => request("applications", applicationSchema, "POST", input);
export const editJobApplication = (
  id: string,
  input: z.input<typeof updateApplicationSchema>,
) =>
  request(
    `applications/${encodeURIComponent(id)}`,
    applicationSchema,
    "PATCH",
    input,
  );
export const moveJobApplication = (
  id: string,
  input: z.input<typeof changeStageSchema>,
) =>
  request(
    `applications/${encodeURIComponent(id)}/stage`,
    applicationSchema,
    "POST",
    input,
  );
export const syncJobApplication = (
  id: string,
  input: { operationId: string; version: number; opportunityVersion: number },
) =>
  request(
    `applications/${encodeURIComponent(id)}/sync`,
    applicationSchema,
    "POST",
    input,
  );
export const removeJobApplication = (
  id: string,
  input: z.input<typeof revisionSchema>,
) =>
  request(
    `applications/${encodeURIComponent(id)}`,
    z.object({ deleted: z.literal(true) }),
    "DELETE",
    input,
  );
export const fetchApplicationEvents = (
  id: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  request(
    `applications/${encodeURIComponent(id)}/events?${query({ cursor })}`,
    eventPageSchema,
    "GET",
    undefined,
    signal,
  );
export const saveApplicationFollowup = (
  id: string,
  input: z.input<typeof followupSchema>,
) =>
  request(
    `applications/${encodeURIComponent(id)}/events`,
    applicationSchema,
    "POST",
    input,
  );
export const editApplicationFollowup = (
  id: string,
  eventId: string,
  input: z.input<typeof editFollowupSchema>,
) =>
  request(
    `applications/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`,
    applicationSchema,
    "PATCH",
    input,
  );
export const removeApplicationFollowup = (
  id: string,
  eventId: string,
  input: z.input<typeof deleteFollowupSchema>,
) =>
  request(
    `applications/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`,
    applicationSchema,
    "DELETE",
    input,
  );
export const fetchOpportunityReviews = (
  id: string,
  cursor?: string,
  applicationId?: string,
  signal?: AbortSignal,
) => {
  const p = new URLSearchParams();
  if (cursor) p.set("cursor", cursor);
  if (applicationId) p.set("applicationId", applicationId);
  return request(
    `opportunities/${encodeURIComponent(id)}/reviews?${p}`,
    reviewPageSchema,
    "GET",
    undefined,
    signal,
  );
};
export const fetchReviewJobContext = (id: string) =>
  request(
    `review-links/${encodeURIComponent(id)}`,
    z.object({ context: jobContextSchema.nullable() }),
  );
export const saveReviewJobContext = (id: string, context: JobReviewContext) =>
  request(
    `review-links/${encodeURIComponent(id)}`,
    z.object({ linked: z.literal(true) }),
    "PUT",
    context,
  );

export const fetchGanttApplications = (
  input: Partial<JobSearchQuery> = {},
  signal?: AbortSignal,
) =>
  request(`gantt?${query(input)}`, ganttPageSchema, "GET", undefined, signal);
export const fetchStageMilestones = (
  id: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  request(
    `applications/${encodeURIComponent(id)}/stages?${query({ cursor, limit: 50 })}`,
    stageMilestonePageSchema,
    "GET",
    undefined,
    signal,
  );
