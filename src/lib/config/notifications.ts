import type { Notification, PoolClient } from "pg";

import { getDatabasePool } from "@/lib/runtime/database";

const CONFIGURATION_CHANNEL = "anonresume_system_config";
const MAX_RECONNECT_DELAY_MS = 30_000;

export interface ConfigurationNotifier {
  start(listener: () => void): Promise<void>;
  stop(): Promise<void>;
}

export class PostgresConfigurationNotifier
  implements ConfigurationNotifier
{
  private client: PoolClient | null = null;
  private listener: (() => void) | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  async start(listener: () => void) {
    if (!this.stopped) return;
    this.listener = listener;
    this.stopped = false;
    await this.connect();
  }

  async stop() {
    this.stopped = true;
    this.listener = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const client = this.client;
    this.client = null;
    if (!client) return;

    client.removeAllListeners("notification");
    client.removeAllListeners("error");
    try {
      await client.query(`UNLISTEN ${CONFIGURATION_CHANNEL}`);
    } finally {
      client.release();
    }
  }

  private async connect() {
    const client = await getDatabasePool().connect();
    if (this.stopped) {
      client.release();
      return;
    }

    this.client = client;
    client.on("notification", this.handleNotification);
    client.once("error", this.handleConnectionFailure);
    try {
      await client.query(`LISTEN ${CONFIGURATION_CHANNEL}`);
      this.reconnectAttempt = 0;
    } catch (error) {
      this.releaseClient(client, true);
      this.scheduleReconnect();
      throw error;
    }
  }

  private readonly handleNotification = (notification: Notification) => {
    if (notification.channel === CONFIGURATION_CHANNEL) {
      this.listener?.();
    }
  };

  private readonly handleConnectionFailure = () => {
    if (this.client) this.releaseClient(this.client, true);
    this.scheduleReconnect();
  };

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;

    const delay = Math.min(
      1_000 * 2 ** this.reconnectAttempt,
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(this.handleConnectionFailure);
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private releaseClient(client: PoolClient, destroy: boolean) {
    client.removeAllListeners("notification");
    client.removeAllListeners("error");
    if (this.client === client) this.client = null;
    client.release(destroy);
  }
}
