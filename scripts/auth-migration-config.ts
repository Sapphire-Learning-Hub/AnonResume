import { betterAuth } from "better-auth";

import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { getDatabasePool } from "@/lib/runtime/database";

// Schema migration must not depend on platform configuration tables that may
// not exist yet. Runtime authentication remains configured in src/lib/auth.
export const auth = betterAuth({
  database: getDatabasePool(),
  secret: readBootstrapConfig().authSecret,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
});
