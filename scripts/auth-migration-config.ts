import { betterAuth } from "better-auth";

import { getDatabasePool } from "@/lib/runtime/database";

// Schema migration must not depend on platform configuration tables that may
// not exist yet. Runtime authentication remains configured in src/lib/auth.
export const auth = betterAuth({
  database: getDatabasePool(),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
});
