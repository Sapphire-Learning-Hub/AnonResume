import { z } from "zod";

export const applicationStages = [
  "pending",
  "applied",
  "screening_passed",
  "communicating",
  "ai_interview",
  "personality_assessment",
  "written_test",
  "interviewing",
  "interview_1",
  "interview_2",
  "interview_3",
  "manager_interview",
  "hr_interview",
  "verbal_offer",
  "offered",
  "rejected",
  "withdrawn",
] as const;
export const stageSchema = z.enum(applicationStages);
export type ApplicationStage = z.infer<typeof stageSchema>;
const text = (max: number) => z.string().trim().max(max).default("");
const httpUrl = text(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}, "invalid_job_url");
export const jobFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    company: text(200),
    description: text(16000),
    url: httpUrl,
    source: text(100),
    notes: text(8000),
  })
  .strict();
export type JobFields = z.infer<typeof jobFieldsSchema>;
export const jobSnapshotSchema = jobFieldsSchema.omit({ notes: true });
export type JobSnapshot = z.infer<typeof jobSnapshotSchema>;
export const operationSchema = z.object({ operationId: z.string().uuid() });
export const revisionSchema = operationSchema.extend({
  version: z.number().int().positive(),
});
export const createOpportunitySchema = jobFieldsSchema
  .extend({
    operationId: z.string().uuid(),
    createApplication: z.boolean().default(true),
    reviewId: z.string().uuid().optional(),
  })
  .strict();
export const updateOpportunitySchema = jobFieldsSchema
  .extend({
    operationId: z.string().uuid(),
    version: z.number().int().positive(),
    archived: z.boolean().optional(),
  })
  .strict();
export const createApplicationSchema = operationSchema
  .extend({
    opportunityId: z.string().uuid(),
    resumeId: z.string().min(1).max(200).nullable().default(null),
    channel: text(100),
    notes: text(8000),
  })
  .strict();
export const updateApplicationSchema = revisionSchema
  .extend({
    resumeId: z.string().min(1).max(200).nullable().default(null),
    channel: text(100),
    notes: text(8000),
    archived: z.boolean().optional(),
  })
  .strict();
export const changeStageSchema = revisionSchema
  .extend({
    stage: stageSchema,
    appliedAt: z.iso.datetime().optional(),
    confirmReset: z.boolean().default(false),
  })
  .strict();
export const followupSchema = revisionSchema
  .extend({
    body: z.string().trim().min(1).max(8000),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export const editFollowupSchema = followupSchema
  .extend({ eventVersion: z.number().int().positive() })
  .strict();
export const deleteFollowupSchema = revisionSchema
  .extend({ eventVersion: z.number().int().positive() })
  .strict();
export const jobContextSchema = z
  .object({
    opportunityId: z.string().uuid(),
    applicationId: z.string().uuid().optional(),
  })
  .strict();
export type JobReviewContext = z.infer<typeof jobContextSchema>;
const timestamps = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
export const opportunitySchema = jobFieldsSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  archived: z.boolean(),
  applicationCount: z.number().int().nonnegative(),
  ...timestamps,
});
export type Opportunity = z.infer<typeof opportunitySchema>;
export const applicationSchema = z.object({
  id: z.string().uuid(),
  opportunityId: z.string().uuid().nullable(),
  snapshot: jobSnapshotSchema,
  resumeId: z.string().nullable(),
  resumeName: z.string().nullable(),
  resumeAvailable: z.boolean(),
  stage: stageSchema,
  channel: z.string(),
  appliedAt: z.iso.datetime().nullable(),
  notes: z.string(),
  version: z.number().int().positive(),
  archived: z.boolean(),
  activityAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  rejectedFromStage: stageSchema.nullable(),
  ...timestamps,
});
export type JobApplication = z.infer<typeof applicationSchema>;
export const eventKinds = [
  "created",
  "stage_changed",
  "updated",
  "synced",
  "archived",
  "unarchived",
  "followup",
] as const;
export type ApplicationEventKind = (typeof eventKinds)[number];
export const applicationEventSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(eventKinds),
  body: z.string(),
  fromStage: stageSchema.nullable(),
  toStage: stageSchema.nullable(),
  occurredAt: z.iso.datetime(),
  version: z.number().int().positive(),
  ...timestamps,
});
export type ApplicationEvent = z.infer<typeof applicationEventSchema>;
export const reviewLinkSchema = z.object({
  reviewId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  applicationId: z.string().uuid().nullable(),
  available: z.boolean(),
  resumeId: z.string().nullable(),
  resumeName: z.string().nullable(),
  score: z.number().nullable(),
  status: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type JobReviewLink = z.infer<typeof reviewLinkSchema>;
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  });
export const opportunityPageSchema = pageSchema(opportunitySchema);
export const applicationPageSchema = pageSchema(applicationSchema);
export const stageMilestoneSchema = z.object({
  id: z.uuid(),
  stage: stageSchema,
  fromStage: stageSchema.nullable(),
  occurredAt: z.iso.datetime(),
  recordedAt: z.iso.datetime(),
});
export type StageMilestone = z.infer<typeof stageMilestoneSchema>;
export const stageMilestonePageSchema = pageSchema(stageMilestoneSchema);
export type StageMilestonePage = z.infer<typeof stageMilestonePageSchema>;
export const ganttApplicationSchema = applicationSchema.extend({
  milestones: stageMilestonePageSchema,
});
export const ganttPageSchema = pageSchema(ganttApplicationSchema);
export const eventPageSchema = pageSchema(applicationEventSchema);
export const reviewPageSchema = pageSchema(reviewLinkSchema);
export const boardSchema = z.record(stageSchema, applicationPageSchema);
export const savedOpportunitySchema = z.object({
  opportunity: opportunitySchema,
  applicationId: z.string().uuid().nullable(),
});
export const querySchema = z
  .object({
    q: z.string().max(200).default(""),
    archived: z.enum(["active", "archived", "all"]).default("active"),
    opportunityId: z.string().uuid().optional(),
    stage: stageSchema.optional(),
    cursor: z.string().max(4096).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    exactDescription: z.string().max(16000).optional(),
  })
  .strict();
export type JobSearchQuery = z.infer<typeof querySchema>;
