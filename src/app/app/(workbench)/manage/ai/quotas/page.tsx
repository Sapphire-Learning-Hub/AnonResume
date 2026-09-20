import { AdminAiQuotas } from "@/components/admin/ai/AdminAiQuotas";
import { requireAdminPage } from "@/lib/admin/page";
import { listAiAdminQuotas } from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import { getRuntimeConfig } from "@/lib/config/runtime";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";

export default async function ManagementAiQuotasPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  await requireAdminPage("ai.quotas.manage");
  const resolved = await searchParams;
  const runtime = await getRuntimeConfig("web");
  const configuration = resolveAiConfiguration(runtime.values);
  const quotas = await listAiAdminQuotas(
    {
      ...parsePageRequest(resolved),
      query: readSearchParam(resolved, "q"),
    },
    configuration.defaultMonthlyPoints,
  );

  return (
    <AdminAiQuotas
      defaultMonthlyPoints={configuration.defaultMonthlyPoints}
      quotas={{
        ...quotas,
        items: quotas.items.map((item) => ({
          ...item,
          periodStartedAt: item.periodStartedAt?.toISOString() ?? null,
          periodEndsAt: item.periodEndsAt?.toISOString() ?? null,
        })),
      }}
      searchParams={resolved}
    />
  );
}
