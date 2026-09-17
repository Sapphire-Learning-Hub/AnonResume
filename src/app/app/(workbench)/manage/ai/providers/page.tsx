import { AdminAiProviders } from "@/components/admin/ai/AdminAiProviders";
import { requireAdminPage } from "@/lib/admin/page";
import { listAiAdminProviders } from "@/lib/ai/admin/service";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";

export default async function ManagementAiProvidersPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  await requireAdminPage("ai.providers.manage");
  const resolved = await searchParams;
  const providers = await listAiAdminProviders({
    ...parsePageRequest(resolved),
    query: readSearchParam(resolved, "q"),
  });

  return <AdminAiProviders providers={providers} searchParams={resolved} />;
}
