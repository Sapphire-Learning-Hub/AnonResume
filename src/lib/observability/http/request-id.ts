export const REQUEST_ID_HEADER = "x-request-id";
export const UPSTREAM_REQUEST_ID_HEADER =
  "x-anonresume-upstream-request-id";

const SAFE_UPSTREAM_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RequestIdentity {
  requestId: string;
  upstreamRequestId?: string;
}

export function createRequestIdentity(headers: Headers): RequestIdentity {
  const candidate = headers.get(REQUEST_ID_HEADER);
  const upstreamRequestId =
    candidate && SAFE_UPSTREAM_REQUEST_ID.test(candidate)
      ? candidate
      : undefined;

  return {
    requestId: crypto.randomUUID(),
    ...(upstreamRequestId ? { upstreamRequestId } : {}),
  };
}

export function resolveRequestIdentity(headers: Headers): RequestIdentity {
  const requestId = headers.get(REQUEST_ID_HEADER);
  if (!requestId || !UUID_REQUEST_ID.test(requestId)) {
    return createRequestIdentity(headers);
  }

  const upstreamCandidate = headers.get(UPSTREAM_REQUEST_ID_HEADER);
  const upstreamRequestId =
    upstreamCandidate && SAFE_UPSTREAM_REQUEST_ID.test(upstreamCandidate)
      ? upstreamCandidate
      : undefined;

  return {
    requestId,
    ...(upstreamRequestId ? { upstreamRequestId } : {}),
  };
}
