import { z } from "zod";

export const locationSchema = z.object({
  version: z.literal(1),
  build: z.string().max(128),
  generated: z.object({ asset: z.string().max(512), line: z.number().int().positive(), column: z.number().int().positive() }),
  original: z.object({ source: z.string().max(512), line: z.number().int().positive(), column: z.number().int().positive() }).nullable(),
  status: z.enum(["mapped", "source", "missing_artifact", "invalid_artifact", "asset_missing", "unmapped"]),
  assetDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});
export type DiagnosticLocation = z.infer<typeof locationSchema>;
