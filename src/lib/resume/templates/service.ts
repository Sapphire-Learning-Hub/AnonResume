import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, resumes, resumeTemplates } from "@/db";
import {
  createPersonalTemplateDocument,
  instantiatePersonalTemplateDocument,
} from "@/domain/resume/personal-templates/document";
import {
  createGeneratedResumeRecordInTransaction,
  lockOwnedResume,
  ResumeNotFoundError,
} from "@/lib/resume/repository";
import { databaseNow, type ResumeTransaction } from "@/lib/resume/transaction";
import { TemplateError } from "./errors";
import { lockTemplateAccount, templateOperation } from "./operations";
import { ownedTemplate, templateSummary } from "./repository";
import {
  saveTemplateSchema,
  replaceTemplateSchema,
  renameTemplateSchema,
  deleteTemplateSchema,
  instantiateTemplateSchema,
  type SaveTemplateInput,
  type ReplaceTemplateInput,
  type InstantiateTemplateInput,
  type TemplateDetail,
} from "./types";

export { listPersonalTemplates } from "./repository";
function documentSnapshot(document: unknown) {
  try {
    return createPersonalTemplateDocument(document);
  } catch {
    throw new TemplateError("template_document_unavailable");
  }
}
export async function getPersonalTemplate(
  userId: string,
  templateId: string,
): Promise<TemplateDetail> {
  const row = await ownedTemplate(db, userId, templateId);
  if (row.schemaVersion !== 1)
    throw new TemplateError("template_document_unavailable");
  return { ...templateSummary(row), document: documentSnapshot(row.document) };
}
function checkVersion(actual: number, expected: number) {
  if (actual !== expected) throw new TemplateError("template_version_conflict");
}
async function sourceDocument(
  tx: ResumeTransaction,
  userId: string,
  resumeId: string,
  version: number,
) {
  let row;
  try {
    row = await lockOwnedResume(tx, userId, resumeId);
  } catch (error) {
    if (error instanceof ResumeNotFoundError)
      throw new TemplateError("template_not_found");
    throw error;
  }
  if (row.kind !== "standard" || row.deletedAt)
    throw new TemplateError("template_not_found");
  if (row.version !== version)
    throw new TemplateError("template_source_conflict");
  return documentSnapshot(row.document);
}
async function mutate<T>(
  userId: string,
  callback: (tx: ResumeTransaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await lockTemplateAccount(tx, userId);
    return callback(tx);
  });
}
export async function savePersonalTemplate(
  userId: string,
  input: SaveTemplateInput,
) {
  const parsed = saveTemplateSchema.parse(input);
  return mutate(userId, async (tx) => {
    const result = await templateOperation(
      tx,
      userId,
      parsed.operationId,
      "save",
      parsed,
      async () => {
        const document = await sourceDocument(
          tx,
          userId,
          parsed.resumeId,
          parsed.sourceVersion,
        );
        const id = randomUUID();
        const now = await databaseNow(tx);
        await tx
          .insert(resumeTemplates)
          .values({
            id,
            userId,
            name: parsed.name,
            document,
            updatedAt: now,
            createdAt: now,
          });
        return { id, version: 1 };
      },
      async (id) => {
        await ownedTemplate(tx, userId, id);
      },
    );
    return { templateId: result.id, version: result.version };
  });
}
export async function replacePersonalTemplate(
  userId: string,
  input: ReplaceTemplateInput,
) {
  const { templateId, ...body } = input;
  const parsed = replaceTemplateSchema.parse(body);
  return mutate(userId, async (tx) => {
    const result = await templateOperation(
      tx,
      userId,
      parsed.operationId,
      "replace",
      { templateId, ...parsed },
      async () => {
        const document = await sourceDocument(
          tx,
          userId,
          parsed.resumeId,
          parsed.sourceVersion,
        );
        const current = await ownedTemplate(tx, userId, templateId, true);
        checkVersion(current.version, parsed.templateVersion);
        await tx
          .update(resumeTemplates)
          .set({
            document,
            schemaVersion: 1,
            version: current.version + 1,
            updatedAt: await databaseNow(tx),
          })
          .where(
            and(
              eq(resumeTemplates.id, templateId),
              eq(resumeTemplates.userId, userId),
            ),
          );
        return { id: templateId, version: current.version + 1 };
      },
      async (id) => {
        await ownedTemplate(tx, userId, id);
      },
    );
    return { templateId: result.id, version: result.version };
  });
}
export async function renamePersonalTemplate(input: {
  userId: string;
  templateId: string;
  version: number;
  name: string;
}) {
  const parsed = renameTemplateSchema.parse({
    name: input.name,
    version: input.version,
  });
  return mutate(input.userId, async (tx) => {
    const current = await ownedTemplate(
      tx,
      input.userId,
      input.templateId,
      true,
    );
    checkVersion(current.version, parsed.version);
    const [row] = await tx
      .update(resumeTemplates)
      .set({
        name: parsed.name,
        version: current.version + 1,
        updatedAt: await databaseNow(tx),
      })
      .where(
        and(
          eq(resumeTemplates.id, input.templateId),
          eq(resumeTemplates.userId, input.userId),
        ),
      )
      .returning();
    return templateSummary(row);
  });
}
export async function deletePersonalTemplate(input: {
  userId: string;
  templateId: string;
  version: number;
}) {
  deleteTemplateSchema.parse({ version: input.version });
  return mutate(input.userId, async (tx) => {
    const current = await ownedTemplate(
      tx,
      input.userId,
      input.templateId,
      true,
    );
    checkVersion(current.version, input.version);
    await tx
      .delete(resumeTemplates)
      .where(
        and(
          eq(resumeTemplates.id, input.templateId),
          eq(resumeTemplates.userId, input.userId),
        ),
      );
  });
}
export async function instantiatePersonalTemplate(
  userId: string,
  input: InstantiateTemplateInput,
) {
  const parsed = instantiateTemplateSchema.parse({
    templateVersion: input.templateVersion,
    operationId: input.operationId,
  });
  return mutate(userId, async (tx) => {
    const result = await templateOperation(
      tx,
      userId,
      parsed.operationId,
      "instantiate",
      { templateId: input.templateId, ...parsed, locale: input.locale },
      async () => {
        const current = await ownedTemplate(tx, userId, input.templateId, true);
        checkVersion(current.version, parsed.templateVersion);
        if (current.schemaVersion !== 1)
          throw new TemplateError("template_document_unavailable");
        const document = instantiatePersonalTemplateDocument(
          documentSnapshot(current.document),
          current.name,
        );
        const record = await createGeneratedResumeRecordInTransaction(tx, {
          userId,
          locale: input.locale,
          document,
        });
        return { id: record.id, version: record.version };
      },
      async (id) => {
        const [record] = await tx
          .select({ id: resumes.id, deletedAt: resumes.deletedAt })
          .from(resumes)
          .where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
        if (!record || record.deletedAt)
          throw new TemplateError("template_not_found");
      },
    );
    return { resumeId: result.id };
  });
}
