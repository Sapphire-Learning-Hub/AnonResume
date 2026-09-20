import {
  bootstrapSuperAdminForTerminal,
} from "@/lib/admin/bootstrap";
import { isValidAdminEmail } from "@/lib/admin/configuration";
import { readBootstrapConfig } from "@/lib/config/bootstrap";
import { getDatabasePool } from "@/lib/runtime/database";

const email = process.argv[2]?.trim().toLowerCase();
if (!isValidAdminEmail(email)) {
  throw new Error("Usage: bootstrap-admin <valid-email-address>");
}

try {
  const bootstrap = readBootstrapConfig();
  const result = await bootstrapSuperAdminForTerminal({
    email: email!,
    applicationOrigin: bootstrap.applicationOrigin,
  });

  if (result.state === "existing") {
    console.info("A super-admin is already active; no activation link was created.");
  } else {
    console.info(result.activationUrl);
  }
} finally {
  await getDatabasePool().end();
}
