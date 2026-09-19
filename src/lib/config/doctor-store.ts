import { desc } from "drizzle-orm";

import {
  db,
  systemConfigRevisions,
  systemConfigRuntimeStates,
} from "@/db";
import {
  inspectBootstrapCredentials,
  readBootstrapConfig,
} from "@/lib/config/bootstrap";
import { createConfigKeyring } from "@/lib/config/crypto";
import type {
  ConfigurationDoctorInput,
  ConfigurationDoctorRuntimeInput,
} from "@/lib/config/doctor";
import {
  countLegacySecrets,
  countUnsupportedSecrets,
} from "@/lib/config/secret-migration";
import { readActiveConfigSnapshot } from "@/lib/config/store";
import type { ConfigConsumer } from "@/lib/config/types";

const DEFAULT_STALE_AFTER_MS = 120_000;

export async function readConfigurationDoctorInput(input: {
  now?: Date;
  staleAfterMs?: number;
} = {}): Promise<ConfigurationDoctorInput> {
  const now = input.now ?? new Date();
  const bootstrap = readBootstrapConfig();
  const keyring = createConfigKeyring({
    current: bootstrap.currentMasterKey,
    previous: bootstrap.previousMasterKey,
  });
  const [revisions, runtimeRows, snapshot, legacySecrets, unsupportedSecrets] =
    await Promise.all([
      db.select().from(systemConfigRevisions)
        .orderBy(desc(systemConfigRevisions.version)),
      db.select().from(systemConfigRuntimeStates)
        .orderBy(desc(systemConfigRuntimeStates.lastSeenAt)),
      readActiveConfigSnapshot({ keyring }),
      countLegacySecrets(),
      countUnsupportedSecrets(),
    ]);
  const versions = new Map(
    revisions.map((revision) => [revision.id, revision.version]),
  );
  const active = revisions.find((revision) => revision.status === "active");
  const draft = revisions.find((revision) => revision.status === "draft");
  const seenConsumers = new Set<ConfigConsumer>();
  const runtimes: ConfigurationDoctorRuntimeInput[] = [];

  for (const row of runtimeRows) {
    if (seenConsumers.has(row.consumer) || row.metadata.stopped === true) {
      continue;
    }
    seenConsumers.add(row.consumer);
    runtimes.push({
      consumer: row.consumer,
      desiredVersion: row.desiredRevisionId
        ? versions.get(row.desiredRevisionId) ?? null
        : null,
      health: row.healthState,
      hotVersion: row.loadedHotRevisionId
        ? versions.get(row.loadedHotRevisionId) ?? null
        : null,
      lastSeenAt: row.lastSeenAt,
      restartVersion: row.loadedRestartRevisionId
        ? versions.get(row.loadedRestartRevisionId) ?? null
        : null,
    });
  }

  return {
    credentials: inspectBootstrapCredentials(),
    legacySecrets,
    now,
    revisions: {
      activeReadable: Boolean(
        active && snapshot.id === active.id && snapshot.lastError === null,
      ),
      activeVersion: active?.version ?? null,
      draftVersion: draft?.version ?? null,
      fallbackVersion: snapshot.fallbackRevisionId
        ? versions.get(snapshot.fallbackRevisionId) ?? null
        : null,
    },
    runtimes,
    staleAfterMs: input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
    unsupportedSecrets,
  };
}
