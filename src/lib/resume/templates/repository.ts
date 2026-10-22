import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db, resumeTemplates } from "@/db";
import type { ResumeTransaction } from "@/lib/resume/transaction";
import { TemplateError } from "./errors";
import type { TemplatePage, TemplateSummary } from "./types";

export const summaryColumns = {
  id: resumeTemplates.id,
  name: resumeTemplates.name,
  version: resumeTemplates.version,
  createdAt: resumeTemplates.createdAt,
  updatedAt: resumeTemplates.updatedAt,
};
export function templateSummary(row: {
  id: string;
  name: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): TemplateSummary {
  return {
    ...row,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}
const cursorSchema = z
  .object({ id: z.string().min(1), time: z.iso.datetime(), query: z.string() })
  .strict();
export async function listPersonalTemplates({
  userId,
  query = "",
  cursor,
}: {
  userId: string;
  query?: string;
  cursor?: string;
}): Promise<TemplatePage> {
  query = query.trim();
  if (query.length > 100 || (cursor?.length ?? 0) > 2048)
    throw new TemplateError("invalid_request");
  let position: z.infer<typeof cursorSchema> | undefined;
  if (cursor) {
    try {
      position = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new TemplateError("invalid_request");
    }
    if (position.query !== query) throw new TemplateError("invalid_request");
  }
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const rows = await db
    .select(summaryColumns)
    .from(resumeTemplates)
    .where(
      and(
        eq(resumeTemplates.userId, userId),
        query ? ilike(resumeTemplates.name, `%${escaped}%`) : undefined,
        position
          ? or(
              lt(resumeTemplates.updatedAt, new Date(position.time)),
              and(
                eq(resumeTemplates.updatedAt, new Date(position.time)),
                lt(resumeTemplates.id, position.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(resumeTemplates.updatedAt), desc(resumeTemplates.id))
    .limit(21);
  const items = rows.slice(0, 20);
  const last = items.at(-1);
  return {
    items: items.map(templateSummary),
    nextCursor:
      rows.length > 20 && last
        ? Buffer.from(
            JSON.stringify({
              id: last.id,
              time: last.updatedAt.toISOString(),
              query,
            }),
          ).toString("base64url")
        : null,
  };
}

export async function ownedTemplate(
  executor: Pick<typeof db, "select"> | ResumeTransaction,
  userId: string,
  id: string,
  lock = false,
) {
  const query = executor
    .select()
    .from(resumeTemplates)
    .where(and(eq(resumeTemplates.userId, userId), eq(resumeTemplates.id, id)))
    .limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new TemplateError("template_not_found");
  return row;
}
