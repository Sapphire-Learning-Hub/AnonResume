import {
  getLogger,
  runWithLogContext,
  serializeSafeError,
} from "@/lib/observability/logging";

import {
  REQUEST_ID_HEADER,
  resolveRequestIdentity,
} from "./request-id";

const logger = getLogger("anonresume.http");

export interface RequestLoggingOptions {
  suppressSuccessfulAccessLog?: boolean;
}

type RouteHandler<
  TArguments extends readonly unknown[],
  TResponse extends Response,
> = (
  ...arguments_: TArguments
) => TResponse | Promise<TResponse>;

function elapsedNanoseconds(startedAt: number) {
  return Math.max(0, Math.round((performance.now() - startedAt) * 1_000_000));
}

function correlateResponse<TResponse extends Response>(
  response: TResponse,
  requestId: string,
): TResponse;
function correlateResponse(response: Response, requestId: string): Response {
  try {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
}

export function withRequestLogging<
  TArguments extends readonly unknown[],
  TResponse extends Response,
>(
  routePattern: string,
  handler: RouteHandler<TArguments, TResponse>,
  options: RequestLoggingOptions = {},
) {
  return async (...arguments_: TArguments): Promise<TResponse> => {
    const request = arguments_[0] instanceof Request
      ? arguments_[0]
      : new Request(new URL(routePattern, "http://localhost"));
    const identity = resolveRequestIdentity(request.headers);
    const startedAt = performance.now();
    const logContext = {
      method: request.method,
      path: routePattern,
      requestId: identity.requestId,
      upstreamRequestId: identity.upstreamRequestId,
    };

    return runWithLogContext(logContext, async () => {
      try {
        const response = correlateResponse(
          await handler(...arguments_),
          identity.requestId,
        );
        const failed = response.status >= 400;

        if (!(options.suppressSuccessfulAccessLog && !failed)) {
          const fields = {
            durationNs: elapsedNanoseconds(startedAt),
            outcome: failed ? "failure" as const : "success" as const,
            statusCode: response.status,
          };

          if (response.status >= 500) {
            logger.error(
              "http_request_completed",
              fields,
              "HTTP request completed with a server error",
            );
          } else if (failed) {
            logger.warn(
              "http_request_completed",
              fields,
              "HTTP request completed with a client error",
            );
          } else {
            logger.info(
              "http_request_completed",
              fields,
              "HTTP request completed",
            );
          }
        }

        return response;
      } catch (error) {
        logger.error(
          "http_request_failed",
          {
            durationNs: elapsedNanoseconds(startedAt),
            error: serializeSafeError(error),
            outcome: "failure",
          },
          "HTTP request failed",
        );
        throw error;
      }
    });
  };
}
