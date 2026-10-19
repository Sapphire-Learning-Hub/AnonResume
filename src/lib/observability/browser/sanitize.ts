import { clientEventSchema, type ClientDiagnosticEvent } from "./schema";

export function sanitizeClientError(
  error: unknown,
  kind: ClientDiagnosticEvent["kind"],
  origin: string,
  buildId: string,
): ClientDiagnosticEvent | undefined {
  if (!(error instanceof Error)) return;
  const frames: ClientDiagnosticEvent["frames"] = [];
  for (const line of error.stack?.slice(0, 16384).split("\n").slice(1, 40) ??
    []) {
    const match = line.match(/(https?:\/\/[^\s()]+):(\d+):(\d+)\)?$/);
    if (!match) continue;
    try {
      const url = new URL(match[1]!);
      if (url.origin !== origin || url.search || url.hash) continue;
      const frame = {
        asset: url.pathname,
        line: Number(match[2]),
        column: Number(match[3]),
      };
      if (
        /^\/_next\/static\/[a-zA-Z0-9_./-]+\.js$/.test(frame.asset) &&
        !frame.asset.includes("..")
      )
        frames.push(frame);
    } catch {
      /* Ignore non-application frames. */
    }
    if (frames.length === 16) break;
  }
  const digest =
    "digest" in error &&
    typeof error.digest === "string" &&
    /^[a-zA-Z0-9_-]{1,128}$/.test(error.digest)
      ? error.digest
      : undefined;
  const event = clientEventSchema.safeParse({
    eventId: crypto.randomUUID(),
    kind,
    buildId,
    errorType: error.name,
    frames,
    ...(digest ? { digest } : {}),
  });
  return event.success ? event.data : undefined;
}
