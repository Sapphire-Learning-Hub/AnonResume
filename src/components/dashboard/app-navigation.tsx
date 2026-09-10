import type { MessageKey } from "@/i18n/messages";
import type { AdminPermission } from "@/lib/admin/permissions";
import type { AppShellAccess } from "@/lib/auth/app-shell-access";

export type AppNavigationIcon =
  | "approvals"
  | "audit"
  | "dashboard"
  | "exports"
  | "fonts"
  | "resumes"
  | "roles"
  | "security"
  | "system"
  | "users";

export interface AppNavigationItem {
  href: string;
  icon: AppNavigationIcon;
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
            : !item.permission ||
              access.kind === "super_admin" ||
              access.permissions.includes(item.permission),
        )
        .map((item) => ({
          href: item.href,
          icon: item.icon,
          id: item.id,
          label: translate(item.labelKey),
        })),
    });
  }

  return sections;
}
