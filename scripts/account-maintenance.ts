import { runAccountMaintenance } from "@/lib/auth/account/maintenance";
import { getDatabasePool } from "@/lib/runtime/database";
import { sendAccountSecurityNotice } from "@/lib/runtime/email";

try {
  const result = await runAccountMaintenance({
    limit: 100,
    notifyDeleted: ({ email, name }) =>
      sendAccountSecurityNotice({
        email,
        name,
        event: "account_deleted",
        locale: "zh-CN",
      }),
  });
  console.info(
    `[AnonResume] Account maintenance completed: processed=${result.processed}, deleted=${result.deleted}, failed=${result.failed}`,
  );
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await getDatabasePool().end();
}
