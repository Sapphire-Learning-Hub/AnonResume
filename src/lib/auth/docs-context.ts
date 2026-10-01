import { cache } from "react";

import {
  getAdminAccessForUser,
  isAccountSuspended,
} from "@/lib/admin/store";
import { getOptionalIdentitySession } from "@/lib/auth/session";

export interface DocsViewerContext {
  destinationHref: "/app" | "/app/manage";
  email: string;
  managementOnly: boolean;
  name: string;
}

export const getDocsViewerContext = cache(
  async (): Promise<DocsViewerContext | null> => {
    const identity = await getOptionalIdentitySession();
    if (!identity) return null;

    const [access, suspended] = await Promise.all([
      getAdminAccessForUser(identity.user.id),
      isAccountSuspended(identity.user.id),
    ]);
    if (suspended) return null;

    const managementOnly = access?.kind === "super_admin";
    return {
      destinationHref: managementOnly ? "/app/manage" : "/app",
      email: identity.user.email,
      managementOnly,
      name: identity.user.name?.trim() || identity.user.email,
    };
  },
);
