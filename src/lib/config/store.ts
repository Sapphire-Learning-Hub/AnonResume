import { and, asc, desc, eq, max, ne, sql } from "drizzle-orm";

import {
  db,
  systemConfigRevisions,
  systemConfigValues,
} from "@/db";
import {
  decryptConfigSecret,
  encryptConfigSecret,
  type ConfigKeyring,
  type EncryptedConfigSecret,
} from "@/lib/config/crypto";
import {
  CONFIG_REGISTRY,
  getManagedConfigDefaults,
  parseManagedConfig,
  type ConfigKey,
  type ManagedConfig,
} from "@/lib/config/registry";
import type {
  ConfigApplyMode,
  ConfigConsumer,
  ConfigGroup,
} from "@/lib/config/types";

const CONFIG_PUBLISH_LOCK = "anonresume:system-config:publish";
const SYSTEM_ACTOR = "system";

type RevisionRow = typeof systemConfigRevisions.$inferSelect;
type ValueRow = typeof systemConfigValues.$inferSelect;

export class ConfigurationRevisionConflictError extends Error {
  constructor() {
    super("configuration_revision_conflict");
    this.name = "ConfigurationRevisionConflictError";
  }
}

export class ConfigurationStateError extends Error {
  constructor(message = "configuration_state_invalid") {
    super(message);
    this.name = "ConfigurationStateError";
  }
}

export interface ConfigurationRevisionView {
  baseRevisionId: string | null;
  createdAt: Date;
  createdByUserId: string;
  id: string;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  status: RevisionRow["status"];
  summary: string | null;
  updatedAt: Date;
  version: number;
}

export interface ConfigSnapshot {
  desiredRevisionId: string | null;
  fallbackRevisionId: string | null;
  id: string | null;
  lastError: "active_revision_unreadable" | "no_readable_revision" | null;
  values: ManagedConfig;
  version: number | null;
}

export interface ConfigurationFieldState {
  applyMode: ConfigApplyMode;
  changed: boolean;
  configured: boolean;
  consumers: readonly ConfigConsumer[];
  group: ConfigGroup;
  key: ConfigKey;
  public: boolean;
  sensitive: boolean;
  value?: ManagedConfig[ConfigKey];
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function revisionView(revision: RevisionRow): ConfigurationRevisionView {
  return {
    baseRevisionId: revision.baseRevisionId,
    createdAt: revision.createdAt,
    createdByUserId: revision.createdByUserId,
    id: revision.id,
    publishedAt: revision.publishedAt,
    publishedByUserId: revision.publishedByUserId,
    status: revision.status,
    summary: revision.summary,
    updatedAt: revision.updatedAt,
    version: revision.version,
  };
}

function encodeSnapshot(
  revisionId: string,
  values: ManagedConfig,
  keyring: ConfigKeyring,
) {
  return (Object.keys(CONFIG_REGISTRY) as ConfigKey[]).map((key) => {
    const definition = CONFIG_REGISTRY[key];
    const value = values[key];

    return {
      revisionId,
      key,
      valueJson: definition.sensitive ? null : value,
      encryptedValue: definition.sensitive
        ? encryptConfigSecret(JSON.stringify(value), keyring, "managed-config")
        : null,
    };
  });
}

function decodeSnapshot(rows: ValueRow[], keyring: ConfigKeyring) {
  const values: Record<string, unknown> = {};

  for (const row of rows) {
    const key = row.key as ConfigKey;
    const definition = CONFIG_REGISTRY[key];
    if (!definition) {
      continue;
    }

    values[key] = definition.sensitive
      ? JSON.parse(
          decryptConfigSecret(
            row.encryptedValue as EncryptedConfigSecret,
            keyring,
            "managed-config",
          ),
        )
      : row.valueJson;
  }

  return parseManagedConfig(values);
}

async function readRevisionValues(revisionId: string, keyring: ConfigKeyring) {
  const rows = await db
    .select()
    .from(systemConfigValues)
    .where(eq(systemConfigValues.revisionId, revisionId));
  return decodeSnapshot(rows, keyring);
}

export async function readConfigurationRevisionValues(input: {
  keyring: ConfigKeyring;
  revisionId: string;
}) {
  return readRevisionValues(input.revisionId, input.keyring);
}

export async function ensureConfigurationState(input: {
  keyring: ConfigKeyring;
}) {
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${CONFIG_PUBLISH_LOCK}))`,
    );

    const revisions = await transaction
      .select()
      .from(systemConfigRevisions)
      .orderBy(asc(systemConfigRevisions.version));
    let active = revisions.find((revision) => revision.status === "active");
    let draft = revisions.find((revision) => revision.status === "draft");

    if (!active) {
      if (revisions.length > 0) {
        throw new ConfigurationStateError();
      }

      const [created] = await transaction
        .insert(systemConfigRevisions)
        .values({
          version: 1,
          status: "active",
          createdByUserId: SYSTEM_ACTOR,
          publishedByUserId: SYSTEM_ACTOR,
          publishedAt: new Date(),
          summary: "Initial safe defaults",
        })
        .returning();
      active = created;
      await transaction.insert(systemConfigValues).values(
        encodeSnapshot(created!.id, getManagedConfigDefaults(), input.keyring),
      );
    }

    if (!draft) {
      const maxVersion = revisions.reduce(
        (current, revision) => Math.max(current, revision.version),
        active!.version,
      );
      const activeRows = await transaction
        .select()
        .from(systemConfigValues)
        .where(eq(systemConfigValues.revisionId, active!.id));
      const [created] = await transaction
        .insert(systemConfigRevisions)
        .values({
          version: maxVersion + 1,
          status: "draft",
          baseRevisionId: active!.id,
          createdByUserId: SYSTEM_ACTOR,
        })
        .returning();
      draft = created;
      const values = decodeSnapshot(activeRows, input.keyring);
      await transaction
        .insert(systemConfigValues)
        .values(encodeSnapshot(draft!.id, values, input.keyring));
    }
  });
}

export async function getConfigurationState(input: {
  keyring: ConfigKeyring;
}) {
  const revisions = await db
    .select()
    .from(systemConfigRevisions)
    .orderBy(desc(systemConfigRevisions.version));
  const active = revisions.find((revision) => revision.status === "active");
  const draft = revisions.find((revision) => revision.status === "draft");
  if (!active || !draft) {
    throw new ConfigurationStateError();
  }

  const [activeValues, values] = await Promise.all([
    readRevisionValues(active.id, input.keyring),
    readRevisionValues(draft.id, input.keyring),
  ]);
  const fields = (Object.keys(CONFIG_REGISTRY) as ConfigKey[]).map((key) => {
    const definition = CONFIG_REGISTRY[key];
    const value = values[key];
    const field: ConfigurationFieldState = {
      applyMode: definition.applyMode,
      changed: !valuesEqual(activeValues[key], value),
      configured: definition.sensitive ? Boolean(value) : true,
      consumers: definition.consumers,
      group: definition.group,
      key,
      public: definition.public,
      sensitive: definition.sensitive,
    };
    if (!definition.sensitive) {
      field.value = value;
    }
    return field;
  });

  return {
    activeRevision: revisionView(active),
    draftRevision: revisionView(draft),
    fields,
    history: revisions
      .filter((revision) => revision.status !== "draft")
      .map(revisionView),
  };
}

export async function updateConfigurationDraft(input: {
  actorUserId: string;
  baseVersion: number;
  draftRevisionId: string;
  keyring: ConfigKeyring;
  values: Partial<ManagedConfig>;
}) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${CONFIG_PUBLISH_LOCK}))`,
    );
    const [active] = await transaction
      .select()
      .from(systemConfigRevisions)
      .where(eq(systemConfigRevisions.status, "active"))
      .limit(1);
    const [draft] = await transaction
      .select()
      .from(systemConfigRevisions)
      .where(
        and(
          eq(systemConfigRevisions.id, input.draftRevisionId),
          eq(systemConfigRevisions.status, "draft"),
        ),
      )
      .limit(1);
    if (
      !active ||
      !draft ||
      active.version !== input.baseVersion ||
      draft.baseRevisionId !== active.id
    ) {
      throw new ConfigurationRevisionConflictError();
    }

    const rows = await transaction
      .select()
      .from(systemConfigValues)
      .where(eq(systemConfigValues.revisionId, draft.id));
    const values = parseManagedConfig({
      ...decodeSnapshot(rows, input.keyring),
      ...input.values,
    });

    const encodedValues = encodeSnapshot(draft.id, values, input.keyring);
    for (const encoded of encodedValues) {
      if (
        CONFIG_REGISTRY[encoded.key as ConfigKey].sensitive &&
        !Object.hasOwn(input.values, encoded.key)
      ) {
        const previous = rows.find((row) => row.key === encoded.key);
        encoded.encryptedValue = previous?.encryptedValue ?? encoded.encryptedValue;
      }
    }

    await transaction
      .delete(systemConfigValues)
      .where(eq(systemConfigValues.revisionId, draft.id));
    await transaction
      .insert(systemConfigValues)
      .values(encodedValues);
    const [updated] = await transaction
      .update(systemConfigRevisions)
      .set({
        createdByUserId: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(systemConfigRevisions.id, draft.id))
      .returning();
    return revisionView(updated!);
  });
}

export async function publishConfigurationDraft(input: {
  actorUserId: string;
  baseVersion: number;
  draftRevisionId: string;
  keyring: ConfigKeyring;
}) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${CONFIG_PUBLISH_LOCK}))`,
    );
    const [active] = await transaction
      .select()
      .from(systemConfigRevisions)
      .where(eq(systemConfigRevisions.status, "active"))
      .limit(1);
    const [draft] = await transaction
      .select()
      .from(systemConfigRevisions)
      .where(
        and(
          eq(systemConfigRevisions.id, input.draftRevisionId),
          eq(systemConfigRevisions.status, "draft"),
        ),
      )
      .limit(1);
    if (
      !active ||
      !draft ||
      active.version !== input.baseVersion ||
      draft.baseRevisionId !== active.id
    ) {
      throw new ConfigurationRevisionConflictError();
    }

    const draftRows = await transaction
      .select()
      .from(systemConfigValues)
      .where(eq(systemConfigValues.revisionId, draft.id));
    const values = decodeSnapshot(draftRows, input.keyring);
    const now = new Date();

    await transaction
      .update(systemConfigRevisions)
      .set({ status: "superseded", updatedAt: now })
      .where(eq(systemConfigRevisions.id, active.id));
    const [published] = await transaction
      .update(systemConfigRevisions)
      .set({
        status: "active",
        publishedAt: now,
        publishedByUserId: input.actorUserId,
        updatedAt: now,
      })
      .where(eq(systemConfigRevisions.id, draft.id))
      .returning();

    const versionRows = await transaction
      .select({ version: max(systemConfigRevisions.version) })
      .from(systemConfigRevisions);
    const [nextDraft] = await transaction
      .insert(systemConfigRevisions)
      .values({
        version: (versionRows[0]?.version ?? published!.version) + 1,
        status: "draft",
        baseRevisionId: published!.id,
        createdByUserId: input.actorUserId,
      })
      .returning();
    await transaction
      .insert(systemConfigValues)
      .values(encodeSnapshot(nextDraft!.id, values, input.keyring));
    await transaction.execute(
      sql`SELECT pg_notify('anonresume_system_config', ${String(published!.version)})`,
    );

    return revisionView(published!);
  });
}

export async function createRollbackDraft(input: {
  actorUserId: string;
  keyring: ConfigKeyring;
  sourceRevisionId: string;
}) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${CONFIG_PUBLISH_LOCK}))`,
    );
    const [active] = await transaction
      .select()
      .from(systemConfigRevisions)
      .where(eq(systemConfigRevisions.status, "active"))
      .limit(1);
    const [source] = await transaction
      .select()
      .from(systemConfigRevisions)
      .where(
        and(
          eq(systemConfigRevisions.id, input.sourceRevisionId),
          ne(systemConfigRevisions.status, "draft"),
        ),
      )
      .limit(1);
    if (!active || !source) {
      throw new ConfigurationStateError("configuration_revision_not_found");
    }

    const sourceRows = await transaction
      .select()
      .from(systemConfigValues)
      .where(eq(systemConfigValues.revisionId, source.id));
    const values = decodeSnapshot(sourceRows, input.keyring);
    const versionRows = await transaction
      .select({ version: max(systemConfigRevisions.version) })
      .from(systemConfigRevisions);
    await transaction
      .delete(systemConfigRevisions)
      .where(eq(systemConfigRevisions.status, "draft"));
    const [draft] = await transaction
      .insert(systemConfigRevisions)
      .values({
        version: (versionRows[0]?.version ?? active.version) + 1,
        status: "draft",
        baseRevisionId: active.id,
        createdByUserId: input.actorUserId,
        summary: `Rollback to revision ${source.version}`,
      })
      .returning();
    await transaction
      .insert(systemConfigValues)
      .values(encodeSnapshot(draft!.id, values, input.keyring));
    return revisionView(draft!);
  });
}

export async function readActiveConfigSnapshot(input: {
  keyring: ConfigKeyring;
}): Promise<ConfigSnapshot> {
  const revisions = await db
    .select()
    .from(systemConfigRevisions)
    .where(ne(systemConfigRevisions.status, "draft"))
    .orderBy(desc(systemConfigRevisions.version));
  const active = revisions.find((revision) => revision.status === "active");
  const candidates = active
    ? [
        active,
        ...revisions.filter((revision) => revision.status === "superseded"),
      ]
    : revisions;

  for (const revision of candidates) {
    try {
      return {
        desiredRevisionId: active?.id ?? null,
        fallbackRevisionId:
          active && revision.id !== active.id ? revision.id : null,
        id: revision.id,
        lastError:
          active && revision.id !== active.id
            ? "active_revision_unreadable"
            : null,
        values: await readRevisionValues(revision.id, input.keyring),
        version: revision.version,
      };
    } catch {
      continue;
    }
  }

  return {
    desiredRevisionId: active?.id ?? null,
    fallbackRevisionId: null,
    id: null,
    lastError: "no_readable_revision",
    values: getManagedConfigDefaults(),
    version: null,
  };
}
