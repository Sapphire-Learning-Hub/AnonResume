export const PDF_EXPORT_WORKER_COOKIE = "anonresume_pdf_worker";

export function getBearerToken(headers: Pick<Headers, "get">) {
  const authorization = headers.get("authorization")?.trim();

  if (!authorization) return null;

  const [scheme, token, extra] = authorization.split(/\s+/);

  if (extra || scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}
