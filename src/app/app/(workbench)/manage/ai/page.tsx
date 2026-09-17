import { redirect } from "next/navigation";

import { requireAdminPage } from "@/lib/admin/page";
import { getAccessibleAiAdminRoutes } from "@/lib/ai/admin/navigation";

export default async function ManagementAiPage() {
  const context = await requireAdminPage();
  const destination = getAccessibleAiAdminRoutes(context)[0]?.href;
  redirect(destination ?? "/app/manage/forbidden");
}
