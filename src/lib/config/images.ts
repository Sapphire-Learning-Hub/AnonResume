import { z } from "zod";

export const imageConfigFields = {
  imagesEnabled: z.boolean(),
  imageStorage: z.enum(["local", "s3"]),
  imageUploadLimitMiB: z.number().int().min(1).max(10),
  imageAccountQuotaMiB: z.number().int().min(13).max(102400),
  imageS3Endpoint: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    }),
  imageS3Region: z.string().trim().max(100),
  imageS3Bucket: z.string().trim().max(63),
  imageS3Prefix: z
    .string()
    .max(200)
    .regex(/^(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/),
  imageS3AccessKeyId: z.string().trim().max(256),
  imageS3SecretAccessKey: z.string().max(512),
};
export function validateImageConfig(
  value: z.infer<z.ZodObject<typeof imageConfigFields>>,
  context: z.RefinementCtx,
) {
  if (value.imageStorage !== "s3") return;
  for (const key of [
    "imageS3Region",
    "imageS3Bucket",
    "imageS3AccessKeyId",
    "imageS3SecretAccessKey",
  ] as const) {
    if (!value[key])
      context.addIssue({
        code: "custom",
        path: [key],
        message: `${key} is required for S3 image storage`,
      });
  }
}
