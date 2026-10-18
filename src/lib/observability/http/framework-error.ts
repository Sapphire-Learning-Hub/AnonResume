import type { Instrumentation } from "next";

import {
  getLogger,
  runWithLogContext,
  serializeSafeError,
} from "@/lib/observability/logging";

import {
  REQUEST_ID_HEADER,
  resolveRequestIdentity,
  UPSTREAM_REQUEST_ID_HEADER,
} from "./request-id";

const logger = getLogger("anonresume.http");

function readHeader(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  expectedName: string,
) {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName,
  );
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

export const logNextRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  const selectedHeaders = new Headers();
  const requestId = readHeader(request.headers, REQUEST_ID_HEADER);
  const upstreamRequestId = readHeader(
    request.headers,
    UPSTREAM_REQUEST_ID_HEADER,
  );
  if (requestId) {
    selectedHeaders.set(REQUEST_ID_HEADER, requestId);
  }
  if (upstreamRequestId) {
    selectedHeaders.set(UPSTREAM_REQUEST_ID_HEADER, upstreamRequestId);
  }
  const identity = resolveRequestIdentity(selectedHeaders);

  return runWithLogContext(
    {
      method: request.method,
      path: context.routePath,
      requestId: identity.requestId,
      upstreamRequestId: identity.upstreamRequestId,
    },
    () => {
      logger.error(
        "next_request_error",
        {
          error: serializeSafeError(error),
          labels: {
            route_type: context.routeType,
            router_kind: context.routerKind,
          },
          outcome: "failure",
        },
        "Next.js request failed",
      );
    },
  );
};
