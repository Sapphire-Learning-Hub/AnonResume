import type { MessageKey } from "@/i18n/messages";
import type { AdminPermission } from "@/lib/admin/permissions";
import type { AppShellAccess } from "@/lib/auth/app-shell-access";
import {
  getAccessibleAiAdminRoutes,
  type AiAdminRoute,
} from "@/lib/ai/admin/navigation";

export type AppNavigationIcon =
  | "ai"
  | "announcements"
  | "approvals"
  | "audit"
  | "configuration"
  | "dashboard"
  | "exports"
  | "fonts"
  | "resumes"
  | "roles"
  | "security"
  | "system"
  | "users";

export interface AppNavigationItem {
  children?: AppNavigationSubItem[];
  href: string;
  icon: AppNavigationIcon;
  id: string;
  label: string;
}

export interface AppNavigationSubItem {
  href: string;
  id: string;
  label: string;
}

export interface AppNavigationSection {
  id: "product" | "management";
  label: string;
  items: AppNavigationItem[];
}

interface ManagementNavigationDefinition {
  href: string;
  icon: AppNavigationIcon;
  id: string;
  labelKey: MessageKey;
  permission?: AdminPermission;
  permissions?: AdminPermission[];
  superOnly?: boolean;
}

const managementItems: ManagementNavigationDefinition[] = [
  {
    href: "/app/manage",
    icon: "dashboard",
    id: "manage-overview",
    labelKey: "management.navigation.overview",
    permission: "overview.read",
  },
  {
    href: "/app/manage/users",
    icon: "users",
    id: "manage-users",
    labelKey: "management.navigation.users",
    permission: "users.read",
  },
  {
    href: "/app/manage/resumes",
    icon: "resumes",
    id: "manage-resumes",
    labelKey: "management.navigation.resumes",
    permission: "resumes.metadata.read",
  },
  {
    href: "/app/manage/exports",
    icon: "exports",
    id: "manage-exports",
    labelKey: "management.navigation.exports",
    permission: "exports.read",
  },
  {
    href: "/app/manage/roles",
    icon: "roles",
    id: "manage-roles",
    labelKey: "management.navigation.roles",
    superOnly: true,
  },
  {
    href: "/app/manage/announcements",
    icon: "announcements",
    id: "manage-announcements",
    labelKey: "management.navigation.announcements",
    permission: "announcements.read",
  },
  {
    href: "/app/manage/ai",
    icon: "ai",
    id: "manage-ai",
    labelKey: "management.navigation.ai",
    permissions: [
      "ai.providers.manage",
      "ai.quotas.manage",
      "ai.usage.read",
      "ai.audit.sensitive.read",
    ],
  },
  {
    href: "/app/manage/audit",
    icon: "audit",
    id: "manage-audit",
    labelKey: "management.navigation.audit",
    permission: "audit.read",
  },
  {
    href: "/app/manage/system",
    icon: "system",
    id: "manage-system",
    labelKey: "management.navigation.system",
    permission: "system.read",
  },
  {
    href: "/app/manage/configuration",
    icon: "configuration",
    id: "manage-configuration",
    labelKey: "management.navigation.configuration",
    permission: "configuration.read",
  },
  {
    href: "/app/manage/mfa-resets",
    icon: "approvals",
    id: "manage-mfa-resets",
    labelKey: "management.navigation.mfaResets",
    superOnly: true,
  },
  {
    href: "/app/manage/security",
    icon: "security",
    id: "manage-security",
    labelKey: "management.navigation.security",
  },
];

const aiNavigationLabelKeys: Record<AiAdminRoute["id"], MessageKey> = {
  providers: "management.navigation.aiProviders",
  quotas: "management.navigation.aiQuotas",
  usage: "management.navigation.aiUsage",
  ledger: "management.navigation.aiLedger",
};

export function buildAppNavigation(
  access: AppShellAccess,
  translate: (key: MessageKey) => string,
): AppNavigationSection[] {
  const sections: AppNavigationSection[] = [];
  if (access.productAccess) {
    sections.push({
      id: "product",
      label: translate("dashboard.resumeManagement"),
      items: [
        {
          href: "/app",
          icon: "resumes",
          id: "resumes",
          label: translate("dashboard.resumeList"),
        },
        {
          href: "/app/fonts",
          icon: "fonts",
          id: "fonts",
          label: translate("fontMarket.navigation"),
        },
        {
          href: "/app/ai",
          icon: "ai",
          id: "ai-settings",
          label: translate("ai.settings.navigation"),
        },
        {
          href: "/app/invitations",
          icon: "users",
          id: "invitations",
          label: translate("invitations.navigation"),
        },
      ],
    });
  }

  if (access.mode === "recovery") {
    const security = managementItems.at(-1)!;
    sections.push({
      id: "management",
      label: translate("management.navigation.section"),
      items: [
        {
          href: security.href,
          icon: security.icon,
          id: security.id,
          label: translate(security.labelKey),
        },
      ],
    });

    return sections;
  }

  if (access.mode === "management") {
    sections.push({
      id: "management",
      label: translate("management.navigation.section"),
      items: managementItems
        .filter((item) =>
          item.superOnly
            ? access.kind === "super_admin"
            : access.kind === "super_admin" ||
              (item.permission
                ? access.permissions.includes(item.permission)
                : item.permissions
                  ? item.permissions.some((permission) =>
                      access.permissions.includes(permission)
                    )
                  : true),
        )
        .map((item) => ({
          children: item.id === "manage-ai"
            ? getAccessibleAiAdminRoutes(access).map((route) => ({
                href: route.href,
                id: `manage-ai-${route.id}`,
                label: translate(aiNavigationLabelKeys[route.id]),
              }))
            : undefined,
          href: item.href,
          icon: item.icon,
          id: item.id,
          label: translate(item.labelKey),
        })),
    });
  }

  return sections;
}
