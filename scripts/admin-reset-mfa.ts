import { resetSuperAdminMfa } from "@/lib/admin/maintenance";
import { getDatabasePool } from "@/lib/runtime/database";

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const confirmed = process.argv.includes("--confirm");

if (!email || !confirmed) {
  console.error(
    "Usage: bun run admin:reset-mfa --email <super-admin-email> --confirm",
  );
  process.exitCode = 2;
} else {
  try {
    const result = await resetSuperAdminMfa(email);
    console.info(
      `MFA reset activation sent for super-admin ${result.userId}. All sessions were revoked.`,
    );
  } finally {
    await getDatabasePool().end();
  }
}
