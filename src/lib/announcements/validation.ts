import { z } from "zod";

const optionalText = (maximum: number) =>
  z
    .preprocess(
      (value) => value ?? null,
      z.union([z.string().max(maximum), z.null()]),
    )
    .transform((value) => value?.trim() || null);

const optionalDate = z
  .preprocess(
    (value) => value ?? null,
    z.union([z.iso.datetime({ offset: true }), z.null()]),
  )
  .transform((value) => (value ? new Date(value) : null));

const announcementDraftSchema = z
  .object({
    titleZh: z.string().trim().min(1).max(120),
    bodyZh: z.string().trim().min(1).max(1_000),
    titleEn: optionalText(160),
    bodyEn: optionalText(1_200),
    tone: z.enum(["info", "warning", "critical"]),
    audience: z.enum(["all", "authenticated"]),
    dismissible: z.boolean(),
    expiresAt: optionalDate,
  })
  .superRefine((value, context) => {
    if (Boolean(value.titleEn) !== Boolean(value.bodyEn)) {
      context.addIssue({
        code: "custom",
        message: "English title and body must be provided together",
        path: value.titleEn ? ["bodyEn"] : ["titleEn"],
      });
    }
  });

export type AnnouncementDraftInput = z.infer<typeof announcementDraftSchema>;

export function parseAnnouncementDraft(value: unknown): AnnouncementDraftInput {
  return announcementDraftSchema.parse(value);
}
