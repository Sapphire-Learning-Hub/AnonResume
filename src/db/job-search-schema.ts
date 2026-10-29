import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type PgTableFn,
} from "drizzle-orm/pg-core";
import type {
  ApplicationStage,
  ApplicationEventKind,
  JobSnapshot,
} from "@/domain/job-search/schema";
import { aiResumeReviews } from "./ai-schema";
import { getDatabaseSchemaName } from "./schema";
const schemaName = getDatabaseSchemaName();
const table: PgTableFn<string | undefined> =
  schemaName === "public" ? pgTable : pgSchema(schemaName).table;
const dates = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const jobOpportunities = table(
  "job_opportunities",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    company: text("company").notNull().default(""),
    description: text("description").notNull().default(""),
    descriptionHash: text("description_hash").notNull(),
    url: text("url").notNull().default(""),
    source: text("source").notNull().default(""),
    notes: text("notes").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    version: integer("version").notNull().default(1),
    ...dates(),
  },
  (t) => [
    index("job_opportunities_owner_recent_idx").on(
      t.userId,
      t.updatedAt.desc(),
      t.id.desc(),
    ),
    index("job_opportunities_description_idx").on(t.userId, t.descriptionHash),
    check("job_opportunities_version_check", sql`${t.version}>0`),
    check(
      "job_opportunities_title_check",
      sql`char_length(${t.title}) BETWEEN 1 AND 200`,
    ),
  ],
);
export const jobApplications = table(
  "job_applications",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    opportunityId: uuid("opportunity_id").references(
      () => jobOpportunities.id,
      { onDelete: "set null" },
    ),
    snapshot: jsonb("snapshot").$type<JobSnapshot>().notNull(),
    resumeId: text("resume_id"),
    stage: text("stage").$type<ApplicationStage>().notNull().default("pending"),
    channel: text("channel").notNull().default(""),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    activityAt: timestamp("activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer("version").notNull().default(1),
    ...dates(),
  },
  (t) => [
    index("job_applications_owner_stage_idx").on(
      t.userId,
      t.archived,
      t.stage,
      t.activityAt.desc(),
      t.id.desc(),
    ),
    index("job_applications_opportunity_idx").on(t.userId, t.opportunityId),
    check(
      "job_applications_stage_check",
      sql`${t.stage} IN ('pending','applied','screening_passed','communicating','ai_interview','personality_assessment','written_test','interviewing','interview_1','interview_2','interview_3','manager_interview','hr_interview','verbal_offer','offered','rejected','withdrawn')`,
    ),
    check(
      "job_applications_date_check",
      sql`(${t.stage} = 'pending' AND ${t.appliedAt} IS NULL) OR (${t.stage} = 'withdrawn') OR (${t.stage} NOT IN ('pending','withdrawn') AND ${t.appliedAt} IS NOT NULL)`,
    ),
    check("job_applications_version_check", sql`${t.version}>0`),
  ],
);
export const jobApplicationEvents = table(
  "job_application_events",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => jobApplications.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ApplicationEventKind>().notNull(),
    fromStage: text("from_stage").$type<ApplicationStage>(),
    toStage: text("to_stage").$type<ApplicationStage>(),
    body: text("body").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    version: integer("version").notNull().default(1),
    ...dates(),
  },
  (t) => [
    index("job_events_application_recent_idx").on(
      t.userId,
      t.applicationId,
      t.occurredAt.desc(),
      t.id.desc(),
    ),
    check(
      "job_events_kind_check",
      sql`${t.kind} IN ('created','stage_changed','updated','synced','archived','unarchived','followup')`,
    ),
    check("job_events_version_check", sql`${t.version}>0`),
  ],
);
export const jobReviewLinks = table(
  "job_review_links",
  {
    userId: text("user_id").notNull(),
    reviewId: uuid("review_id")
      .primaryKey()
      .references(() => aiResumeReviews.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => jobApplications.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("job_review_links_owner_job_idx").on(
      t.userId,
      t.opportunityId,
      t.createdAt.desc(),
    ),
  ],
);
export const jobSearchOperations = table(
  "job_search_operations",
  {
    userId: text("user_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    kind: text("kind").notNull(),
    requestHash: text("request_hash").notNull(),
    result: jsonb("result")
      .$type<{ id: string; applicationId?: string | null }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.operationId] })],
);
export const jobSearchDatabaseTables = {
  jobOpportunities,
  jobApplications,
  jobApplicationEvents,
  jobReviewLinks,
  jobSearchOperations,
};
