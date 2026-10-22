import { z } from "zod";
import type { ResumeDocument } from "@/domain/resume/schema";
import type { AppLocale } from "@/i18n/messages";

export const templateNameSchema = z
  .string()
  .trim()
  .refine(
    (value) => Array.from(value).length >= 1 && Array.from(value).length <= 100,
  );
const version = z.number().int().positive();
const source = { resumeId: z.string().min(1).max(200), sourceVersion: version };
const operationId = z.uuid();
export const saveTemplateSchema = z
  .object({ ...source, name: templateNameSchema, operationId })
  .strict();
export const replaceTemplateSchema = z
  .object({ ...source, templateVersion: version, operationId })
  .strict();
export const renameTemplateSchema = z
  .object({ name: templateNameSchema, version })
  .strict();
export const deleteTemplateSchema = z.object({ version }).strict();
export const instantiateTemplateSchema = z
  .object({ templateVersion: version, operationId })
  .strict();
export const templateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  version,
  createdAt: z.number(),
  updatedAt: z.number(),
});
export const templatePageSchema = z.object({
  items: z.array(templateSummarySchema),
  nextCursor: z.string().nullable(),
});
export const savedTemplateSchema = z.object({
  templateId: z.string(),
  version,
});
export type TemplateSummary = z.infer<typeof templateSummarySchema>;
export type TemplatePage = z.infer<typeof templatePageSchema>;
export type TemplateDetail = TemplateSummary & { document: ResumeDocument };
export type TemplateSource = { resumeId: string; sourceVersion: number };
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;
export type ReplaceTemplateInput = z.infer<typeof replaceTemplateSchema> & {
  templateId: string;
};
export type InstantiateTemplateInput = z.infer<
  typeof instantiateTemplateSchema
> & { templateId: string; locale: AppLocale };
export type SavedTemplateResult = z.infer<typeof savedTemplateSchema>;
