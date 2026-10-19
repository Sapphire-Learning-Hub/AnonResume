const listeners = new Set<() => void>();
let expired = false;

export function subscribeManagementExpiry(listener: () => void) {
  listeners.add(listener);
  if (expired) listener();
  return () => { listeners.delete(listener); };
}

export async function managementFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = init === undefined ? await fetch(input) : await fetch(input,init);
  if (response.status !== 401 || typeof window === "undefined" || !window.location.pathname.startsWith("/app/manage")) return response;
  const url = new URL(input instanceof Request ? input.url : String(input),window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/manage/") || url.pathname === "/api/manage/session" || url.pathname.startsWith("/api/manage/activation/")) return response;
  if (!expired) {
    expired = true;
    for (const listener of listeners) listener();
  }
  return response;
}
