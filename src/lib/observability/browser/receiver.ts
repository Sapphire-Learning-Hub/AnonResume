import { createHash } from "node:crypto";
import { getExpectedRequestOrigin } from "@/lib/http/request-origin";
import {
  createDiagnosticContext,
  runWithDiagnosticContext,
} from "@/lib/observability/diagnostics/context";
import { getLogger } from "@/lib/observability/logging";
import { DiagnosticIntakeBudget } from "./limiter";
import { readClientErrorPolicy } from "./policy";
import { clientReportSchema } from "./schema";

const globalState = globalThis as typeof globalThis & {
  __anonresumeIntakeBudget?: DiagnosticIntakeBudget;
};
const logger = getLogger("anonresume.browser");
const reply = (status: number) =>
  new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });

async function readReport(request: Request) {
  if (Number(request.headers.get("content-length")) > 16384) throw 413;
  const reader = request.body?.getReader();
  if (!reader) throw 400;
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(408);
      void reader.cancel().catch(() => undefined);
    }, 5000);
  });
  try {
    while (true) {
      const result = await Promise.race([reader.read(), deadline]);
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 16384) {
        void reader.cancel().catch(() => undefined);
        throw 413;
      }
      chunks.push(result.value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return clientReportSchema.parse(JSON.parse(new TextDecoder().decode(body)));
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function handleClientErrors(
  request: Request,
  budget = (globalState.__anonresumeIntakeBudget ??=
    new DiagnosticIntakeBudget()),
) {
  if (!budget.admit(0)) return reply(429);
  if (request.headers.get("origin") !== getExpectedRequestOrigin(request))
    return reply(403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply(415);
  const enabled = readClientErrorPolicy();
  if (enabled === undefined) return reply(503);
  if (!enabled) return reply(204);
  try {
    const report = await readReport(request);
    if (!budget.admitEvents(report.events.length)) return reply(429);
    const accepted = [];
    for (const event of report.events) {
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(event))
        .digest("hex");
      const result = budget.accept(event.eventId, fingerprint);
      if (!result) return reply(409);
      accepted.push({
        eventId: event.eventId,
        diagnosticId: result.diagnosticId,
      });
      if (result.duplicate) continue;
      runWithDiagnosticContext(
        { ...createDiagnosticContext(), diagnosticId: result.diagnosticId },
        () =>
          logger.error("browser_error_reported", {
            outcome: "failure",
            labels: {
              source: "client_report",
              trust: "unverified",
              kind: event.kind,
            },
            details: {
              "client.event.id": event.eventId,
              "client.build.id": event.buildId,
              "next.error.digest": event.digest ?? null,
              "client.frames": event.frames,
            },
            error: {
              type: event.errorType,
              message: "Browser application error",
              digest: fingerprint.slice(0, 16),
            },
          }),
      );
    }
    return Response.json(
      { accepted },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return reply(
      typeof error === "number" && [400, 408, 413].includes(error)
        ? error
        : 400,
    );
  }
}
