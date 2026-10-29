import { and, asc, eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import {
  db,
  getDatabaseSchemaName,
  jobOpportunities,
  jobApplications,
  jobApplicationEvents,
  jobReviewLinks,
} from "@/db";
function table(name: string) {
  return `"${getDatabaseSchemaName().replaceAll('"', '""')}"."${name}"`;
}
export async function transferJobSearchData(
  client: PoolClient,
  primary: string,
  secondary: string,
) {
  await client.query(
    `UPDATE ${table("job_search_operations")} s SET operation_id=gen_random_uuid() WHERE s.user_id=$1 AND EXISTS (SELECT 1 FROM ${table("job_search_operations")} p WHERE p.user_id=$2 AND p.operation_id=s.operation_id)`,
    [secondary, primary],
  );
  for (const name of [
    "job_opportunities",
    "job_applications",
    "job_application_events",
    "job_review_links",
    "job_search_operations",
  ])
    await client.query(
      `UPDATE ${table(name)} SET user_id=$2 WHERE user_id=$1`,
      [secondary, primary],
    );
}
export async function deleteJobSearchData(client: PoolClient, userId: string) {
  for (const name of [
    "job_review_links",
    "job_application_events",
    "job_applications",
    "job_search_operations",
    "job_opportunities",
  ])
    await client.query(`DELETE FROM ${table(name)} WHERE user_id=$1`, [userId]);
}
export async function loadJobSearchExport(userId: string) {
  const opportunities = await db
    .select({
      id: jobOpportunities.id,
      title: jobOpportunities.title,
      company: jobOpportunities.company,
      description: jobOpportunities.description,
      url: jobOpportunities.url,
      source: jobOpportunities.source,
      notes: jobOpportunities.notes,
      archived: jobOpportunities.archived,
      createdAt: jobOpportunities.createdAt,
      updatedAt: jobOpportunities.updatedAt,
    })
    .from(jobOpportunities)
    .where(eq(jobOpportunities.userId, userId))
    .orderBy(asc(jobOpportunities.createdAt), asc(jobOpportunities.id));
  const applications = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.userId, userId))
    .orderBy(asc(jobApplications.createdAt), asc(jobApplications.id));
  const events = await db
    .select()
    .from(jobApplicationEvents)
    .innerJoin(
      jobApplications,
      and(
        eq(jobApplications.id, jobApplicationEvents.applicationId),
        eq(jobApplications.userId, userId),
      ),
    )
    .where(eq(jobApplicationEvents.userId, userId))
    .orderBy(
      asc(jobApplicationEvents.occurredAt),
      asc(jobApplicationEvents.id),
    );
  const reviews = await db
    .select()
    .from(jobReviewLinks)
    .where(eq(jobReviewLinks.userId, userId))
    .orderBy(asc(jobReviewLinks.createdAt), asc(jobReviewLinks.reviewId));
  return {
    opportunities,
    applications: applications.map(({ userId, ...item }) => {
      void userId;
      return item;
    }),
    events: events.map(({ job_application_events: { userId, ...item } }) => {
      void userId;
      return item;
    }),
    reviews: reviews.map(({ userId, ...item }) => {
      void userId;
      return item;
    }),
  };
}
