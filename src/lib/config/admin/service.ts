import { desc } from "drizzle-orm";

import {
  db,
  systemConfigRuntimeStates,
} from "@/db";
import {
  createAdminAuditChanges,
  writeAdminAuditEvent,
} from "@/lib/admin/audit";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { createConfigKeyring, type ConfigKeyring } from "@/lib/config/crypto";
import {
  CONFIG_REGISTRY,
  type ConfigKey,
  type ManagedConfig,
} from "@/lib/config/registry";
import {
  createRollbackDraft,
  ensureConfigurationState,
  getConfigurationState,
  publishConfigurationDraft,
  readConfigurationRevisionValues,
  updateConfigurationDraft,
} from "@/lib/config/store";
import type { ConfigConsumer } from "@/lib/config/types";

import type {
  ConfigurationAuditContext,
  ManagedConfigurationHistoryChange,
  ManagedConfigurationRevisionView,
  ManagedConfigurationView,
} from "./types";
import {
  applyConfigurationChanges,
  parseConfigurationDraftPatch,
  type ConfigurationDraftPatch,
} from "./validation";

interface KeyringInput {
  keyring?: ConfigKeyring;
}

interface ActorInput extends ConfigurationAuditContext, KeyringInput {
  actorUserId: string;
}

function resolveKeyring(keyring?: ConfigKeyring) {
  if (keyring) return keyring;
  const bootstrap = readBootstrapConfig();
  return createConfigKeyring({
    current: bootstrap.currentMasterKey,
    ...(bootstrap.previousMasterKey
      ? { previous: bootstrap.previousMasterKey }
      : {}),
  });
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function configurationSnapshotChanges(
  before: ManagedConfig,
  after: ManagedConfig,
): ManagedConfigurationHistoryChange[] {
  const changes: ManagedConfigurationHistoryChange[] = [];

  for (const key of Object.keys(CONFIG_REGISTRY) as ConfigKey[]) {
    if (valuesEqual(before[key], after[key])) continue;

    if (CONFIG_REGISTRY[key].sensitive) {
      changes.push({
        field: key,
        operation: after[key] ? "set" : "clear",
        sensitive: true,
      });
      continue;
    }

    changes.push({
      after: after[key],
      before: before[key],
      field: key,
    });
  }

  return changes;
}

async function currentValues(keyring: ConfigKeyring, revisionId: string) {
  return readConfigurationRevisionValues({ keyring, revisionId });
}

function nonSensitiveChanges(
  before: ManagedConfig,
  after: ManagedConfig,
  keys: readonly ConfigKey[],
) {
  const beforeValues: Record<string, unknown> = {};
  const afterValues: Record<string, unknown> = {};
  for (const key of keys) {
    if (CONFIG_REGISTRY[key].sensitive) continue;
    beforeValues[key] = before[key];
    afterValues[key] = after[key];
  }
  return createAdminAuditChanges(beforeValues, afterValues);
}

function secretChanges(changes: ConfigurationDraftPatch["changes"]) {
  return changes.flatMap((change) =>
    CONFIG_REGISTRY[change.key].sensitive
      ? [{ key: change.key, operation: change.operation }]
      : [],
  );
}

async function pendingRestartConsumers() {
  const states = await db
    .select()
    .from(systemConfigRuntimeStates)
    .orderBy(desc(systemConfigRuntimeStates.lastSeenAt));
  const seen = new Set<ConfigConsumer>();
  const pending: ConfigConsumer[] = [];

  for (const state of states) {
    if (state.metadata.stopped === true || seen.has(state.consumer)) continue;
    seen.add(state.consumer);
    if (state.healthState === "restart_required") {
      pending.push(state.consumer);
    }
  }

  return pending;
}

export async function getManagedConfiguration(
  input: KeyringInput = {},
): Promise<ManagedConfigurationView> {
  const keyring = resolveKeyring(input.keyring);
  await ensureConfigurationState({ keyring });
  const state = await getConfigurationState({ keyring });

  return {
    activeRevision: {
      id: state.activeRevision.id,
      version: state.activeRevision.version,
    },
    draftRevision: {
      baseVersion: state.activeRevision.version,
      id: state.draftRevision.id,
      updatedAt: state.draftRevision.updatedAt.toISOString(),
    },
    fields: state.fields,
    pendingRestartConsumers: await pendingRestartConsumers(),
  };
}

export async function patchConfigurationDraft(
  input: ActorInput & ConfigurationDraftPatch,
) {
  const keyring = resolveKeyring(input.keyring);
  const patch = parseConfigurationDraftPatch({
    baseVersion: input.baseVersion,
    changes: input.changes,
    draftRevisionId: input.draftRevisionId,
  });
  await ensureConfigurationState({ keyring });
  const before = await currentValues(keyring, patch.draftRevisionId);
  const candidate = applyConfigurationChanges(before, patch.changes);
  const changedKeys = patch.changes.map((change) => change.key);

  await updateConfigurationDraft({
    actorUserId: input.actorUserId,
    baseVersion: patch.baseVersion,
    draftRevisionId: patch.draftRevisionId,
    keyring,
    values: Object.fromEntries(
      changedKeys.map((key) => [key, candidate[key]]),
    ) as Partial<ManagedConfig>,
  });
  await writeAdminAuditEvent({
    action: "configuration.draft.update",
    actorUserId: input.actorUserId,
    ipHash: input.ipHash,
    metadata: {
      changes: nonSensitiveChanges(before, candidate, changedKeys),
      changedKeys,
      secretChanges: secretChanges(patch.changes),
    },
    outcome: "success",
    requestId: input.requestId,
    targetId: patch.draftRevisionId,
    targetType: "configuration_revision",
  });
  return getManagedConfiguration({ keyring });
}

export async function publishManagedConfiguration(
  input: ActorInput & {
    baseVersion: number;
    draftRevisionId: string;
  },
) {
  const keyring = resolveKeyring(input.keyring);
  const source = await getConfigurationState({ keyring });
  const published = await publishConfigurationDraft({
    actorUserId: input.actorUserId,
    baseVersion: input.baseVersion,
    draftRevisionId: input.draftRevisionId,
    keyring,
  });
  await writeAdminAuditEvent({
    action: "configuration.publish",
    actorUserId: input.actorUserId,
    ipHash: input.ipHash,
    metadata: {
      resultingRevision: published.version,
      sourceRevision: source.activeRevision.version,
    },
    outcome: "success",
    requestId: input.requestId,
    targetId: published.id,
    targetType: "configuration_revision",
  });
  return getManagedConfiguration({ keyring });
}

export async function listConfigurationHistory(
  input: KeyringInput = {},
): Promise<ManagedConfigurationRevisionView[]> {
  const keyring = resolveKeyring(input.keyring);
  await ensureConfigurationState({ keyring });
  const state = await getConfigurationState({ keyring });
  const revisionIds = new Set(
    state.history.flatMap((revision) => [
      revision.id,
      ...(revision.baseRevisionId ? [revision.baseRevisionId] : []),
    ]),
  );
  const valuesByRevision = new Map(
    await Promise.all(
      [...revisionIds].map(async (revisionId) => [
        revisionId,
        await currentValues(keyring, revisionId),
      ] as const),
    ),
  );

  return state.history.map((revision) => ({
    changes: revision.baseRevisionId
      ? configurationSnapshotChanges(
          valuesByRevision.get(revision.baseRevisionId)!,
          valuesByRevision.get(revision.id)!,
        )
      : [],
    createdAt: revision.createdAt.toISOString(),
    createdByUserId: revision.createdByUserId,
    id: revision.id,
    publishedAt: revision.publishedAt?.toISOString() ?? null,
    publishedByUserId: revision.publishedByUserId,
    status: revision.status,
    summary: revision.summary,
    updatedAt: revision.updatedAt.toISOString(),
    version: revision.version,
  }));
}

export async function prepareConfigurationRollback(
  input: ActorInput & { sourceRevisionId: string },
) {
  const keyring = resolveKeyring(input.keyring);
  const sourceHistory = await listConfigurationHistory({ keyring });
  const source = sourceHistory.find(
    (revision) => revision.id === input.sourceRevisionId,
  );
  const draft = await createRollbackDraft({
    actorUserId: input.actorUserId,
    keyring,
    sourceRevisionId: input.sourceRevisionId,
  });
  await writeAdminAuditEvent({
    action: "configuration.rollback",
    actorUserId: input.actorUserId,
    ipHash: input.ipHash,
    metadata: {
      resultingDraftRevision: draft.version,
      sourceRevision: source?.version ?? null,
    },
    outcome: "success",
    requestId: input.requestId,
    targetId: draft.id,
    targetType: "configuration_revision",
  });
  return getManagedConfiguration({ keyring });
}
