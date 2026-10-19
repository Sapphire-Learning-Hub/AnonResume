"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import {
  getCapturedClientEvent,
  reportClientError,
} from "@/lib/observability/browser/client";
import {
  getDiagnosticDelivery,
  subscribeDiagnosticState,
} from "@/lib/observability/browser/state";

export function DiagnosticReference({
  diagnosticId,
  eventId,
  digest,
}: {
  diagnosticId?: string;
  eventId?: string;
  digest?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const delivery = useSyncExternalStore(
    subscribeDiagnosticState,
    () => (eventId ? getDiagnosticDelivery(eventId) : undefined),
    () => undefined,
  );
  const confirmed =
    diagnosticId ??
    (delivery?.status === "accepted" ? delivery.diagnosticId : undefined);
  const id = confirmed ?? eventId;
  if (!id && !digest) return null;
  return (
    <div className="diagnostic-reference" role="status">
      {id ? (
        <>
          <span>
            {t(
              confirmed
                ? "diagnostics.reference"
                : "diagnostics.localReference",
            )}
          </span>
          <code>{id}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(id)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {t(copied ? "diagnostics.copied" : "diagnostics.copy")}
          </button>
        </>
      ) : null}
      {!confirmed && eventId ? (
        <span>
          {t(
            delivery?.status === "pending"
              ? "diagnostics.pending"
              : "diagnostics.unconfirmed",
          )}
        </span>
      ) : null}
      {digest && /^[a-zA-Z0-9_-]{1,128}$/.test(digest) ? (
        <span>
          {t("diagnostics.fingerprint")} <code>{digest}</code>
        </span>
      ) : null}
    </div>
  );
}

export function RenderErrorDiagnostic({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const eventId = useSyncExternalStore(
    subscribeDiagnosticState,
    () => getCapturedClientEvent(error),
    () => undefined,
  );
  useEffect(() => {
    reportClientError(error, "render");
  }, [error]);
  return <DiagnosticReference eventId={eventId} digest={error.digest} />;
}
