import { runAccountMaintenance } from "@/lib/auth/account/maintenance";
import {
  deliverAccountMergeNotices,
  runAccountMergeExecutor,
} from "@/lib/auth/account/merge/executor";
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
  const mergeResult = await runAccountMergeExecutor({ limit: 100 });
  const noticeResult = await deliverAccountMergeNotices({ limit: 100 });
  console.info(
    `[AnonResume] Account maintenance completed: processed=${result.processed}, deleted=${result.deleted}, failed=${result.failed}`,
  );
  if (result.failed > 0) process.exitCode = 1;
  console.info(
    `[AnonResume] Account merge maintenance completed: processed=${mergeResult.processed}, completed=${mergeResult.completed}, waiting=${mergeResult.waiting}, failed=${mergeResult.failed}, notices=${noticeResult.delivered}/${noticeResult.processed}`,
  );
  if (mergeResult.failed > 0 || noticeResult.failed > 0) process.exitCode = 1;
} finally {
  await getDatabasePool().end();
}
