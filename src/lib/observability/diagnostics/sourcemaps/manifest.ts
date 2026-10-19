import { z } from "zod";

export const buildKeySchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/).refine((value) => !value.includes(".."));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const artifactSchema = z.object({
  asset: z.string().max(512).refine((value) => /^(?:\/_next\/static\/|\.next\/server\/)[a-zA-Z0-9_./@+()[\]-]+\.js$/.test(value) && !value.split("/").includes("..")),
  assetDigest: digest,
  map: z.string().regex(/^[a-f0-9]{64}\.map$/),
  mapDigest: digest,
}).strict();
export const manifestSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  buildId: buildKeySchema,
  commit: z.string().max(128).nullable(),
  assets: z.array(artifactSchema).max(100_000),
}).strict();
export type Artifact = z.infer<typeof artifactSchema>;
export type SourceManifest = z.infer<typeof manifestSchema>;
