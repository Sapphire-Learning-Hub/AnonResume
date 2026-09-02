import { cookies } from "next/headers";

import {
  defaultLocale,
  getMessages,
  localeCookieName,
  resolveLocale,
} from "./messages";

export async function getRequestLocale() {
  try {
    const cookieStore = await cookies();

    return resolveLocale(cookieStore.get(localeCookieName)?.value);
  } catch {
    return defaultLocale;
  }
}

export async function getRequestMessages() {
  return getMessages(await getRequestLocale());
}
