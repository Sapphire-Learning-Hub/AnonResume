import { redirect } from "next/navigation";

import { AdminAiUsage } from "@/components/admin/ai/AdminAiUsage";
import { requireAdminPage } from "@/lib/admin/page";
import { listAiAdminUsage } from "@/lib/ai/admin/service";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";

export default async function ManagementAiUsagePage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const context = await requireAdminPage();
  const allowed = (permission: "ai.audit.sensitive.read" | "ai.quotas.manage" | "ai.usage.read") =>
    context.kind === "super_admin" || context.permissions.includes(permission);
  const canManageQuotas = allowed("ai.quotas.manage");
  const canReadSensitive = allowed("ai.audit.sensitive.read");
  if (!allowed("ai.usage.read") && !canReadSensitive) {
    redirect("/app/manage/forbidden");
  }

  const resolved = await searchParams;
  const usage = await listAiAdminUsage({
    ...parsePageRequest(resolved),
    query: readSearchParam(resolved, "q"),
  });

  return (
    <AdminAiUsage
      canManageQuotas={canManageQuotas}
      canReadSensitive={canReadSensitive}
      searchParams={resolved}
      usage={{
        ...usage,
        items: usage.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          completedAt: item.completedAt?.toISOString() ?? null,
        })),
      }}
    />
  );
}
