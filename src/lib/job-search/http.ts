import { listGanttApplications, listStageMilestones } from "./gantt";
import { z } from "zod";
import { getOptionalSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/http/request-origin";
import {
  MAX_ACTION_REQUEST_BYTES,
  parseLimitedJsonRequest,
  RequestBodyTooLargeError,
} from "@/lib/http/request-body";
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  createApplicationSchema,
  updateApplicationSchema,
  revisionSchema,
  changeStageSchema,
  followupSchema,
  editFollowupSchema,
  deleteFollowupSchema,
  querySchema,
  jobContextSchema,
} from "@/domain/job-search/schema";
import {
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} from "./opportunities";
import {
  createApplication,
  updateApplication,
  changeApplicationStage,
  syncApplicationJob,
  syncJobSchema,
  deleteApplication,
} from "./applications";
import { addFollowup, updateFollowup, deleteFollowup } from "./events";
import {
  listOpportunities,
  getOpportunity,
  getApplication,
  listApplications,
  getApplicationBoard,
  listEvents,
} from "./queries";
import { listJobReviews, getReviewContext, saveReviewLink } from "./reviews";
import { JobSearchError, jobErrorStatus } from "./errors";
export type JobRouteContext = { params: Promise<{ path: string[] }> };
async function body<T>(request: Request, schema: z.ZodType<T>) {
  return schema.parse(
    await parseLimitedJsonRequest(request, MAX_ACTION_REQUEST_BYTES),
  );
}
async function dispatch(userId: string, request: Request, path: string[]) {
  const method = request.method;
  const [resource, rawId, action, eventId] = path;
  const query = () =>
    querySchema
      .omit({ exactDescription: true })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
  if (path.length === 1) {
    if (resource === "gantt" && method === "GET")
      return listGanttApplications(userId, query());
    if (resource === "board" && method === "GET")
      return getApplicationBoard(userId, query());
    if (resource === "opportunities") {
      if (method === "GET") return listOpportunities(userId, query());
      if (method === "POST")
        return createOpportunity(
          userId,
          await body(request, createOpportunitySchema),
        );
    }
    if (resource === "applications") {
      if (method === "GET") return listApplications(userId, query());
      if (method === "POST")
        return createApplication(
          userId,
          await body(request, createApplicationSchema),
        );
    }
  }
  if (
    resource === "opportunities" &&
    rawId === "candidates" &&
    path.length === 2 &&
    method === "POST"
  ) {
    const input = await body(
      request,
      z.object({ description: z.string().max(16000) }).strict(),
    );
    return listOpportunities(userId, {
      exactDescription: input.description,
      archived: "all",
    });
  }
  const id = z.string().uuid().parse(rawId);
  if (
    resource === "applications" &&
    path.length === 3 &&
    action === "stages" &&
    method === "GET"
  )
    return listStageMilestones(userId, id, query());
  if (path.length === 2 && resource === "opportunities") {
    if (method === "GET") return getOpportunity(userId, id);
    if (method === "PATCH")
      return updateOpportunity(
        userId,
        id,
        await body(request, updateOpportunitySchema),
      );
    if (method === "DELETE")
      return deleteOpportunity(
        userId,
        id,
        await body(request, revisionSchema.strict()),
      );
  }
  if (
    path.length === 3 &&
    resource === "opportunities" &&
    action === "reviews" &&
    method === "GET"
  ) {
    const input = z
      .object({
        cursor: z.string().max(4096).optional(),
        applicationId: z.string().uuid().optional(),
      })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return listJobReviews(userId, id, input.cursor, input.applicationId);
  }
  if (resource === "review-links" && path.length === 2) {
    if (method === "GET")
      return { context: await getReviewContext(userId, id) };
    if (method === "PUT")
      return saveReviewLink(userId, id, await body(request, jobContextSchema));
  }
  if (resource === "applications") {
    if (path.length === 2) {
      if (method === "GET") return getApplication(userId, id);
      if (method === "PATCH")
        return updateApplication(
          userId,
          id,
          await body(request, updateApplicationSchema),
        );
      if (method === "DELETE")
        return deleteApplication(
          userId,
          id,
          await body(request, revisionSchema.strict()),
        );
    }
    if (path.length === 3) {
      if (action === "stage" && method === "POST")
        return changeApplicationStage(
          userId,
          id,
          await body(request, changeStageSchema),
        );
      if (action === "sync" && method === "POST")
        return syncApplicationJob(
          userId,
          id,
          await body(request, syncJobSchema),
        );
      if (action === "events" && method === "GET")
        return listEvents(userId, id, query());
      if (action === "events" && method === "POST")
        return addFollowup(userId, id, await body(request, followupSchema));
    }
    if (path.length === 4 && action === "events") {
      const event = z.string().uuid().parse(eventId);
      if (method === "PATCH")
        return updateFollowup(
          userId,
          id,
          event,
          await body(request, editFollowupSchema),
        );
      if (method === "DELETE")
        return deleteFollowup(
          userId,
          id,
          event,
          await body(request, deleteFollowupSchema),
        );
    }
  }
  throw new JobSearchError("not_found");
}
export async function handleJobRequest(
  request: Request,
  context: JobRouteContext,
): Promise<Response> {
  let response: Response;
  try {
    const forbidden =
      request.method !== "GET" ? requireSameOrigin(request) : null;
    const session = forbidden ? null : await getOptionalSession();
    response =
      forbidden ??
      (!session
        ? Response.json({ error: "unauthorized" }, { status: 401 })
        : Response.json(
            await dispatch(
              session.user.id,
              request,
              (await context.params).path,
            ),
          ));
  } catch (error) {
    if (error instanceof JobSearchError)
      response = Response.json(
        { error: error.code },
        { status: jobErrorStatus(error.code) },
      );
    else if (error instanceof z.ZodError || error instanceof SyntaxError)
      response = Response.json({ error: "invalid_request" }, { status: 400 });
    else if (error instanceof RequestBodyTooLargeError)
      response = Response.json({ error: "payload_too_large" }, { status: 413 });
    else throw error;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
