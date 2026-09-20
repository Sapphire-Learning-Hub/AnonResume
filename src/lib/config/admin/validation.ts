import { z } from "zod";

import {
  CONFIG_REGISTRY,
  managedConfigSchema,
  type ConfigKey,
  type ManagedConfig,
} from "@/lib/config/registry";

const configKeys = Object.keys(CONFIG_REGISTRY) as [ConfigKey, ...ConfigKey[]];

export const configKeySchema = z.enum(configKeys);

export const draftPatchSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    draftRevisionId: z.string().uuid(),
    changes: z
      .array(
        z.discriminatedUnion("operation", [
          z.object({
            key: configKeySchema,
            operation: z.literal("set"),
            value: z.unknown(),
          }),
          z.object({
            key: configKeySchema,
            operation: z.literal("clear"),
          }),
        ]),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<ConfigKey>();
    for (const [index, change] of value.changes.entries()) {
      if (seen.has(change.key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate configuration key",
          path: ["changes", index, "key"],
        });
      }
      seen.add(change.key);
    }
  });

export type ConfigurationDraftPatch = z.infer<typeof draftPatchSchema>;

export class ConfigurationValidationError extends Error {
  readonly code = "configuration_invalid";

  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("configuration_invalid");
    this.name = "ConfigurationValidationError";
  }
}

function cloneDefault<Key extends ConfigKey>(key: Key): ManagedConfig[Key] {
  const value = CONFIG_REGISTRY[key].defaultValue;
  return (Array.isArray(value) ? [...value] : value) as ManagedConfig[Key];
}

export function parseConfigurationDraftPatch(input: unknown) {
  const result = draftPatchSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigurationValidationError(result.error.issues);
  }
  return result.data;
}

export function applyConfigurationChanges(
  current: ManagedConfig,
  changes: ConfigurationDraftPatch["changes"],
) {
  const candidate = { ...current } as Record<ConfigKey, unknown>;
  for (const change of changes) {
    candidate[change.key] = change.operation === "clear"
      ? cloneDefault(change.key)
      : change.value;
  }

  const result = managedConfigSchema.safeParse(candidate);
  if (!result.success) {
    throw new ConfigurationValidationError(result.error.issues);
  }
  return result.data;
}
