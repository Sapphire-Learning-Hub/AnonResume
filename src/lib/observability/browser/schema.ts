import { z } from "zod";

export const clientFrameSchema = z
  .object({
    asset: z
      .string()
      .max(240)
      .regex(/^\/_next\/static\/[a-zA-Z0-9_./-]+\.js$/)
      .refine((value) => !value.includes("..")),
    line: z.number().int().min(1).max(10_000_000),
    column: z.number().int().min(1).max(1_000_000),
  })
  .strict();
export const clientEventSchema = z
  .object({
    eventId: z.uuid(),
    kind: z.enum(["render", "script", "promise"]),
    buildId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_.-]+$/),
    errorType: z.enum([
      "Error",
      "TypeError",
      "RangeError",
      "SyntaxError",
      "ReferenceError",
      "URIError",
      "AggregateError",
      "DOMException",
    ]),
    frames: z.array(clientFrameSchema).max(16),
    digest: z
      .string()
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
  })
  .strict()
  .refine((value) => value.frames.length > 0 || Boolean(value.digest));
export const clientReportSchema = z
  .object({
    version: z.literal(1),
    events: z.array(clientEventSchema).min(1).max(5),
  })
  .strict();
export type ClientDiagnosticEvent = z.infer<typeof clientEventSchema>;
