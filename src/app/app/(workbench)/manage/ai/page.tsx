import { redirect } from "next/navigation";

import { AdminAiManager } from "@/components/admin/AdminAiManager";
import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";
import { requireAdminPage } from "@/lib/admin/page";
import type { AdminPermission } from "@/lib/admin/permissions";
import {
  listAiAdminProviders,
  listAiAdminQuotas,
  listAiAdminLedger,
  listAiAdminUsage,
} from "@/lib/ai/admin/service";
import { resolveAiConfiguration } from "@/lib/ai/config/configuration";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";

const AI_PERMISSIONS: AdminPermission[] = [
  "ai.providers.manage",
  "ai.quotas.manage",
  "ai.usage.read",
  "ai.audit.sensitive.read",
];

export default async function ManagementAiPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  const context = await requireAdminPage();
  const allowed = (permission: AdminPermission) =>
    context.kind === "super_admin" || context.permissions.includes(permission);
  if (!AI_PERMISSIONS.some(allowed)) redirect("/app/manage/forbidden");

  const resolved = await searchParams;
  const query = readSearchParam(resolved, "q") ?? "";
  const configuration = resolveAiConfiguration(process.env);
  const canManageProviders = allowed("ai.providers.manage");
  const canManageQuotas = allowed("ai.quotas.manage");
  const canReadUsage = allowed("ai.usage.read");
  const canReadSensitive = allowed("ai.audit.sensitive.read");

  const [providers, quotas, usage, ledger] = await Promise.all([
    canManageProviders
      ? listAiAdminProviders({
          ...parsePageRequest(resolved, { pageParam: "providerPage" }),
          query,
        })
      : Promise.resolve(null),
    canManageQuotas
      ? listAiAdminQuotas(
          {
            ...parsePageRequest(resolved, { pageParam: "quotaPage" }),
            query,
          },
          configuration.defaultMonthlyPoints,
        )
      : Promise.resolve(null),
    canReadUsage || canReadSensitive
      ? listAiAdminUsage({
          ...parsePageRequest(resolved, { pageParam: "usagePage" }),
          query,
        })
      : Promise.resolve(null),
    canReadUsage
      ? listAiAdminLedger({
          ...parsePageRequest(resolved, { pageParam: "ledgerPage" }),
          query,
        })
      : Promise.resolve(null),
  ]);
  const locale = await getRequestLocale();
  const t = createAdminTranslator(locale);

  return (
    <AdminAiManager
      canManageProviders={canManageProviders}
      canManageQuotas={canManageQuotas}
      canReadSensitive={canReadSensitive}
      defaultMonthlyPoints={configuration.defaultMonthlyPoints}
      ledger={ledger ? {
        ...ledger,
        items: ledger.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      } : null}
      providers={providers ? {
        ...providers,
        items: providers.items.map((item) => ({ ...item })),
      } : null}
      quotas={quotas ? {
        ...quotas,
        items: quotas.items.map((item) => ({
          ...item,
          periodStartedAt: item.periodStartedAt?.toISOString() ?? null,
          periodEndsAt: item.periodEndsAt?.toISOString() ?? null,
        })),
      } : null}
      searchParams={resolved}
      title={t("nav.ai")}
      usage={usage ? {
        ...usage,
        items: usage.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          completedAt: item.completedAt?.toISOString() ?? null,
        })),
      } : null}
    />
  );
}
