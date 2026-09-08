import type { Metadata } from "next";
import type { PropsWithChildren } from "react";

import { createAdminTranslator } from "@/i18n/admin-messages";
import { getRequestLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = createAdminTranslator(await getRequestLocale());
  return {
    title: {
      default: t("shell.console"),
      template: `%s | AnonResume ${t("shell.console")}`,
    },
    robots: { index: false, follow: false },
  };
}

export default function ManagementLayout({ children }: PropsWithChildren) {
  return children;
}
