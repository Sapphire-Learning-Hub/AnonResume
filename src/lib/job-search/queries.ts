import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import {
  db,
  jobOpportunities as j,
  jobApplications as a,
  jobApplicationEvents as e,
  resumes,
} from "@/db";
import {
  applicationStages,
  boardSchema,
  querySchema,
  stageSchema,
  type JobSearchQuery,
  type Opportunity,
  type JobApplication,
  type ApplicationEvent,
} from "@/domain/job-search/schema";
import { descriptionHash, type JobReader } from "./transaction";
import { ownedOpportunity, ownedApplication } from "./records";
import { JobSearchError } from "./errors";
const cursorSchema = z
  .object({
    id: z.string().uuid(),
    time: z
      .string()
      .max(64)
      .refine((s) => Number.isFinite(new Date(s).getTime())),
    filter: z.string(),
  })
  .strict();
function filtersKey(kind: string, userId: string, input: JobSearchQuery) {
  const filters = {
    q: input.q,
    archived: input.archived,
    opportunityId: input.opportunityId,
    stage: input.stage,
    exactDescription: input.exactDescription,
  };
  return JSON.stringify([kind, userId, filters]);
}
function cursorPosition(kind: string, userId: string, input: JobSearchQuery) {
  if (!input.cursor) return null;
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
    );
    if (value.filter !== filtersKey(kind, userId, input)) throw new Error();
    return value;
  } catch {
    throw new JobSearchError("invalid_cursor");
  }
}
function nextCursor(
  kind: string,
  userId: string,
  input: JobSearchQuery,
  rows: Array<{ item: { id: string }; stamp: string }>,
) {
  const last = rows[input.limit - 1];
  return rows.length > input.limit && last
    ? Buffer.from(
        JSON.stringify({
          id: last.item.id,
          time: last.stamp,
          filter: filtersKey(kind, userId, input),
        }),
      ).toString("base64url")
    : null;
}
function pattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}
function archiveFilter(
  column: typeof j.archived | typeof a.archived,
  input: JobSearchQuery,
) {
  return input.archived === "all"
    ? undefined
    : eq(column, input.archived === "archived");
}
async function opportunityDto(
  tx: JobReader,
  row: typeof j.$inferSelect,
): Promise<Opportunity> {
  const [{ value }] = await tx
    .select({ value: count() })
    .from(a)
    .where(and(eq(a.userId, row.userId), eq(a.opportunityId, row.id)));
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    description: row.description,
    url: row.url,
    source: row.source,
    notes: row.notes,
    archived: row.archived,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    applicationCount: value,
  };
}
// The terminal stage event is immutable; later notes must not extend completed bars.
const closedAtExpression = sql<
  string | null
>`CASE WHEN ${a.stage} IN ('offered','rejected','withdrawn') THEN
  (SELECT ${e.occurredAt}::text FROM ${e} WHERE ${e.applicationId}=${a.id} AND ${e.userId}=${a.userId}
    AND ${e.kind}='stage_changed' AND ${e.toStage}=${a.stage} AND ${e.fromStage}<>${e.toStage}
    ORDER BY ${e.createdAt} DESC, ${e.id} DESC LIMIT 1) ELSE NULL END`;
const rejectedFromExpression = sql<
  string | null
>`CASE WHEN ${a.stage}='rejected' THEN
  (SELECT ${e.fromStage} FROM ${e} WHERE ${e.applicationId}=${a.id} AND ${e.userId}=${a.userId}
    AND ${e.kind}='stage_changed' AND ${e.toStage}='rejected' AND ${e.fromStage}<>'rejected'
    ORDER BY ${e.createdAt} DESC, ${e.id} DESC LIMIT 1) ELSE NULL END`;
function applicationDto(
  row: typeof a.$inferSelect,
  resumeName: string | null,
  closedAt: string | null,
  rejectedFromStage: string | null,
): JobApplication {
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    snapshot: row.snapshot,
    resumeId: row.resumeId,
    resumeName,
    closedAt: closedAt ? new Date(closedAt).toISOString() : null,
    rejectedFromStage: rejectedFromStage
      ? stageSchema.parse(rejectedFromStage)
      : null,
    resumeAvailable: resumeName !== null,
    stage: row.stage,
    channel: row.channel,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    notes: row.notes,
    archived: row.archived,
    version: row.version,
    activityAt: row.activityAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
const resumeJoin = (userId: string) =>
  and(
    eq(resumes.id, a.resumeId),
    eq(resumes.userId, userId),
    eq(resumes.kind, "standard"),
    isNull(resumes.deletedAt),
  );
export async function getOpportunity(userId: string, id: string) {
  return opportunityDto(db, await ownedOpportunity(db, userId, id));
}
export async function getApplication(userId: string, id: string) {
  const [entry] = await db
    .select({
      item: a,
      resumeName: resumes.name,
      closedAt: closedAtExpression,
      rejectedFromStage: rejectedFromExpression,
    })
    .from(a)
    .leftJoin(resumes, resumeJoin(userId))
    .where(and(eq(a.userId, userId), eq(a.id, id)))
    .limit(1);
  if (!entry) throw new JobSearchError("not_found");
  return applicationDto(
    entry.item,
    entry.resumeName,
    entry.closedAt,
    entry.rejectedFromStage,
  );
}
export async function listOpportunities(
  userId: string,
  raw: Partial<JobSearchQuery>,
) {
  const input = querySchema.parse(raw);
  const cursor = cursorPosition("jobs", userId, input);
  return db.transaction(
    async (tx) => {
      const predicate = and(
        eq(j.userId, userId),
        archiveFilter(j.archived, input),
        input.q
          ? or(
              ...[j.title, j.company, j.description, j.source, j.notes].map(
                (column) => ilike(column, pattern(input.q)),
              ),
            )
          : undefined,
        input.exactDescription !== undefined
          ? eq(j.descriptionHash, descriptionHash(input.exactDescription))
          : undefined,
      );
      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(j)
        .where(predicate);
      const rows = await tx
        .select({ item: j, stamp: sql<string>`${j.updatedAt}::text` })
        .from(j)
        .where(
          and(
            predicate,
            cursor
              ? or(
                  sql`${j.updatedAt}<${cursor.time}::timestamptz`,
                  and(
                    sql`${j.updatedAt}=${cursor.time}::timestamptz`,
                    sql`${j.id}<${cursor.id}::uuid`,
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(j.updatedAt), desc(j.id))
        .limit(input.limit + 1);
      const items = [];
      for (const { item } of rows.slice(0, input.limit))
        items.push(await opportunityDto(tx, item));
      return {
        total,
        nextCursor: nextCursor("jobs", userId, input, rows),
        items,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
function applicationPredicate(
  userId: string,
  input: JobSearchQuery,
): SQL | undefined {
  return and(
    eq(a.userId, userId),
    archiveFilter(a.archived, input),
    input.opportunityId ? eq(a.opportunityId, input.opportunityId) : undefined,
    input.stage ? eq(a.stage, input.stage) : undefined,
    input.q
      ? sql`concat_ws(' ',${a.snapshot}->>'title',${a.snapshot}->>'company',${a.snapshot}->>'description',${a.snapshot}->>'source',${a.notes},${a.channel}) ILIKE ${pattern(input.q)}`
      : undefined,
  );
}
export async function applicationPage(
  tx: JobReader,
  userId: string,
  input: JobSearchQuery,
) {
  const cursor = cursorPosition("applications", userId, input);
  const predicate = applicationPredicate(userId, input);
  const [{ value: total }] = await tx
    .select({ value: count() })
    .from(a)
    .where(predicate);
  const rows = await tx
    .select({
      item: a,
      stamp: sql<string>`${a.activityAt}::text`,
      resumeName: resumes.name,
      closedAt: closedAtExpression,
      rejectedFromStage: rejectedFromExpression,
    })
    .from(a)
    .leftJoin(resumes, resumeJoin(userId))
    .where(
      and(
        predicate,
        cursor
          ? or(
              sql`${a.activityAt}<${cursor.time}::timestamptz`,
              and(
                sql`${a.activityAt}=${cursor.time}::timestamptz`,
                sql`${a.id}<${cursor.id}::uuid`,
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(a.activityAt), desc(a.id))
    .limit(input.limit + 1);
  return {
    total,
    nextCursor: nextCursor("applications", userId, input, rows),
    items: rows
      .slice(0, input.limit)
      .map(({ item, resumeName, closedAt, rejectedFromStage }) =>
        applicationDto(item, resumeName, closedAt, rejectedFromStage),
      ),
  };
}
export async function listApplications(
  userId: string,
  raw: Partial<JobSearchQuery>,
) {
  return db.transaction(
    (tx) => applicationPage(tx, userId, querySchema.parse(raw)),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function getApplicationBoard(
  userId: string,
  raw: Partial<JobSearchQuery>,
) {
  const input = querySchema.parse(raw);
  return db.transaction(
    async (tx) => {
      const entries = [];
      for (const stage of applicationStages)
        entries.push([
          stage,
          await applicationPage(tx, userId, {
            ...input,
            stage,
            cursor: undefined,
          }),
        ] as const);
      return boardSchema.parse(Object.fromEntries(entries));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function listEvents(
  userId: string,
  id: string,
  raw: Partial<JobSearchQuery>,
) {
  await ownedApplication(db, userId, id);
  const input = querySchema.parse(raw);
  const kind = `events:${id}`;
  const cursor = cursorPosition(kind, userId, input);
  return db.transaction(
    async (tx) => {
      const predicate = and(eq(e.userId, userId), eq(e.applicationId, id));
      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(e)
        .where(predicate);
      const rows = await tx
        .select({ item: e, stamp: sql<string>`${e.occurredAt}::text` })
        .from(e)
        .where(
          and(
            predicate,
            cursor
              ? or(
                  sql`${e.occurredAt}<${cursor.time}::timestamptz`,
                  and(
                    sql`${e.occurredAt}=${cursor.time}::timestamptz`,
                    sql`${e.id}<${cursor.id}::uuid`,
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(e.occurredAt), desc(e.id))
        .limit(input.limit + 1);
      const items: ApplicationEvent[] = rows
        .slice(0, input.limit)
        .map(({ item: row }) => ({
          id: row.id,
          kind: row.kind,
          body: row.body,
          fromStage: row.fromStage,
          toStage: row.toStage,
          occurredAt: row.occurredAt.toISOString(),
          version: row.version,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }));
      return {
        items,
        total,
        nextCursor: nextCursor(kind, userId, input, rows),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
