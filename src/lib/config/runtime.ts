import { randomUUID } from "node:crypto";

import { db, systemConfigRuntimeStates } from "@/db";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { createConfigKeyring, type ConfigKeyring } from "@/lib/config/crypto";
import {
  classifyConfigurationHealth,
  type ManagedConfigurationHealthState,
} from "@/lib/config/health";
import {
  PostgresConfigurationNotifier,
  type ConfigurationNotifier,
} from "@/lib/config/notifications";
import {
  CONFIG_REGISTRY,
  parseManagedConfig,
  type ConfigKey,
  type ManagedConfig,
} from "@/lib/config/registry";
import {
  ensureConfigurationState,
  readActiveConfigSnapshot,
  type ConfigSnapshot,
} from "@/lib/config/store";
import type { ConfigConsumer } from "@/lib/config/types";
import { getApplicationRelease } from "@/lib/runtime/release-metadata";

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface RuntimeConfigSnapshot {
  consumer: ConfigConsumer;
  desiredRevisionId: string | null;
  fallbackRevisionId: string | null;
  health: ManagedConfigurationHealthState;
  hotRevisionId: string | null;
  instanceId: string;
  lastError: string | null;
  restartRevisionId: string | null;
  values: Readonly<ManagedConfig>;
}

interface RuntimeConfigManagerOptions {
  consumer: ConfigConsumer;
  instanceId?: string;
  keyring: ConfigKeyring;
  notifier?: ConfigurationNotifier;
  now?: () => Date;
  pollIntervalMs?: number;
  release?: string;
}

function frozenValues(values: ManagedConfig): Readonly<ManagedConfig> {
  const cloned = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      Array.isArray(value) ? Object.freeze([...value]) : value,
    ]),
  );
  return Object.freeze(parseManagedConfig(cloned));
}

function freezeSnapshot(
  snapshot: RuntimeConfigSnapshot,
): RuntimeConfigSnapshot {
  return Object.freeze({
    ...snapshot,
    values: frozenValues(snapshot.values as ManagedConfig),
  });
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function restartRequired(
  loaded: ManagedConfig,
  restartValues: ManagedConfig,
) {
  return (Object.keys(CONFIG_REGISTRY) as ConfigKey[]).some(
    (key) =>
      CONFIG_REGISTRY[key].applyMode === "restart" &&
      !valuesEqual(loaded[key], restartValues[key]),
  );
}

function mergeHotValues(
  loaded: ManagedConfig,
  restartValues: ManagedConfig,
) {
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(CONFIG_REGISTRY) as ConfigKey[]) {
    values[key] =
      CONFIG_REGISTRY[key].applyMode === "hot"
        ? loaded[key]
        : restartValues[key];
  }
  return parseManagedConfig(values);
}

export class RuntimeConfigManager {
  private readonly consumer: ConfigConsumer;
  private readonly instanceId: string;
  private readonly keyring: ConfigKeyring;
  private readonly notifier: ConfigurationNotifier;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly release: string;
  private readonly startedAt: Date;
  private current: RuntimeConfigSnapshot | null = null;
  private restartValues: ManagedConfig | null = null;
  private lastCheckedAt = 0;
  private refreshPromise: Promise<void> | null = null;
  private started = false;

  constructor(options: RuntimeConfigManagerOptions) {
    this.consumer = options.consumer;
    this.instanceId = options.instanceId ?? randomUUID();
    this.keyring = options.keyring;
    this.notifier = options.notifier ?? new PostgresConfigurationNotifier();
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.release = options.release ?? getApplicationRelease();
    this.startedAt = this.now();
  }

  async start() {
    if (this.started) return;
    await ensureConfigurationState({ keyring: this.keyring });
    const resolved = await readActiveConfigSnapshot({ keyring: this.keyring });
    this.installInitialSnapshot(resolved);
    this.started = true;
    this.lastCheckedAt = this.now().getTime();

    try {
      await this.notifier.start(() => {
        void this.refreshNow().catch(() => undefined);
      });
    } catch {
      this.current = freezeSnapshot({
        ...this.current!,
        health: "degraded",
        lastError: "configuration_notifications_unavailable",
      });
    }
    await this.persistState();
  }

  async snapshot() {
    if (!this.started) await this.start();
    return this.current!;
  }

  async refreshIfDue(now = this.now()) {
    if (!this.started) await this.start();
    if (now.getTime() - this.lastCheckedAt < this.pollIntervalMs) return;
    await this.refreshNow(now);
  }

  async stop() {
    if (!this.started) return;
    await this.notifier.stop();
    await this.persistState({ stopped: true });
    this.started = false;
  }

  private installInitialSnapshot(resolved: ConfigSnapshot) {
    this.restartValues = resolved.values;
    this.current = freezeSnapshot({
      consumer: this.consumer,
      desiredRevisionId: resolved.desiredRevisionId,
      fallbackRevisionId: resolved.fallbackRevisionId,
      health: classifyConfigurationHealth({
        recoveryRequired: Boolean(resolved.lastError),
      }) as ManagedConfigurationHealthState,
      hotRevisionId: resolved.id,
      instanceId: this.instanceId,
      lastError: resolved.lastError,
      restartRevisionId: resolved.id,
      values: resolved.values,
    });
  }

  private async refreshNow(now = this.now()) {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh(now).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh(now: Date) {
    this.lastCheckedAt = now.getTime();
    try {
      const resolved = await readActiveConfigSnapshot({ keyring: this.keyring });
      if (resolved.lastError) {
        this.current = freezeSnapshot({
          ...this.current!,
          desiredRevisionId: resolved.desiredRevisionId,
          fallbackRevisionId:
            resolved.fallbackRevisionId ?? this.current!.hotRevisionId,
          health: "recovery_required",
          lastError: resolved.lastError,
        });
      } else {
        const requiresRestart = restartRequired(
          resolved.values,
          this.restartValues!,
        );
        this.current = freezeSnapshot({
          consumer: this.consumer,
          desiredRevisionId: resolved.desiredRevisionId,
          fallbackRevisionId: null,
          health: classifyConfigurationHealth({
            restartRequired: requiresRestart,
          }) as ManagedConfigurationHealthState,
          hotRevisionId: resolved.id,
          instanceId: this.instanceId,
          lastError: null,
          restartRevisionId: this.current!.restartRevisionId,
          values: mergeHotValues(resolved.values, this.restartValues!),
        });
      }
    } catch {
      this.current = freezeSnapshot({
        ...this.current!,
        health: "recovery_required",
        lastError: "configuration_refresh_failed",
      });
    }
    await this.persistState();
  }

  private async persistState(metadata: Record<string, unknown> = {}) {
    if (!this.current) return;
    const state = this.current;
    await db
      .insert(systemConfigRuntimeStates)
      .values({
        instanceId: this.instanceId,
        consumer: this.consumer,
        release: this.release,
        startedAt: this.startedAt,
        desiredRevisionId: state.desiredRevisionId,
        loadedHotRevisionId: state.hotRevisionId,
        loadedRestartRevisionId: state.restartRevisionId,
        fallbackRevisionId: state.fallbackRevisionId,
        healthState: state.health,
        lastSeenAt: this.now(),
        lastError: state.lastError,
        metadata: {
          configurationPollIntervalMs: this.pollIntervalMs,
          ...metadata,
        },
      })
      .onConflictDoUpdate({
        target: systemConfigRuntimeStates.instanceId,
        set: {
          consumer: this.consumer,
          release: this.release,
          desiredRevisionId: state.desiredRevisionId,
          loadedHotRevisionId: state.hotRevisionId,
          loadedRestartRevisionId: state.restartRevisionId,
          fallbackRevisionId: state.fallbackRevisionId,
          healthState: state.health,
          lastSeenAt: this.now(),
          lastError: state.lastError,
          metadata: {
            configurationPollIntervalMs: this.pollIntervalMs,
            ...metadata,
          },
        },
      });
  }
}

declare global {
  var __anonResumeRuntimeConfigManagers:
    | Partial<Record<ConfigConsumer, RuntimeConfigManager>>
    | undefined;
}

export function getRuntimeConfigManager(consumer: ConfigConsumer = "web") {
  globalThis.__anonResumeRuntimeConfigManagers ??= {};
  const existing = globalThis.__anonResumeRuntimeConfigManagers[consumer];
  if (existing) return existing;

  const bootstrap = readBootstrapConfig();
  const manager = new RuntimeConfigManager({
    consumer,
    keyring: createConfigKeyring({
      current: bootstrap.currentMasterKey,
      previous: bootstrap.previousMasterKey,
    }),
  });
  globalThis.__anonResumeRuntimeConfigManagers[consumer] = manager;
  return manager;
}

export async function getRuntimeConfig(consumer: ConfigConsumer = "web") {
  return getRuntimeConfigManager(consumer).snapshot();
}
