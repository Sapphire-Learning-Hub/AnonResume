export const MAX_ACTION_REQUEST_BYTES = 64 * 1024;
export const MAX_RESUME_JSON_REQUEST_BYTES = 2 * 1024 * 1024;
export const MAX_RESUME_IMPORT_REQUEST_BYTES = 6 * 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("request_body_too_large");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readLimitedRequestBody(request: Request, maxBytes: number) {
  const contentLength = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10,
  );

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export async function parseLimitedJsonRequest(
  request: Request,
  maxBytes = MAX_RESUME_JSON_REQUEST_BYTES,
) {
  const body = await readLimitedRequestBody(request, maxBytes);

  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export async function parseLimitedFormDataRequest(
  request: Request,
  maxBytes = MAX_RESUME_IMPORT_REQUEST_BYTES,
) {
  const body = await readLimitedRequestBody(request, maxBytes);
  const contentType = request.headers.get("content-type");

  return new Response(body, {
    headers: contentType ? { "content-type": contentType } : undefined,
  }).formData();
}
