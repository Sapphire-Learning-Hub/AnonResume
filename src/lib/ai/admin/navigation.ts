import type { AdminPermission } from "@/lib/admin/permissions";

export interface AiAdminRoute {
  href: string;
  id: "ledger" | "providers" | "quotas" | "usage";
  labelKey: "ai.providers" | "ai.quotas" | "ai.usage" | "ai.ledger";
  permissions: readonly AdminPermission[];
}

export const aiAdminRoutes: readonly AiAdminRoute[] = [
  {
    href: "/app/manage/ai/providers",
    id: "providers",
    labelKey: "ai.providers",
    permissions: ["ai.providers.manage"],
  },
  {
    href: "/app/manage/ai/quotas",
    id: "quotas",
    labelKey: "ai.quotas",
    permissions: ["ai.quotas.manage"],
  },
  {
    href: "/app/manage/ai/usage",
    id: "usage",
    labelKey: "ai.usage",
    permissions: ["ai.usage.read", "ai.audit.sensitive.read"],
  },
  {
    href: "/app/manage/ai/ledger",
    id: "ledger",
    labelKey: "ai.ledger",
    permissions: ["ai.usage.read"],
  },
] as const;

export function getAccessibleAiAdminRoutes(context: {
  kind: string;
  permissions?: readonly AdminPermission[];
}) {
  if (context.kind === "super_admin") return aiAdminRoutes;
  const permissions = new Set(context.permissions ?? []);
  return aiAdminRoutes.filter((route) =>
    route.permissions.some((permission) => permissions.has(permission)),
  );
}
