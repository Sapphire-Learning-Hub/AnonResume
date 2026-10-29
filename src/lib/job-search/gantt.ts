import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db, jobApplicationEvents as e } from "@/db";
import {
  querySchema,
  stageSchema,
  type StageMilestone,
  type StageMilestonePage,
  type JobSearchQuery,
} from "@/domain/job-search/schema";
import type { JobReader } from "./transaction";
import { applicationPage } from "./queries";
import { ownedApplication } from "./records";
import { JobSearchError } from "./errors";
const initialLimit = 50;
const realStage = or(
  eq(e.kind, "created"),
  and(
    eq(e.kind, "stage_changed"),
    isNotNull(e.toStage),
    ne(e.fromStage, e.toStage),
  ),
);
const cursorSchema = z
  .object({
    user: z.string(),
    application: z.uuid(),
    id: z.uuid(),
    recorded: z
      .string()
      .max(64)
      .refine((value) => Number.isFinite(Date.parse(value))),
    time: z
      .string()
      .max(64)
      .refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();
function cursor(
  userId: string,
  applicationId: string,
  row: { id: string; stamp: string; recordedStamp: string },
) {
  return Buffer.from(
    JSON.stringify({
      user: userId,
      application: applicationId,
      id: row.id,
      time: row.stamp,
      recorded: row.recordedStamp,
    }),
  ).toString("base64url");
}
function milestone(row: {
  id: string;
  stage: string | null;
  fromStage: string | null;
  occurredAt: Date;
  recordedAt: Date;
}): StageMilestone {
  return {
    id: row.id,
    stage: stageSchema.parse(row.stage),
    fromStage: row.fromStage ? stageSchema.parse(row.fromStage) : null,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
  };
}
async function batchMilestones(tx: JobReader, userId: string, ids: string[]) {
  const result = new Map<string, StageMilestonePage>();
  if (!ids.length) return result;
  const ranked = tx
    .select({
      applicationId: e.applicationId,
      id: e.id,
      fromStage: e.fromStage,
      occurredAt: e.occurredAt,
      recordedAt: e.createdAt,
      stage:
        sql<string>`CASE WHEN ${e.kind}='created' THEN 'pending' ELSE ${e.toStage} END`.as(
          "milestone_stage",
        ),
      stamp: sql<string>`${e.occurredAt}::text`.as("milestone_stamp"),
      recordedStamp: sql<string>`${e.createdAt}::text`.as(
        "milestone_recorded_stamp",
      ),
      total: sql<number>`count(*) OVER (PARTITION BY ${e.applicationId})`
        .mapWith(Number)
        .as("milestone_total"),
      rank: sql<number>`row_number() OVER (PARTITION BY ${e.applicationId} ORDER BY ${e.occurredAt} DESC,${e.createdAt} DESC,${e.id} DESC)`
        .mapWith(Number)
        .as("milestone_rank"),
    })
    .from(e)
    .where(and(eq(e.userId, userId), inArray(e.applicationId, ids), realStage))
    .as("ranked_milestones");
  const rows = await tx
    .select()
    .from(ranked)
    .where(lte(ranked.rank, initialLimit + 1))
    .orderBy(ranked.applicationId, ranked.rank);
  for (const row of rows) {
    const page = result.get(row.applicationId) ?? {
      items: [],
      total: row.total,
      nextCursor: null,
    };
    if (row.rank <= initialLimit) {
      page.items.push(milestone(row));
      if (row.rank === initialLimit && row.total > initialLimit)
        page.nextCursor = cursor(userId, row.applicationId, row);
    }
    result.set(row.applicationId, page);
  }
  return result;
}
export async function listGanttApplications(
  userId: string,
  raw: Partial<JobSearchQuery>,
) {
  return db.transaction(
    async (tx) => {
      const page = await applicationPage(tx, userId, querySchema.parse(raw));
      const stages = await batchMilestones(
        tx,
        userId,
        page.items.map((app) => app.id),
      );
      return {
        ...page,
        items: page.items.map((app) => ({
          ...app,
          milestones: stages.get(app.id) ?? {
            items: [],
            total: 0,
            nextCursor: null,
          },
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function listStageMilestones(
  userId: string,
  applicationId: string,
  raw: Partial<JobSearchQuery>,
) {
  const input = querySchema.parse(raw);
  let position: z.infer<typeof cursorSchema> | undefined;
  if (input.cursor) {
    try {
      position = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
      );
      if (position.user !== userId || position.application !== applicationId)
        throw new Error();
    } catch {
      throw new JobSearchError("invalid_cursor");
    }
  }
  return db.transaction(
    async (tx) => {
      await ownedApplication(tx, userId, applicationId);
      const predicate = and(
        eq(e.userId, userId),
        eq(e.applicationId, applicationId),
        realStage,
      );
      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(e)
        .where(predicate);
      const rows = await tx
        .select({
          id: e.id,
          fromStage: e.fromStage,
          occurredAt: e.occurredAt,
          recordedAt: e.createdAt,
          stage: sql<string>`CASE WHEN ${e.kind}='created' THEN 'pending' ELSE ${e.toStage} END`,
          stamp: sql<string>`${e.occurredAt}::text`,
          recordedStamp: sql<string>`${e.createdAt}::text`,
        })
        .from(e)
        .where(
          and(
            predicate,
            position
              ? or(
                  sql`${e.occurredAt}<${position.time}::timestamptz`,
                  and(
                    sql`${e.occurredAt}=${position.time}::timestamptz`,
                    or(
                      sql`${e.createdAt}<${position.recorded}::timestamptz`,
                      and(
                        sql`${e.createdAt}=${position.recorded}::timestamptz`,
                        sql`${e.id}<${position.id}::uuid`,
                      ),
                    ),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(e.occurredAt), desc(e.createdAt), desc(e.id))
        .limit(input.limit + 1);
      const last = rows[input.limit - 1];
      return {
        items: rows.slice(0, input.limit).map(milestone),
        total,
        nextCursor:
          rows.length > input.limit && last
            ? cursor(userId, applicationId, last)
            : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
