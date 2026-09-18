import { AdminAiLedger } from "@/components/admin/ai/AdminAiLedger";
import { requireAdminPage } from "@/lib/admin/page";
import { listAiAdminLedger } from "@/lib/ai/admin/service";
import {
  parsePageRequest,
  readSearchParam,
  type PaginationSearchParams,
} from "@/lib/shared/pagination";

export default async function ManagementAiLedgerPage({
  searchParams,
}: {
  searchParams: Promise<PaginationSearchParams>;
}) {
  await requireAdminPage("ai.usage.read");
  const resolved = await searchParams;
  const ledger = await listAiAdminLedger({
    ...parsePageRequest(resolved),
    query: readSearchParam(resolved, "q"),
  });

  return (
    <AdminAiLedger
      ledger={{
        ...ledger,
        items: ledger.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      }}
      searchParams={resolved}
    />
  );
}
