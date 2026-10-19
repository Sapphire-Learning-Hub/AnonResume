import { z } from "zod";
import { applicationBuildId } from "@/lib/config/build-metadata";
import type { ClientDiagnosticEvent } from "./schema";
import { sanitizeClientError } from "./sanitize";
import {
  getDiagnosticDelivery,
  setDiagnosticDelivery,
  subscribeDiagnosticState,
} from "./state";

type Pending = { event: ClientDiagnosticEvent; attempts: number };
const queue: Pending[] = [];
const fingerprints = new Map<string, { at: number; id: string }>();
const captured = new WeakMap<Error, string>();
let enabled = true;
let sending = false;
let windowStart = 0;
let sent = 0;
const acknowledgement = z.object({
  accepted: z
    .array(z.object({ eventId: z.uuid(), diagnosticId: z.uuid() }))
    .max(5),
});

export function configureBrowserDiagnostics(value: boolean) {
  enabled = value;
  if (!value)
    for (const item of queue.splice(0))
      setDiagnosticDelivery(item.event.eventId, { status: "unconfirmed" });
}

async function flush() {
  if (sending || !enabled || !queue.length) return;
  const now = Date.now();
  if (now - windowStart >= 60_000) {
    windowStart = now;
    sent = 0;
  }
  if (sent >= 10) {
    for (const item of queue.splice(0))
      setDiagnosticDelivery(item.event.eventId, { status: "unconfirmed" });
    return;
  }
  const item = queue.shift()!;
  sending = true;
  sent++;
  let retry = false;
  try {
    const response = await fetch("/api/diagnostics/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
      body: JSON.stringify({ version: 1, events: [item.event] }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 429) sent = 10;
    if (response.status >= 500) retry = true;
    if (response.status === 202) {
      const ack = acknowledgement.safeParse(
        await response.json().catch(() => null),
      );
      const match = ack.success
        ? ack.data.accepted.find(
            (value) => value.eventId === item.event.eventId,
          )
        : undefined;
      if (match) {
        setDiagnosticDelivery(item.event.eventId, {
          status: "accepted",
          diagnosticId: match.diagnosticId,
        });
        return;
      }
    }
  } catch {
    retry = true;
  } finally {
    sending = false;
    if (retry && item.attempts === 0 && enabled && queue.length < 20) {
      queue.push({ ...item, attempts: 1 });
      setTimeout(() => {
        void flush();
      }, 1000);
    } else {
      if (!getAccepted(item.event.eventId))
        setDiagnosticDelivery(item.event.eventId, { status: "unconfirmed" });
      setTimeout(() => {
        void flush();
      }, 0);
    }
  }
}

function getAccepted(id: string) {
  return getDiagnosticDelivery(id)?.status === "accepted";
}

export function getCapturedClientEvent(error: Error) {
  return captured.get(error);
}
export { subscribeDiagnosticState };

export function reportClientError(
  error: unknown,
  kind: ClientDiagnosticEvent["kind"],
) {
  try {
    return captureClientError(error, kind);
  } catch {
    return undefined;
  }
}

function captureClientError(
  error: unknown,
  kind: ClientDiagnosticEvent["kind"],
) {
  if (!enabled || typeof window === "undefined" || !(error instanceof Error))
    return;
  const prior = captured.get(error);
  if (prior) return prior;
  const event = sanitizeClientError(
    error,
    kind,
    window.location.origin,
    applicationBuildId,
  );
  if (!event) return;
  const now = Date.now();
  for (const [key, value] of fingerprints)
    if (now - value.at >= 60_000) fingerprints.delete(key);
  const fingerprint = JSON.stringify({ ...event, eventId: undefined });
  const duplicate = fingerprints.get(fingerprint);
  if (duplicate) {
    captured.set(error, duplicate.id);
    return duplicate.id;
  }
  if (fingerprints.size >= 128)
    fingerprints.delete(fingerprints.keys().next().value!);
  fingerprints.set(fingerprint, { id: event.eventId, at: now });
  captured.set(error, event.eventId);
  setDiagnosticDelivery(event.eventId, { status: "pending" });
  if (queue.length < 20) {
    queue.push({ event, attempts: 0 });
    void flush();
  } else setDiagnosticDelivery(event.eventId, { status: "unconfirmed" });
  return event.eventId;
}

export function installBrowserDiagnostics() {
  const scope = window as Window & {
    __anonresumeDiagnosticsCleanup?: () => void;
  };
  scope.__anonresumeDiagnosticsCleanup?.();
  const script = (event: ErrorEvent) => {
    reportClientError(event.error, "script");
  };
  const rejection = (event: PromiseRejectionEvent) => {
    reportClientError(event.reason, "promise");
  };
  window.addEventListener("error", script);
  window.addEventListener("unhandledrejection", rejection);
  scope.__anonresumeDiagnosticsCleanup = () => {
    window.removeEventListener("error", script);
    window.removeEventListener("unhandledrejection", rejection);
  };
}
