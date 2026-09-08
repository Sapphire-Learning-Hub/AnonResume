import { repairSuperAdminSingleton } from "@/lib/admin-maintenance";
import { getDatabasePool } from "@/lib/database";

const keepIndex = process.argv.indexOf("--keep");
const keepUserId = keepIndex >= 0 ? process.argv[keepIndex + 1] : undefined;

if (!keepUserId) {
  console.error("Usage: bun run admin:repair-super-admin --keep <user-id>");
  process.exitCode = 2;
} else {
  try {
    const result = await repairSuperAdminSingleton(keepUserId);
    console.info(JSON.stringify(result, null, 2));
  } finally {
    await getDatabasePool().end();
  }
}
