import type { db } from "@/db";
import { sql } from "drizzle-orm";

export type ResumeTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export async function databaseNow(transaction: ResumeTransaction) {
  const { value } = (
    await transaction.execute<{ value: string }>(
      sql`SELECT clock_timestamp()::text AS value`,
    )
  ).rows[0]!;
  return new Date(value);
}
