import { z } from "zod";

export const DIAGNOSTIC_HEADER = "x-diagnostic-id";
export const traceparentSchema = z
  .string()
  .regex(/^00-(?!0{32})[a-f0-9]{32}-(?!0{16})[a-f0-9]{16}-0[01]$/);
export const diagnosticContextSchema = z
  .object({
    version: z.literal(1),
    diagnosticId: z.string().uuid(),
    originRequestId: z.string().uuid().nullable(),
    traceparent: traceparentSchema.nullable(),
  })
  .strict();
export type DiagnosticContext = z.infer<typeof diagnosticContextSchema>;

export function readResponseDiagnostic(response: Response): string | undefined {
  const result = z
    .string()
    .uuid()
    .safeParse(response.headers.get(DIAGNOSTIC_HEADER));
  return result.success ? result.data : undefined;
}

const references = new WeakMap<object, string>();
export function attachErrorDiagnostic<T extends object>(
  error: T,
  id?: string,
): T {
  if (id && z.string().uuid().safeParse(id).success) references.set(error, id);
  return error;
}
export function getErrorDiagnostic(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? references.get(error)
    : undefined;
}
