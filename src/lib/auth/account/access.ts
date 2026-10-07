import { getAccountLifecycle } from "./repository";
import type {
  AccountLifecycleSnapshot,
  AccountLifecycleStatus,
} from "./types";

export class AccountProductAccessError extends Error {
  constructor(public readonly status: Exclude<AccountLifecycleStatus, "active">) {
    super(`account_${status}`);
    this.name = "AccountProductAccessError";
  }
}

export async function assertActiveProductAccount(
  userId: string,
): Promise<AccountLifecycleSnapshot> {
  const lifecycle = await getAccountLifecycle(userId);
  if (lifecycle.status !== "active") {
    throw new AccountProductAccessError(lifecycle.status);
  }
  return lifecycle;
}
