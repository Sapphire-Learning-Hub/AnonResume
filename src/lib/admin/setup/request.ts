import { getBootstrapNodeEnvironment } from "@/lib/config/bootstrap";

export const SETUP_SESSION_COOKIE = "anonresume.setup";
export const SETUP_SESSION_MAX_AGE_SECONDS = 30 * 60;

export function getSetupRequestSource(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedIp = request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return forwardedIp || "unknown";
}

export function getSetupSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: getBootstrapNodeEnvironment() === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SETUP_SESSION_MAX_AGE_SECONDS,
    expires: expiresAt,
  };
}

export function getSetupSessionClearCookieOptions() {
  return {
    ...getSetupSessionCookieOptions(new Date(0)),
    maxAge: 0,
  };
}
