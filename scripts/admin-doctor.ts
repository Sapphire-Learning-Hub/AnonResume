import { diagnoseAdminState } from "@/lib/admin/maintenance";
import { getDatabasePool } from "@/lib/runtime/database";

try {
  const report = await diagnoseAdminState();
  console.info(JSON.stringify(report, null, 2));
  if (!report.healthy) process.exitCode = 1;
} finally {
  await getDatabasePool().end();
}
